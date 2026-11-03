export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AdminRole = 'super_admin' | 'moderator';

export type PageConnectionStatus =
  | 'connected'
  | 'missing_permissions'
  | 'token_expired'
  | 'connection_error'
  | 'disconnected';

export type ModerationStatus =
  | 'pending'
  | 'approved'
  | 'flagged'
  | 'hidden'
  | 'restored'
  | 'review_required';

export type SeverityLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export type ModerationRuleSeverity = 'low' | 'medium' | 'high' | 'critical';

export type RuleAction = 'allow' | 'flag' | 'hide' | 'alert' | 'human_review';

export type RecommendedAction = 'approve' | 'flag' | 'hide' | 'alert' | 'human_review';

export type ModerationJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ModerationActionType =
  | 'approved'
  | 'hidden'
  | 'restored'
  | 'flagged'
  | 'threat_alerted';

export type ActorType = 'ai' | 'super_admin' | 'moderator' | 'system';

export type NotificationType =
  | 'threat'
  | 'review_required'
  | 'integration_error'
  | 'job_failure'
  | 'system';

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          id: string;
          email: string;
          role: AdminRole;
          full_name: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: AdminRole;
          full_name?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: AdminRole;
          full_name?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      facebook_pages: {
        Row: {
          id: string;
          page_id: string;
          name: string;
          category: string | null;
          is_monitored: boolean;
          auto_hide_enabled: boolean;
          auto_approve_safe: boolean;
          webhook_subscribed: boolean;
          connection_status: PageConnectionStatus;
          last_sync_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          name: string;
          category?: string | null;
          is_monitored?: boolean;
          auto_hide_enabled?: boolean;
          auto_approve_safe?: boolean;
          webhook_subscribed?: boolean;
          connection_status?: PageConnectionStatus;
          last_sync_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          name?: string;
          category?: string | null;
          is_monitored?: boolean;
          auto_hide_enabled?: boolean;
          auto_approve_safe?: boolean;
          webhook_subscribed?: boolean;
          connection_status?: PageConnectionStatus;
          last_sync_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      page_tokens: {
        Row: {
          id: string;
          page_id: string;
          encrypted_access_token: any;
          token_type: string;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          encrypted_access_token: any;
          token_type?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          encrypted_access_token?: any;
          token_type?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          page_id: string;
          facebook_post_id: string;
          message: string | null;
          permalink_url: string | null;
          created_time: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          facebook_post_id: string;
          message?: string | null;
          permalink_url?: string | null;
          created_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          facebook_post_id?: string;
          message?: string | null;
          permalink_url?: string | null;
          created_time?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          page_id: string;
          post_id: string | null;
          facebook_comment_id: string;
          facebook_post_id: string | null;
          parent_comment_id: string | null;
          source_event_id: string | null;
          commenter_id: string | null;
          commenter_name: string | null;
          message: string;
          created_time: string;
          is_hidden: boolean;
          moderation_status: ModerationStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          post_id?: string | null;
          facebook_comment_id: string;
          facebook_post_id?: string | null;
          parent_comment_id?: string | null;
          source_event_id?: string | null;
          commenter_id?: string | null;
          commenter_name?: string | null;
          message: string;
          created_time: string;
          is_hidden?: boolean;
          moderation_status?: ModerationStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          post_id?: string | null;
          facebook_comment_id?: string;
          facebook_post_id?: string | null;
          parent_comment_id?: string | null;
          source_event_id?: string | null;
          commenter_id?: string | null;
          commenter_name?: string | null;
          message?: string;
          created_time?: string;
          is_hidden?: boolean;
          moderation_status?: ModerationStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      moderation_rules: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string;
          severity: ModerationRuleSeverity;
          action: RuleAction;
          is_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          description: string;
          severity: ModerationRuleSeverity;
          action: RuleAction;
          is_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          description?: string;
          severity?: ModerationRuleSeverity;
          action?: RuleAction;
          is_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      moderation_results: {
        Row: {
          id: string;
          comment_id: string;
          detected_category: string;
          confidence_score: number;
          severity: SeverityLevel;
          recommended_action: RecommendedAction;
          explanation: string;
          detected_language: string;
          model_info: string;
          raw_response: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          detected_category: string;
          confidence_score: number;
          severity: SeverityLevel;
          recommended_action: RecommendedAction;
          explanation: string;
          detected_language?: string;
          model_info?: string;
          raw_response?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          comment_id?: string;
          detected_category?: string;
          confidence_score?: number;
          severity?: SeverityLevel;
          recommended_action?: RecommendedAction;
          explanation?: string;
          detected_language?: string;
          model_info?: string;
          raw_response?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      moderation_jobs: {
        Row: {
          id: string;
          comment_id: string;
          status: ModerationJobStatus;
          attempts: number;
          max_attempts: number;
          last_error: string | null;
          next_run_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          status?: ModerationJobStatus;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          next_run_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          comment_id?: string;
          status?: ModerationJobStatus;
          attempts?: number;
          max_attempts?: number;
          last_error?: string | null;
          next_run_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          comment_id: string;
          action: ModerationActionType;
          reason: string;
          actor_type: ActorType;
          actor_id: string | null;
          api_response: Json | null;
          outcome: 'success' | 'failed' | 'pending';
          created_at: string;
        };
        Insert: {
          id?: string;
          comment_id: string;
          action: ModerationActionType;
          reason: string;
          actor_type: ActorType;
          actor_id?: string | null;
          api_response?: Json | null;
          outcome?: 'success' | 'failed' | 'pending';
          created_at?: string;
        };
        Update: {
          id?: string;
          comment_id?: string;
          action?: ModerationActionType;
          reason?: string;
          actor_type?: ActorType;
          actor_id?: string | null;
          api_response?: Json | null;
          outcome?: 'success' | 'failed' | 'pending';
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          admin_id: string | null;
          title: string;
          message: string;
          type: NotificationType;
          severity: SeverityLevel;
          comment_id: string | null;
          page_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          title: string;
          message: string;
          type: NotificationType;
          severity?: SeverityLevel;
          comment_id?: string | null;
          page_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          title?: string;
          message?: string;
          type?: NotificationType;
          severity?: SeverityLevel;
          comment_id?: string | null;
          page_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_active_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type CommentWithDetails = Database['public']['Tables']['comments']['Row'] & {
  page?: Database['public']['Tables']['facebook_pages']['Row'];
  post?: Database['public']['Tables']['posts']['Row'];
  moderation_result?: Database['public']['Tables']['moderation_results']['Row'];
  actions?: Database['public']['Tables']['moderation_actions']['Row'][];
};
