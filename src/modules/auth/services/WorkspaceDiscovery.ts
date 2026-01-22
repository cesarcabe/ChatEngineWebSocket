import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '@/config';
import { logger } from '@/core/logger';
import { Workspace, WhatsappNumber } from '@/types';

export class WorkspaceDiscovery {
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
   * Get workspace details by ID
   */
  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
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
   * Get all allowed instances (WhatsApp numbers) for a workspace
   */
  async getAllowedInstances(workspaceId: string): Promise<WhatsappNumber[]> {
    try {
      const { data, error } = await this.supabase
        .from('whatsapp_numbers')
        .select('id, workspace_id, phone_number, internal_name, status, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected');

      if (error) {
        logger.error('Error fetching allowed instances', {
          error: error.message,
          workspaceId,
        });
        return [];
      }

      return data.map(instance => ({
        id: instance.id,
        workspaceId: instance.workspace_id,
        number: instance.phone_number,
        name: instance.internal_name,
        status: instance.status,
        createdAt: instance.created_at,
        updatedAt: instance.updated_at,
      }));
    } catch (error) {
      logger.error('Exception fetching allowed instances', {
        error: error.message,
        workspaceId,
      });
      return [];
    }
  }

  /**
   * Check if instance belongs to workspace
   */
  async isInstanceAllowed(workspaceId: string, instanceId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('whatsapp_numbers')
        .select('id')
        .eq('id', instanceId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected')
        .maybeSingle();

      if (error) {
        logger.error('Error checking instance permission', {
          error: error.message,
          workspaceId,
          instanceId,
        });
        return false;
      }

      return !!data;
    } catch (error) {
      logger.error('Exception checking instance permission', {
        error: error.message,
        workspaceId,
        instanceId,
      });
      return false;
    }
  }

  /**
   * Get instance details by ID
   */
  async getInstance(instanceId: string): Promise<WhatsappNumber | null> {
    try {
      const { data, error } = await this.supabase
        .from('whatsapp_numbers')
        .select('id, workspace_id, phone_number, internal_name, status, created_at, updated_at')
        .eq('id', instanceId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching instance', { error: error.message, instanceId });
        return null;
      }

      return data ? {
        id: data.id,
        workspaceId: data.workspace_id,
        number: data.phone_number,
        name: data.internal_name,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      } : null;
    } catch (error) {
      logger.error('Exception fetching instance', { error: error.message, instanceId });
      return null;
    }
  }
}