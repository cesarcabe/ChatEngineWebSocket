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
  instanceName?: string | null;
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
  replyToMessageId?: string;
  timestamp: string;
}

export interface EvolutionMessage {
  event: 'messages.upsert' | 'messages.update' | 'connection.update';
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

export interface ConversationRecord {
  id: string;
  workspaceId: string;
  contactId: string | null;
  whatsappNumberId: string | null;
  remoteJid: string | null;
  updatedAt: string | null;
  whatsappNumber?: {
    id: string;
    instanceName: string | null;
    status: string | null;
  } | null;
}

export interface AuthenticatedUser {
  user: User;
  workspace: Workspace;
  allowedInstances: string[];
}