import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { WebSocketServer } from '@/modules/websocket';
import { EvolutionClient } from '@/modules/evolution';
import { EventCoordinator } from '@/modules/infrastructure';
import { WorkspaceDiscovery } from '@/modules/auth';
import { CONFIG, validateConfig } from '@/config';
import { logger } from './logger';

export async function createServer(): Promise<HttpServer> {
  // Validate configuration
  validateConfig();

  // Create Express app
  const app = express();

  // Security middleware
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  app.use(cors({
    origin: true, // In production, specify allowed origins
    credentials: true,
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  // Create HTTP server
  const server = createServer(app);

  // Initialize Evolution client
  const evolutionClient = new EvolutionClient();
  await evolutionClient.connect();

  // Initialize workspace discovery
  const workspaceDiscovery = new WorkspaceDiscovery();

  // Initialize event coordinator
  const eventCoordinator = new EventCoordinator(
    evolutionClient,
    workspaceDiscovery
  );

  // Initialize WebSocket server
  const wsServer = new WebSocketServer(server, eventCoordinator);

  // Set WebSocket server in event coordinator
  eventCoordinator.setWebSocketServer(wsServer);

  // Store instances for graceful shutdown
  (global as any).wsServer = wsServer;
  (global as any).evolutionClient = evolutionClient;
  (global as any).eventCoordinator = eventCoordinator;

  logger.info('ChatEngine WebSocket Server initialized', {
    port: CONFIG.server.port,
    nodeEnv: CONFIG.server.nodeEnv,
    evolutionConnected: evolutionClient.isConnected(),
  });

  return server;
}