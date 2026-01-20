// Core Types
export interface User {
  id: string;
  email: string;
  full_name?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappNumber {
  id: string;
  workspaceId: string;
  number: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting';
  createdAt: string;
  updatedAt: string;
}

// WebSocket Types
export interface LovableMessage {
  type: 'sendMessage' | 'markAsRead';
  conversationId: string;
  content?: string;
  messageId?: string;
  timestamp: string;
}

export interface EvolutionMessage {
  event: 'messages.upsert' | 'connection.update';
  instance: string;
  data: any;
  timestamp: string;
}

// Auth Types
export interface JwtPayload {
  user_id: string;
  workspace_id: string;
  exp: number;
  iat: number;
}

export interface AuthenticatedUser {
  user: User;
  workspace: Workspace;
  allowedInstances: string[];
}