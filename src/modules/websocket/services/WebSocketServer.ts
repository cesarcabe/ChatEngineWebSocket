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
  private subscriptions = new Map<string, Set<string>>();

  constructor(httpServer: HttpServer, eventCoordinator: EventCoordinator) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*", // In production, restrict to your domains
        methods: ["GET", "POST"],
      },
      path: '/api/ws',
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
      const workspaceId =
        socket.handshake.auth?.workspaceId ||
        (typeof socket.handshake.query?.workspaceId === 'string' ? socket.handshake.query.workspaceId : null);
      if (!token) {
        logger.warn('No token provided in socket handshake', { socketId: socket.id });
        return null;
      }

      const authResult = await this.jwtValidator.validateToken(token, workspaceId);
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
    this.subscriptions.set(socket.id, new Set());

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        userId: authResult.user.id,
      });
      this.clients.delete(socket.id);
      this.subscriptions.delete(socket.id);
    });
  }

  /**
   * Setup event handlers for authenticated client
   */
  private setupClientHandlers(socket: Socket, authResult: AuthenticatedUser): void {
    // Subscribe to all allowed instances on connect
    authResult.allowedInstances.forEach((instanceId) => {
      this.eventCoordinator.subscribeToInstance(instanceId);
    });

    // Manage conversation subscriptions
    socket.on('subscribe:conversation', (conversationId: string) => {
      const subscriptions = this.subscriptions.get(socket.id);
      if (subscriptions && conversationId) {
        subscriptions.add(conversationId);
      }
    });

    socket.on('unsubscribe:conversation', (conversationId: string) => {
      const subscriptions = this.subscriptions.get(socket.id);
      if (subscriptions && conversationId) {
        subscriptions.delete(conversationId);
      }
    });

    // Typing indicator
    socket.on('typing', async (data: { conversationId: string; isTyping: boolean }) => {
      try {
        const conversation = await this.workspaceDiscovery.getConversationById(data.conversationId);
        if (!conversation || conversation.workspaceId !== authResult.workspace.id) {
          return;
        }

        const instanceName = conversation.whatsappNumber?.instanceName;
        if (!instanceName || !authResult.allowedInstances.includes(instanceName)) {
          return;
        }

        this.broadcastToWorkspace(authResult.workspace.id, 'typing', {
          conversationId: data.conversationId,
          userId: authResult.user.id,
          isTyping: data.isTyping,
        });
      } catch (error) {
        logger.error('Error handling typing indicator', {
          socketId: socket.id,
          error: error.message,
          data,
        });
      }
    });

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
    if (!data.content) {
      throw new Error('Message content is required');
    }

    const conversation = await this.workspaceDiscovery.getConversationById(data.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (conversation.workspaceId !== authResult.workspace.id) {
      throw new Error('Conversation not allowed for this workspace');
    }

    const instanceName = conversation.whatsappNumber?.instanceName;
    if (!instanceName || !authResult.allowedInstances.includes(instanceName)) {
      throw new Error('Conversation not allowed for this user');
    }

    const remoteJid = conversation.remoteJid;
    if (!remoteJid) {
      throw new Error('Conversation does not have a valid WhatsApp number');
    }

    logger.info('Processing sendMessage command', {
      socketId: socket.id,
      userId: authResult.user.id,
      conversationId: data.conversationId,
      contentLength: data.content.length,
    });

    // Forward to Evolution API via EventCoordinator
    await this.eventCoordinator.sendMessage(instanceName, {
      number: remoteJid,
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
    const conversation = await this.workspaceDiscovery.getConversationById(data.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (conversation.workspaceId !== authResult.workspace.id) {
      throw new Error('Conversation not allowed for this workspace');
    }

    const instanceName = conversation.whatsappNumber?.instanceName;
    if (!instanceName || !authResult.allowedInstances.includes(instanceName)) {
      throw new Error('Conversation not allowed for this user');
    }

    if (!conversation.remoteJid) {
      throw new Error('Conversation does not have a remote JID');
    }

    logger.info('Processing markAsRead command', {
      socketId: socket.id,
      userId: authResult.user.id,
      conversationId: data.conversationId,
    });

    // Forward to Evolution API via EventCoordinator
    await this.eventCoordinator.markAsRead(instanceName, conversation.remoteJid);

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
        if (event === 'message' && data?.conversationId) {
          const subscriptions = this.subscriptions.get(socketId);
          const isSubscribed = !subscriptions || subscriptions.size === 0 || subscriptions.has(data.conversationId);
          if (!isSubscribed) {
            continue;
          }
        }

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