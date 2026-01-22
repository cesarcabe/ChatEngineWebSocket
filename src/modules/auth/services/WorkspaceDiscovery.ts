import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '@/config';
import { logger } from '@/core/logger';
import { Workspace, WhatsappNumber, ConversationRecord } from '@/types';

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
        .select('id, workspace_id, phone_number, internal_name, status, created_at, updated_at, instance_name')
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
        instanceName: instance.instance_name,
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
        .eq('instance_name', instanceId)
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
        .select('id, workspace_id, phone_number, internal_name, status, created_at, updated_at, instance_name')
        .eq('instance_name', instanceId)
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
        instanceName: data.instance_name,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      } : null;
    } catch (error) {
      logger.error('Exception fetching instance', { error: error.message, instanceId });
      return null;
    }
  }

  /**
   * Get conversation by remote JID within a workspace
   */
  async getConversationByRemoteJid(workspaceId: string, remoteJid: string): Promise<ConversationRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .select('id, workspace_id, contact_id, whatsapp_number_id, remote_jid, updated_at, whatsapp_numbers(id, instance_name, status)')
        .eq('workspace_id', workspaceId)
        .eq('remote_jid', remoteJid)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching conversation by remote_jid', { error: error.message, workspaceId, remoteJid });
        return null;
      }

      const whatsappNumber = Array.isArray(data?.whatsapp_numbers)
        ? data.whatsapp_numbers[0]
        : data?.whatsapp_numbers;

      return data ? {
        id: data.id,
        workspaceId: data.workspace_id,
        contactId: data.contact_id,
        whatsappNumberId: data.whatsapp_number_id,
        remoteJid: data.remote_jid,
        updatedAt: data.updated_at,
        whatsappNumber: whatsappNumber ? {
          id: whatsappNumber.id,
          instanceName: whatsappNumber.instance_name,
          status: whatsappNumber.status,
        } : null,
      } : null;
    } catch (error) {
      logger.error('Exception fetching conversation by remote_jid', {
        error: error.message,
        workspaceId,
        remoteJid,
      });
      return null;
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversationById(conversationId: string): Promise<ConversationRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('conversations')
        .select('id, workspace_id, contact_id, whatsapp_number_id, remote_jid, updated_at, whatsapp_numbers(id, instance_name, status)')
        .eq('id', conversationId)
        .maybeSingle();

      if (error) {
        logger.error('Error fetching conversation by id', { error: error.message, conversationId });
        return null;
      }

      const whatsappNumber = Array.isArray(data?.whatsapp_numbers)
        ? data.whatsapp_numbers[0]
        : data?.whatsapp_numbers;

      return data ? {
        id: data.id,
        workspaceId: data.workspace_id,
        contactId: data.contact_id,
        whatsappNumberId: data.whatsapp_number_id,
        remoteJid: data.remote_jid,
        updatedAt: data.updated_at,
        whatsappNumber: whatsappNumber ? {
          id: whatsappNumber.id,
          instanceName: whatsappNumber.instance_name,
          status: whatsappNumber.status,
        } : null,
      } : null;
    } catch (error) {
      logger.error('Exception fetching conversation by id', {
        error: error.message,
        conversationId,
      });
      return null;
    }
  }
}