import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { jwtVerify, JWTPayload } from 'jose';
import { CONFIG } from '@/config';
import { logger } from '@/core/logger';
import { JwtPayload, User, Workspace, AuthenticatedUser } from '@/types';

export class JwtValidator {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      CONFIG.supabase.url,
      CONFIG.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  /**
   * Validate JWT token and extract user information
   */
  async validateToken(token: string): Promise<AuthenticatedUser> {
    try {
      // First verify JWT signature and decode payload
      const payload = await this.verifyJwt(token);

      // Verify user exists and is active
      const user = await this.getUser(payload.user_id);
      if (!user) {
        throw new Error('User not found or inactive');
      }

      // Get workspace and verify user has access
      const workspace = await this.getWorkspace(payload.workspace_id);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Verify user is member of workspace
      const isMember = await this.verifyWorkspaceMembership(user.id, workspace.id);
      if (!isMember) {
        throw new Error('User is not a member of the workspace');
      }

      // Get allowed instances for this workspace
      const allowedInstances = await this.getAllowedInstances(workspace.id);

      logger.info('JWT validated successfully', {
        userId: user.id,
        workspaceId: workspace.id,
        instanceCount: allowedInstances.length,
      });

      return {
        user,
        workspace,
        allowedInstances,
      };
    } catch (error) {
      logger.error('JWT validation failed', { error: error.message });
      throw new Error(`Invalid token: ${error.message}`);
    }
  }

  /**
   * Verify JWT signature and decode payload
   */
  private async verifyJwt(token: string): Promise<JwtPayload> {
    try {
      // Get Supabase JWT secret (this is the same secret used by Supabase)
      const secret = new TextEncoder().encode(CONFIG.supabase.serviceRoleKey);

      const { payload } = await jwtVerify(token, secret);

      // Validate required claims
      if (!payload.sub || !payload.workspace_id) {
        throw new Error('Missing required claims: sub or workspace_id');
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        throw new Error('Token has expired');
      }

      return {
        user_id: payload.sub as string,
        workspace_id: payload.workspace_id as string,
        exp: payload.exp || 0,
        iat: payload.iat || 0,
      };
    } catch (error) {
      logger.error('JWT verification failed', { error: error.message });
      throw new Error(`JWT verification failed: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   */
  private async getUser(userId: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching user', { error: error.message, userId });
        return null;
      }

      return data ? {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
      } : null;
    } catch (error) {
      logger.error('Exception fetching user', { error: error.message, userId });
      return null;
    }
  }

  /**
   * Get workspace by ID
   */
  private async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    try {
      const { data, error } = await this.supabase
        .from('workspaces')
        .select('id, name, owner_id, created_at, updated_at')
        .eq('id', workspaceId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching workspace', { error: error.message, workspaceId });
        return null;
      }

      return data ? {
        id: data.id,
        name: data.name,
        ownerId: data.owner_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      } : null;
    } catch (error) {
      logger.error('Exception fetching workspace', { error: error.message, workspaceId });
      return null;
    }
  }

  /**
   * Verify user is member of workspace
   */
  private async verifyWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) {
        logger.error('Error checking workspace membership', {
          error: error.message,
          userId,
          workspaceId,
        });
        return false;
      }

      return !!data;
    } catch (error) {
      logger.error('Exception checking workspace membership', {
        error: error.message,
        userId,
        workspaceId,
      });
      return false;
    }
  }

  /**
   * Get allowed instances (WhatsApp numbers) for workspace
   */
  private async getAllowedInstances(workspaceId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('whatsapp_numbers')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected');

      if (error) {
        logger.error('Error fetching allowed instances', {
          error: error.message,
          workspaceId,
        });
        return [];
      }

      return data.map(instance => instance.id);
    } catch (error) {
      logger.error('Exception fetching allowed instances', {
        error: error.message,
        workspaceId,
      });
      return [];
    }
  }
}