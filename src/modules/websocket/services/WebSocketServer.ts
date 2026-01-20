import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { JwtValidator, WorkspaceDiscovery } from '@/modules/auth';
import { EventCoordinator } from '@/modules/infrastructure';
import { logger } from '@/core/logger';
import { AuthenticatedUser, LovableMessage } from '@/types';

interface ConnectedClient {
  socket: Socket;
  user: AuthenticatedUser;
  connectedAt: Date;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private jwtValidator: JwtValidator;
  private workspaceDiscovery: WorkspaceDiscovery;
  private eventCoordinator: EventCoordinator;
  private clients = new Map<string, ConnectedClient>();

  constructor(httpServer: HttpServer, eventCoordinator: EventCoordinator) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*", // In production, restrict to your domains
        methods: ["GET", "POST"],
      },
      transports: ['websocket', 'polling'],
    });

    this.jwtValidator = new JwtValidator();
    this.workspaceDiscovery = new WorkspaceDiscovery();
    this.eventCoordinator = eventCoordinator;

    this.setupEventHandlers();
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', async (socket: Socket) => {
      try {
        logger.info('New WebSocket connection attempt', { socketId: socket.id });

        // Authenticate the connection
        const authResult = await this.authenticateSocket(socket);
        if (!authResult) {
          socket.disconnect(true);
          return;
        }

        // Register the client
        this.registerClient(socket, authResult);

        // Setup client-specific event handlers
        this.setupClientHandlers(socket, authResult);

        logger.info('WebSocket client authenticated and registered', {
          socketId: socket.id,
          userId: authResult.user.id,
          workspaceId: authResult.workspace.id,
        });

      } catch (error) {
        logger.error('Error handling WebSocket connection', {
          socketId: socket.id,
          error: error.message,
        });
        socket.disconnect(true);
      }
    });
  }

  /**
   * Authenticate socket connection using JWT token
   */
  private async authenticateSocket(socket: Socket): Promise<AuthenticatedUser | null> {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        logger.warn('No token provided in socket handshake', { socketId: socket.id });
        return null;
      }

      const authResult = await this.jwtValidator.validateToken(token);
      return authResult;
    } catch (error) {
      logger.error('Socket authentication failed', {
        socketId: socket.id,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Register authenticated client
   */
  private registerClient(socket: Socket, authResult: AuthenticatedUser): void {
    const client: ConnectedClient = {
      socket,
      user: authResult,
      connectedAt: new Date(),
    };

    this.clients.set(socket.id, client);

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId: authResult.user.id,
      });
      this.clients.delete(socket.id);
    });
  }

  /**
   * Setup event handlers for authenticated client
   */
  private setupClientHandlers(socket: Socket, authResult: AuthenticatedUser): void {
    // Handle sendMessage command
    socket.on('sendMessage', async (data: LovableMessage) => {
      if (data.type !== 'sendMessage') return;

      try {
        await this.handleSendMessage(socket, authResult, data);
      } catch (error) {
        logger.error('Error handling sendMessage', {
          socketId: socket.id,
          error: error.message,
          data,
        });
        socket.emit('error', { type: 'sendMessage', message: error.message });
      }
    });

    // Handle markAsRead command
    socket.on('markAsRead', async (data: LovableMessage) => {
      if (data.type !== 'markAsRead') return;

      try {
        await this.handleMarkAsRead(socket, authResult, data);
      } catch (error) {
        logger.error('Error handling markAsRead', {
          socketId: socket.id,
          error: error.message,
          data,
        });
        socket.emit('error', { type: 'markAsRead', message: error.message });
      }
    });

    // Handle ping for connection health check
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });
  }

  /**
   * Handle sendMessage command from Lovable
   */
  private async handleSendMessage(
    socket: Socket,
    authResult: AuthenticatedUser,
    data: LovableMessage
  ): Promise<void> {
    // Validate conversation belongs to allowed instances
    const isAllowed = authResult.allowedInstances.some(instanceId =>
      data.conversationId.startsWith(instanceId)
    );

    if (!isAllowed) {
      throw new Error('Conversation not allowed for this user');
    }

    if (!data.content) {
      throw new Error('Message content is required');
    }

    logger.info('Processing sendMessage command', {
      socketId: socket.id,
      userId: authResult.user.id,
      conversationId: data.conversationId,
      contentLength: data.content.length,
    });

    // Extract instance ID and phone number from conversation ID
    const [instanceId, phoneNumber] = data.conversationId.split('_');

    // Forward to Evolution API via EventCoordinator
    await this.eventCoordinator.sendMessage(instanceId, {
      number: phoneNumber,
      message: data.content,
    });

    socket.emit('messageSent', {
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle markAsRead command from Lovable
   */
  private async handleMarkAsRead(
    socket: Socket,
    authResult: AuthenticatedUser,
    data: LovableMessage
  ): Promise<void> {
    // Validate conversation belongs to allowed instances
    const isAllowed = authResult.allowedInstances.some(instanceId =>
      data.conversationId.startsWith(instanceId)
    );

    if (!isAllowed) {
      throw new Error('Conversation not allowed for this user');
    }

    logger.info('Processing markAsRead command', {
      socketId: socket.id,
      userId: authResult.user.id,
      conversationId: data.conversationId,
    });

    // Extract instance ID from conversation ID
    const [instanceId] = data.conversationId.split('_');

    // Forward to Evolution API via EventCoordinator
    await this.eventCoordinator.markAsRead(instanceId, data.conversationId);

    socket.emit('markedAsRead', {
      conversationId: data.conversationId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send message to specific client
   */
  sendToClient(socketId: string, event: string, data: any): void {
    const client = this.clients.get(socketId);
    if (client) {
      client.socket.emit(event, data);
    }
  }

  /**
   * Broadcast message to all clients in workspace
   */
  broadcastToWorkspace(workspaceId: string, event: string, data: any): void {
    for (const [socketId, client] of this.clients) {
      if (client.user.workspace.id === workspaceId) {
        client.socket.emit(event, data);
      }
    }
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get server instance
   */
  getServer(): SocketIOServer {
    return this.io;
  }
}