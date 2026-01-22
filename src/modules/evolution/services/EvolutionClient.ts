import { io, Socket } from 'socket.io-client';
import { CONFIG } from '@/config';
import { logger } from '@/core/logger';
import { EvolutionMessage } from '@/types';

export type EvolutionEventHandler = (message: EvolutionMessage) => void;

export class EvolutionClient {
  private socket: Socket | null = null;
  private eventHandlers = new Map<string, EvolutionEventHandler>();
  private connectedInstances = new Set<string>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to Evolution API WebSocket
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      logger.info('Evolution client already connected');
      return;
    }

    try {
      const wsUrl = CONFIG.evolution.baseUrl.replace(/^https?/, (match) =>
        match === 'https' ? 'wss' : 'ws'
      );

      logger.info('Connecting to Evolution API', { url: wsUrl });

      this.socket = io(wsUrl, {
        auth: {
          apiKey: CONFIG.evolution.apiKey,
        },
        query: {
          apiKey: CONFIG.evolution.apiKey,
        },
        extraHeaders: {
          apikey: CONFIG.evolution.apiKey,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      this.setupEventHandlers();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.socket!.on('connect', () => {
          clearTimeout(timeout);
          logger.info('Connected to Evolution API');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeout);
          logger.error('Failed to connect to Evolution API', { error: error.message });
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Error connecting to Evolution API', { error: error.message });
      throw error;
    }
  }

  /**
   * Disconnect from Evolution API
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectedInstances.clear();
      logger.info('Disconnected from Evolution API');
    }
  }

  /**
   * Setup event handlers for Evolution socket
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      logger.info('Evolution socket connected');
      // Re-subscribe to all previously connected instances
      this.connectedInstances.forEach(instanceId => {
        this.subscribeToInstance(instanceId);
      });
    });

    this.socket.on('disconnect', (reason) => {
      logger.info('Evolution socket disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Evolution socket connection error', { error: error.message });
      this.reconnectAttempts++;
    });

    // Handle messages.upsert events
    this.socket.on('messages.upsert', (data: any) => {
      logger.debug('Received messages.upsert from Evolution', { instance: data.instance });

      const message: EvolutionMessage = {
        event: 'messages.upsert',
        instance: data.instance,
        data,
        timestamp: new Date().toISOString(),
      };

      this.emitEvent('messages.upsert', message);
    });

    // Handle connection.update events
    this.socket.on('connection.update', (data: any) => {
      logger.debug('Received connection.update from Evolution', { instance: data.instance });

      const message: EvolutionMessage = {
        event: 'connection.update',
        instance: data.instance,
        data,
        timestamp: new Date().toISOString(),
      };

      this.emitEvent('connection.update', message);
    });

    // Handle other Evolution events
    this.socket.on('messages.update', (data: any) => {
      logger.debug('Received messages.update from Evolution', { instance: data.instance });
    });

    this.socket.on('contacts.upsert', (data: any) => {
      logger.debug('Received contacts.upsert from Evolution', { instance: data.instance });
    });

    this.socket.on('contacts.update', (data: any) => {
      logger.debug('Received contacts.update from Evolution', { instance: data.instance });
    });

    this.socket.on('chats.upsert', (data: any) => {
      logger.debug('Received chats.upsert from Evolution', { instance: data.instance });
    });

    this.socket.on('chats.update', (data: any) => {
      logger.debug('Received chats.update from Evolution', { instance: data.instance });
    });
  }

  /**
   * Subscribe to instance events
   */
  subscribeToInstance(instanceId: string): void {
    if (!this.socket?.connected) {
      logger.warn('Cannot subscribe to instance - not connected to Evolution');
      return;
    }

    this.socket.emit('subscribe', { instance: instanceId });
    this.connectedInstances.add(instanceId);

    logger.info('Subscribed to Evolution instance', { instanceId });
  }

  /**
   * Unsubscribe from instance events
   */
  unsubscribeFromInstance(instanceId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('unsubscribe', { instance: instanceId });
    this.connectedInstances.delete(instanceId);

    logger.info('Unsubscribed from Evolution instance', { instanceId });
  }

  /**
   * Send message via Evolution API
   */
  async sendMessage(instanceId: string, payload: {
    number: string;
    message: string;
    options?: any;
  }): Promise<any> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to Evolution API');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Send message timeout'));
      }, 30000);

      // Listen for response
      const responseHandler = (response: any) => {
        if (response.instance === instanceId) {
          clearTimeout(timeout);
          this.socket!.off('sendMessageResponse', responseHandler);
          resolve(response);
        }
      };

      this.socket!.on('sendMessageResponse', responseHandler);

      // Send message
      this.socket!.emit('sendMessage', {
        instance: instanceId,
        ...payload,
      });

      logger.info('Sent message via Evolution', {
        instanceId,
        number: payload.number,
        messageLength: payload.message.length,
      });
    });
  }

  /**
   * Mark chat as read via Evolution API
   */
  async markAsRead(instanceId: string, chatId: string): Promise<any> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to Evolution API');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Mark as read timeout'));
      }, 10000);

      // Listen for response
      const responseHandler = (response: any) => {
        if (response.instance === instanceId) {
          clearTimeout(timeout);
          this.socket!.off('markAsReadResponse', responseHandler);
          resolve(response);
        }
      };

      this.socket!.on('markAsReadResponse', responseHandler);

      // Mark as read
      this.socket!.emit('markAsRead', {
        instance: instanceId,
        chatId,
      });

      logger.info('Marked chat as read via Evolution', { instanceId, chatId });
    });
  }

  /**
   * Register event handler
   */
  on(event: string, handler: EvolutionEventHandler): void {
    this.eventHandlers.set(event, handler);
  }

  /**
   * Remove event handler
   */
  off(event: string): void {
    this.eventHandlers.delete(event);
  }

  /**
   * Emit event to registered handlers
   */
  private emitEvent(event: string, message: EvolutionMessage): void {
    const handler = this.eventHandlers.get(event);
    if (handler) {
      try {
        handler(message);
      } catch (error) {
        logger.error('Error in Evolution event handler', {
          event,
          error: error.message,
        });
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get connected instances
   */
  getConnectedInstances(): string[] {
    return Array.from(this.connectedInstances);
  }
}