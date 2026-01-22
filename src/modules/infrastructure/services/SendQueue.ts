import Redis from 'ioredis';
import { logger } from '@/core/logger';

export interface SendQueueJob {
  messageId: string;
  workspaceId: string;
  conversationId: string;
  instanceId: string;
  remoteJid: string;
  content: string;
  replyToMessageId?: string;
  userId: string;
  enqueuedAt: string;
}

type JobProcessor = (job: SendQueueJob) => Promise<void>;

export class SendQueue {
  private redis: Redis | null;
  private queueKey: string;
  private running = false;
  private processor: JobProcessor | null = null;
  private memoryQueue: SendQueueJob[] = [];

  constructor(options: { enabled: boolean; url?: string; queueKey: string }) {
    if (options.enabled && options.url) {
      this.redis = new Redis(options.url, {
        maxRetriesPerRequest: null,
      });
      this.queueKey = options.queueKey;
      this.redis.on('error', (error) => {
        logger.error('Redis error', { error: error.message });
      });
      logger.info('SendQueue initialized with Redis', { queueKey: this.queueKey });
    } else {
      this.redis = null;
      this.queueKey = options.queueKey;
      logger.warn('SendQueue running in memory mode (Redis disabled)');
    }
  }

  async enqueue(job: SendQueueJob): Promise<void> {
    const payload = JSON.stringify(job);
    if (this.redis) {
      await this.redis.lpush(this.queueKey, payload);
      logger.debug('Enqueued message', { queueKey: this.queueKey, messageId: job.messageId });
      return;
    }

    this.memoryQueue.push(job);
    logger.debug('Enqueued message (memory)', { messageId: job.messageId });
  }

  start(processor: JobProcessor): void {
    if (this.running) return;
    this.running = true;
    this.processor = processor;
    void this.processLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        const job = await this.nextJob();
        if (!job || !this.processor) {
          continue;
        }
        await this.processor(job);
      } catch (error) {
        logger.error('Error processing send queue job', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private async nextJob(): Promise<SendQueueJob | null> {
    if (this.redis) {
      const result = await this.redis.brpop(this.queueKey, 5);
      if (!result || result.length < 2) {
        return null;
      }
      return JSON.parse(result[1]) as SendQueueJob;
    }

    if (this.memoryQueue.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return null;
    }

    return this.memoryQueue.shift() ?? null;
  }
}
