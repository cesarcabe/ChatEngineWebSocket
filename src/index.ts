#!/usr/bin/env node

import 'dotenv/config';
import { createServer } from './core/server';
import { logger } from './core/logger';

async function gracefulShutdown(server: any) {
  try {
    // Close HTTP server
    await new Promise((resolve) => server.close(resolve));

    // Disconnect Evolution client
    const evolutionClient = (global as any).evolutionClient;
    if (evolutionClient) {
      evolutionClient.disconnect();
    }

    const sendQueue = (global as any).sendQueue;
    if (sendQueue) {
      await sendQueue.stop();
    }

    logger.info('✅ Graceful shutdown completed');
  } catch (error) {
    logger.error('❌ Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function main() {
  try {
    logger.info('🚀 Starting ChatEngine WebSocket Server');

    const server = await createServer();

    server.listen(PORT, () => {
      logger.info(`✅ Server listening on port ${PORT}`);
      logger.info(`🌐 WebSocket endpoint: ws://localhost:${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Received SIGINT, shutting down gracefully...');
      await gracefulShutdown(server);
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('🛑 Received SIGTERM, shutting down gracefully...');
      await gracefulShutdown(server);
      process.exit(0);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();