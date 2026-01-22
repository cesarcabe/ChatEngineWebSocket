import { EvolutionClient, EvolutionEventHandler } from '@/modules/evolution';
import { WorkspaceDiscovery } from '@/modules/auth';
import { logger } from '@/core/logger';
import { EvolutionMessage } from '@/types';
import { SendQueue, SendQueueJob } from './SendQueue';

interface WebSocketServerInterface {
  broadcastToWorkspace(workspaceId: string, event: string, data: any): void;
}

export class EventCoordinator {
  private evolutionClient: EvolutionClient;
  private wsServer: WebSocketServerInterface | null = null;
  private workspaceDiscovery: WorkspaceDiscovery;
  private subscribedInstances = new Set<string>();
  private sendQueue: SendQueue | null = null;

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
   * Set SendQueue instance (optional)
   */
  setSendQueue(queue: SendQueue): void {
    this.sendQueue = queue;
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

    // Handle messages.update events (status updates)
    const messageUpdateHandler: EvolutionEventHandler = async (message: EvolutionMessage) => {
      await this.handleMessageUpdateEvent(message);
    };

    this.evolutionClient.on('messages.upsert', messageHandler);
    this.evolutionClient.on('messages.update', messageUpdateHandler);
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

      const extracted = this.extractEvolutionPayload(data);
      const remoteJid = extracted.remoteJid;
      if (!remoteJid) {
        logger.debug('Evolution message missing remoteJid', {
          instance,
          keys: data ? Object.keys(data) : [],
        });
        return;
      }

      const conversation = await this.workspaceDiscovery.getConversationByRemoteJid(workspaceId, remoteJid);
      if (!conversation) {
        logger.warn('No conversation found for remoteJid', { workspaceId, remoteJid });
        return;
      }

      // Transform Evolution message to ChatEngine format
      const chatEngineMessage = this.transformMessageToChatEngine(extracted, workspaceId, conversation.id);

      // Broadcast to all clients in the workspace
      this.wsServer?.broadcastToWorkspace(workspaceId, 'message', chatEngineMessage);

      // Emit conversation update for lists
      const conversationUpdate = this.transformConversationUpdate(conversation, chatEngineMessage);
      this.wsServer?.broadcastToWorkspace(workspaceId, 'conversation', conversationUpdate);

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
   * Handle messages.update events (status updates) from Evolution
   */
  private async handleMessageUpdateEvent(message: EvolutionMessage): Promise<void> {
    try {
      const { instance, data } = message;

      const workspaceId = await this.findWorkspaceForInstance(instance);
      if (!workspaceId) {
        logger.warn('No workspace found for instance', { instance });
        return;
      }

      const extracted = this.extractEvolutionPayload(data);
      const remoteJid = extracted.remoteJid;
      if (!remoteJid) {
        logger.debug('Evolution status update missing remoteJid', {
          instance,
          keys: data ? Object.keys(data) : [],
        });
        return;
      }

      const conversation = await this.workspaceDiscovery.getConversationByRemoteJid(workspaceId, remoteJid);
      if (!conversation) {
        logger.warn('No conversation found for remoteJid (status update)', { workspaceId, remoteJid });
        return;
      }

      const providerMessageId = this.extractProviderMessageId(data);
      if (!providerMessageId) {
        logger.debug('Evolution status update missing message id', { instance, workspaceId });
        return;
      }

      const status = this.mapMessageStatus(data);

      this.wsServer?.broadcastToWorkspace(workspaceId, 'messageStatus', {
        messageId: providerMessageId,
        status,
        conversationId: conversation.id,
      });

      logger.info('Forwarded message status update', {
        instance,
        workspaceId,
        messageId: providerMessageId,
        status,
      });
    } catch (error) {
      logger.error('Error handling message status update', {
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
  private transformMessageToChatEngine(
    evolutionData: { key: any; message: any; messageTimestamp?: number; remoteJid?: string | null },
    workspaceId: string,
    conversationId: string
  ): any {
    // This is a simplified transformation - adjust based on Evolution API response format
    const messageTimestamp = evolutionData.messageTimestamp ?? Math.floor(Date.now() / 1000);
    return {
      id: evolutionData.key?.id || `msg_${Date.now()}`,
      workspaceId,
      conversationId,
      senderId: evolutionData.key?.participant || evolutionData.key?.remoteJid || 'system',
      type: this.mapMessageType(evolutionData.message),
      content: this.extractMessageContent(evolutionData.message),
      status: 'delivered',
      metadata: {
        providerMessageId: evolutionData.key?.id,
        timestamp: messageTimestamp,
      },
      createdAt: new Date(messageTimestamp * 1000).toISOString(),
    };
  }

  /**
   * Transform conversation update to ChatEngine format
   */
  private transformConversationUpdate(conversation: { id: string; workspaceId: string; contactId: string | null; whatsappNumberId: string | null; updatedAt: string | null }, lastMessage: any): any {
    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId ?? undefined,
      whatsappNumberId: conversation.whatsappNumberId ?? undefined,
      channel: 'whatsapp',
      participants: [],
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        content: lastMessage.content,
        senderId: lastMessage.senderId,
        createdAt: lastMessage.createdAt,
      } : undefined,
      updatedAt: conversation.updatedAt || new Date().toISOString(),
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

  private extractEvolutionPayload(evolutionData: any): {
    key: any;
    message: any;
    messageTimestamp?: number;
    remoteJid?: string | null;
  } {
    const data = evolutionData ?? {};
    const messageWrapper =
      data?.message ||
      data?.messages?.[0] ||
      data?.data?.message ||
      data?.data?.messages?.[0] ||
      data?.data ||
      data;

    const key =
      data?.key ||
      data?.message?.key ||
      data?.messages?.[0]?.key ||
      data?.data?.key ||
      data?.data?.message?.key ||
      data?.data?.messages?.[0]?.key ||
      messageWrapper?.key ||
      null;

    const message =
      data?.message?.message ||
      data?.messages?.[0]?.message ||
      data?.data?.message?.message ||
      data?.data?.messages?.[0]?.message ||
      messageWrapper?.message ||
      messageWrapper;

    const messageTimestamp =
      data?.messageTimestamp ||
      data?.message?.messageTimestamp ||
      data?.messages?.[0]?.messageTimestamp ||
      data?.data?.messageTimestamp ||
      data?.data?.messages?.[0]?.messageTimestamp;

    const remoteJid =
      key?.remoteJid ||
      data?.remoteJid ||
      data?.data?.remoteJid ||
      messageWrapper?.key?.remoteJid;

    return {
      key,
      message,
      messageTimestamp,
      remoteJid,
    };
  }

  private extractProviderMessageId(evolutionData: any): string | null {
    const data = evolutionData ?? {};
    return (
      data?.id ||
      data?.messageId ||
      data?.key?.id ||
      data?.message?.key?.id ||
      data?.data?.id ||
      data?.data?.messageId ||
      data?.data?.key?.id ||
      data?.data?.message?.key?.id ||
      null
    );
  }

  private mapMessageStatus(evolutionData: any): 'pending' | 'sent' | 'delivered' | 'read' | 'failed' {
    const rawStatus =
      evolutionData?.status ??
      evolutionData?.ack ??
      evolutionData?.update?.status ??
      evolutionData?.data?.status ??
      evolutionData?.data?.ack ??
      evolutionData?.data?.update?.status ??
      null;

    if (typeof rawStatus === 'string') {
      const normalized = rawStatus.toLowerCase();
      if (normalized === 'pending') return 'pending';
      if (normalized === 'sent') return 'sent';
      if (normalized === 'delivered') return 'delivered';
      if (normalized === 'read') return 'read';
      if (normalized === 'failed' || normalized === 'error') return 'failed';
    }

    const numeric = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);
    if (!Number.isNaN(numeric)) {
      if (numeric <= 0) return 'pending';
      if (numeric === 1) return 'sent';
      if (numeric === 2) return 'delivered';
      if (numeric >= 3) return 'read';
    }

    return 'sent';
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
   * Enqueue a send message job for processing
   */
  async enqueueSendMessage(job: SendQueueJob): Promise<void> {
    if (!this.sendQueue) {
      await this.processSendJob(job);
      return;
    }

    await this.sendQueue.enqueue(job);
  }

  /**
   * Process a send message job (worker)
   */
  async processSendJob(job: SendQueueJob): Promise<void> {
    try {
      await this.evolutionClient.sendMessage(job.instanceId, {
        number: job.remoteJid,
        message: job.content,
      });

      this.wsServer?.broadcastToWorkspace(job.workspaceId, 'messageStatus', {
        messageId: job.messageId,
        status: 'sent',
        conversationId: job.conversationId,
      });

      logger.info('SendQueue job sent', {
        messageId: job.messageId,
        workspaceId: job.workspaceId,
        conversationId: job.conversationId,
      });
    } catch (error) {
      this.wsServer?.broadcastToWorkspace(job.workspaceId, 'messageStatus', {
        messageId: job.messageId,
        status: 'failed',
        conversationId: job.conversationId,
      });

      logger.error('SendQueue job failed', {
        messageId: job.messageId,
        workspaceId: job.workspaceId,
        conversationId: job.conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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