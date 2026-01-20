import { EvolutionClient, EvolutionEventHandler } from '@/modules/evolution';
import { WorkspaceDiscovery } from '@/modules/auth';
import { logger } from '@/core/logger';
import { EvolutionMessage } from '@/types';

interface WebSocketServerInterface {
  broadcastToWorkspace(workspaceId: string, event: string, data: any): void;
}

export class EventCoordinator {
  private evolutionClient: EvolutionClient;
  private wsServer: WebSocketServerInterface | null = null;
  private workspaceDiscovery: WorkspaceDiscovery;
  private subscribedInstances = new Set<string>();

  constructor(
    evolutionClient: EvolutionClient,
    workspaceDiscovery: WorkspaceDiscovery
  ) {
    this.evolutionClient = evolutionClient;
    this.workspaceDiscovery = workspaceDiscovery;

    this.setupEvolutionHandlers();
  }

  /**
   * Set WebSocket server instance (called after server initialization)
   */
  setWebSocketServer(wsServer: WebSocketServerInterface): void {
    this.wsServer = wsServer;
  }

  /**
   * Setup handlers for Evolution events
   */
  private setupEvolutionHandlers(): void {
    // Handle messages.upsert events
    const messageHandler: EvolutionEventHandler = async (message: EvolutionMessage) => {
      await this.handleMessageEvent(message);
    };

    // Handle connection.update events
    const connectionHandler: EvolutionEventHandler = async (message: EvolutionMessage) => {
      await this.handleConnectionEvent(message);
    };

    this.evolutionClient.on('messages.upsert', messageHandler);
    this.evolutionClient.on('connection.update', connectionHandler);
  }

  /**
   * Handle messages.upsert events from Evolution
   */
  private async handleMessageEvent(message: EvolutionMessage): Promise<void> {
    try {
      const { instance, data } = message;

      // Find workspace that owns this instance
      const workspaceId = await this.findWorkspaceForInstance(instance);
      if (!workspaceId) {
        logger.warn('No workspace found for instance', { instance });
        return;
      }

      // Transform Evolution message to ChatEngine format
      const chatEngineMessage = this.transformMessageToChatEngine(data, workspaceId);

      // Broadcast to all clients in the workspace
      this.wsServer?.broadcastToWorkspace(workspaceId, 'message', chatEngineMessage);

      logger.info('Forwarded message to workspace clients', {
        instance,
        workspaceId,
        messageId: chatEngineMessage.id,
      });

    } catch (error) {
      logger.error('Error handling message event', {
        error: error.message,
        message,
      });
    }
  }

  /**
   * Handle connection.update events from Evolution
   */
  private async handleConnectionEvent(message: EvolutionMessage): Promise<void> {
    try {
      const { instance, data } = message;

      // Find workspace that owns this instance
      const workspaceId = await this.findWorkspaceForInstance(instance);
      if (!workspaceId) {
        logger.warn('No workspace found for instance', { instance });
        return;
      }

      // Transform connection update to ChatEngine format
      const connectionUpdate = this.transformConnectionToChatEngine(data, workspaceId);

      // Broadcast to all clients in the workspace
      this.wsServer?.broadcastToWorkspace(workspaceId, 'connectionUpdate', connectionUpdate);

      logger.info('Forwarded connection update to workspace clients', {
        instance,
        workspaceId,
        state: connectionUpdate.state,
      });

    } catch (error) {
      logger.error('Error handling connection event', {
        error: error.message,
        message,
      });
    }
  }

  /**
   * Find workspace ID for a given instance
   */
  private async findWorkspaceForInstance(instanceId: string): Promise<string | null> {
    try {
      // Get instance details from database
      const instance = await this.workspaceDiscovery.getInstance(instanceId);
      return instance?.workspaceId || null;
    } catch (error) {
      logger.error('Error finding workspace for instance', {
        error: error.message,
        instanceId,
      });
      return null;
    }
  }

  /**
   * Transform Evolution message to ChatEngine format
   */
  private transformMessageToChatEngine(evolutionData: any, workspaceId: string): any {
    // This is a simplified transformation - adjust based on Evolution API response format
    return {
      id: evolutionData.id?.id || evolutionData.key?.id || `msg_${Date.now()}`,
      workspaceId,
      conversationId: `${evolutionData.key?.remoteJid}_${workspaceId}`,
      senderId: evolutionData.key?.participant || evolutionData.key?.remoteJid || 'system',
      type: this.mapMessageType(evolutionData.message),
      content: this.extractMessageContent(evolutionData.message),
      status: 'delivered',
      metadata: {
        providerMessageId: evolutionData.key?.id,
        timestamp: evolutionData.messageTimestamp,
      },
      createdAt: new Date(evolutionData.messageTimestamp * 1000).toISOString(),
    };
  }

  /**
   * Transform Evolution connection update to ChatEngine format
   */
  private transformConnectionToChatEngine(evolutionData: any, workspaceId: string): any {
    return {
      instance: evolutionData.instance,
      workspaceId,
      state: evolutionData.state, // 'connected', 'disconnected', etc.
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Map Evolution message type to ChatEngine type
   */
  private mapMessageType(message: any): string {
    if (message?.conversation) return 'text';
    if (message?.imageMessage) return 'image';
    if (message?.videoMessage) return 'video';
    if (message?.audioMessage) return 'audio';
    if (message?.documentMessage) return 'file';
    return 'text';
  }

  /**
   * Extract message content from Evolution message
   */
  private extractMessageContent(message: any): string {
    if (message?.conversation) return message.conversation;
    if (message?.imageMessage?.caption) return message.imageMessage.caption;
    if (message?.videoMessage?.caption) return message.videoMessage.caption;
    if (message?.documentMessage?.caption) return message.documentMessage.caption;
    return '[Unsupported message type]';
  }

  /**
   * Subscribe to instance events when a client connects
   */
  async subscribeToInstance(instanceId: string): Promise<void> {
    if (this.subscribedInstances.has(instanceId)) {
      return;
    }

    try {
      this.evolutionClient.subscribeToInstance(instanceId);
      this.subscribedInstances.add(instanceId);

      logger.info('Subscribed to Evolution instance', { instanceId });
    } catch (error) {
      logger.error('Error subscribing to instance', {
        error: error.message,
        instanceId,
      });
    }
  }

  /**
   * Unsubscribe from instance events when no clients are connected
   */
  async unsubscribeFromInstance(instanceId: string): Promise<void> {
    // Check if any clients are still connected to this instance
    // For now, we'll keep subscriptions active
    // In production, implement logic to check active connections

    logger.info('Unsubscribed from Evolution instance', { instanceId });
  }

  /**
   * Send message via Evolution
   */
  async sendMessage(instanceId: string, payload: {
    number: string;
    message: string;
    options?: any;
  }): Promise<any> {
    return this.evolutionClient.sendMessage(instanceId, payload);
  }

  /**
   * Mark as read via Evolution
   */
  async markAsRead(instanceId: string, chatId: string): Promise<any> {
    return this.evolutionClient.markAsRead(instanceId, chatId);
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.evolutionClient.isConnected();
  }
}