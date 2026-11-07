import type { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json, ModerationActionType } from '@/types/database';

export const UNKNOWN_ASSIGNEE_ID = '__historical_assignee_unknown__';

type JsonRecord = Record<string, unknown>;
type AssignmentClient = ReturnType<typeof createAdminClient>;

export interface AssignmentActionRecord {
  comment_id: string;
  action_type: string;
  performed_by: string | null;
  facebook_response: unknown;
  action_status: string;
  reason: string | null;
  created_at: string;
}

export interface AssignmentAuditRecord {
  entity_id: string | null;
  event_type: string;
  metadata: unknown;
  created_at: string;
  admin_id?: string | null;
}

export function buildAssignmentRecords(input: {
  commentId: string;
  actionType: 'assigned' | 'reassigned' | 'claimed' | 'released';
  adminId: string;
  description: string;
  reason: string | null;
  previousAssignee: string | null;
  newAssignee: string | null;
  assignedAt: string | null;
  timestamp: string;
}) {
  return {
    action: {
      comment_id: input.commentId,
      action_type: input.actionType,
      reason: input.reason ? `${input.description} (${input.reason})` : input.description,
      performed_by: input.adminId,
      action_status: 'success',
      performed_at: input.timestamp,
      completed_at: input.timestamp,
      facebook_response: {
        comment_state: {
          assigned_to: input.newAssignee,
          assigned_at: input.assignedAt,
        },
      },
    } satisfies Database['public']['Tables']['moderation_actions']['Insert'],
    audit: {
      admin_id: input.adminId,
      event_type: `COMMENT_${input.actionType.toUpperCase()}`,
      description: input.description,
      entity_type: 'comment',
      entity_id: input.commentId,
      metadata: {
        previous_assignee: input.previousAssignee,
        new_assignee: input.newAssignee,
        assigned_at: input.assignedAt,
        reason: input.reason,
      },
    } satisfies Database['public']['Tables']['audit_logs']['Insert'],
  };
}

export function buildModerationRecords(input: {
  commentId: string;
  adminId: string;
  actionType: Database['public']['Tables']['moderation_actions']['Insert']['action_type'];
  reason: string;
  actionStatus: string;
  facebookResponse: unknown;
  errorMessage: string | null;
  previousStatus: string;
  newStatus: string;
  externalActionStatus: string;
  escalationPriority: string | null;
  isOverride: boolean;
  timestamp: string;
}) {
  return {
    action: {
      comment_id: input.commentId,
      action_type: input.actionType,
      reason: input.reason,
      performed_by: input.adminId,
      action_status: input.actionStatus,
      facebook_response: input.facebookResponse as Json | null,
      error_message: input.errorMessage,
      performed_at: input.timestamp,
      completed_at: input.timestamp,
    } satisfies Database['public']['Tables']['moderation_actions']['Insert'],
    audit: {
      admin_id: input.adminId,
      event_type: input.isOverride ? 'COMMENT_OVERRIDE' : `COMMENT_${input.actionType.toUpperCase()}`,
      description: input.reason,
      entity_type: 'comment',
      entity_id: input.commentId,
      metadata: {
        previous_status: input.previousStatus,
        new_status: input.newStatus,
        reason: input.reason,
        external_action_status: input.externalActionStatus,
        outcome: input.actionStatus,
        ...(input.escalationPriority ? { escalation_priority: input.escalationPriority } : {}),
      },
    } satisfies Database['public']['Tables']['audit_logs']['Insert'],
  };
}

export interface CommentAssignment {
  assignedTo: string | null;
  assignedAt: string | null;
}

export function getAssignedCommentIds(
  assignments: Map<string, CommentAssignment>,
  adminId: string
): string[] {
  return Array.from(assignments)
    .filter(([, assignment]) => assignment.assignedTo === adminId)
    .map(([commentId]) => commentId);
}

export function canClaimAssignment(assignedTo: string | null, adminId: string): boolean {
  return !assignedTo || assignedTo === adminId;
}

export function canReassignAssignment(
  assignedTo: string | null,
  adminId: string,
  isSuperAdmin: boolean
): boolean {
  return isSuperAdmin || assignedTo === adminId;
}

export function canReleaseAssignment(
  assignedTo: string | null,
  adminId: string,
  isSuperAdmin: boolean
): boolean {
  return canReassignAssignment(assignedTo, adminId, isSuperAdmin);
}

export function canModerateAssignment(
  assignedTo: string | null,
  adminId: string,
  isSuperAdmin: boolean
): boolean {
  return isSuperAdmin || !assignedTo || assignedTo === adminId;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

export function getCommentState(apiResponse: unknown): JsonRecord {
  const state = asRecord(asRecord(apiResponse)?.comment_state);
  return state || {};
}

export function getFacebookApiResponse(apiResponse: unknown): unknown {
  const response = asRecord(apiResponse);
  return response && Object.prototype.hasOwnProperty.call(response, 'facebook_response')
    ? response.facebook_response
    : apiResponse;
}

export function getExternalActionStatus(actions: Array<{
  action_type: string;
  action_status: string;
  facebook_response: unknown;
}>, auditRecords: Array<{ event_type: string; metadata: unknown }> = []): 'none' | 'pending_facebook_sync' | 'synced_facebook' | 'failed_facebook' {
  for (const action of actions) {
    const storedStatus = getCommentState(action.facebook_response).external_action_status;
    if (
      storedStatus === 'pending_facebook_sync' ||
      storedStatus === 'synced_facebook' ||
      storedStatus === 'failed_facebook'
    ) {
      return storedStatus;
    }

    if (!['hidden', 'restored', 'deleted'].includes(action.action_type)) continue;
    if (action.action_type === 'deleted') return 'pending_facebook_sync';

    const response = asRecord(action.facebook_response);
    const note = typeof response?.note === 'string' ? response.note.toLowerCase() : '';
    if (note.includes('pending')) return 'pending_facebook_sync';
    if (action.action_status === 'failed' || response?.success === false) return 'failed_facebook';
    if (response?.success === true) return 'synced_facebook';
  }

  for (const audit of auditRecords) {
    if (!['COMMENT_HIDDEN', 'COMMENT_RESTORED', 'COMMENT_DELETED', 'COMMENT_OVERRIDE'].includes(audit.event_type)) continue;
    const storedStatus = asRecord(audit.metadata)?.external_action_status;
    if (
      storedStatus === 'pending_facebook_sync' ||
      storedStatus === 'synced_facebook' ||
      storedStatus === 'failed_facebook'
    ) {
      return storedStatus;
    }
  }

  return 'none';
}

export function getModerationActionPresentation(action: {
  action_type: ModerationActionType;
  action_status: string;
  performed_by: string | null;
  facebook_response: Json | null;
}) {
  return {
    action: action.action_type,
    actor_id: action.performed_by,
    outcome: action.action_status === 'failed' ? 'failed' as const
      : action.action_status === 'pending' ? 'pending' as const
        : 'success' as const,
    api_response: action.facebook_response,
  };
}

export function resolveCommentAssignments(
  actions: AssignmentActionRecord[],
  auditRecords: AssignmentAuditRecord[]
): Map<string, CommentAssignment> {
  const events = new Map<string, Array<{
    assignedTo: string | null;
    createdAt: string;
    isAudit: boolean;
  }>>();

  const addEvent = (commentId: string, assignedTo: string | null, createdAt: string, isAudit: boolean) => {
    const commentEvents = events.get(commentId) || [];
    commentEvents.push({ assignedTo, createdAt, isAudit });
    events.set(commentId, commentEvents);
  };

  for (const action of actions) {
    if (!['assigned', 'reassigned', 'claimed', 'released'].includes(action.action_type)) continue;

    const state = getCommentState(action.facebook_response);
    let assignedTo: string;
    if (Object.prototype.hasOwnProperty.call(state, 'assigned_to')) {
      assignedTo = typeof state.assigned_to === 'string'
        ? state.assigned_to
        : state.assigned_to === null
          ? ''
          : UNKNOWN_ASSIGNEE_ID;
    } else if (action.action_type === 'released') {
      assignedTo = '';
    } else if (action.action_type === 'claimed' && action.performed_by) {
      assignedTo = action.performed_by;
    } else {
      assignedTo = UNKNOWN_ASSIGNEE_ID;
    }

    addEvent(action.comment_id, assignedTo || null, action.created_at, false);
  }

  for (const audit of auditRecords) {
    if (!audit.entity_id || !audit.event_type.startsWith('COMMENT_')) continue;
    const action = audit.event_type.slice('COMMENT_'.length).toLowerCase();
    if (!['assigned', 'reassigned', 'claimed', 'released'].includes(action)) continue;

    const details = asRecord(audit.metadata);
    let assignedTo: string;
    if (details && Object.prototype.hasOwnProperty.call(details, 'new_assignee')) {
      assignedTo = typeof details.new_assignee === 'string'
        ? details.new_assignee
        : details.new_assignee === null
          ? ''
          : UNKNOWN_ASSIGNEE_ID;
    } else if (action === 'released') {
      assignedTo = '';
    } else if (action === 'claimed' && audit.admin_id) {
      assignedTo = audit.admin_id;
    } else {
      assignedTo = UNKNOWN_ASSIGNEE_ID;
    }

    addEvent(audit.entity_id, assignedTo || null, audit.created_at, true);
  }

  const assignments = new Map<string, CommentAssignment>();
  for (const [commentId, commentEvents] of Array.from(events.entries())) {
    commentEvents.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt) || Number(b.isAudit) - Number(a.isAudit)
    );
    const latest = commentEvents[0];
    assignments.set(commentId, {
      assignedTo: latest.assignedTo,
      assignedAt: latest.assignedTo ? latest.createdAt : null,
    });
  }

  return assignments;
}

export async function loadCommentAssignments(
  supabase: AssignmentClient,
  commentIds: string[]
): Promise<Map<string, CommentAssignment>> {
  if (commentIds.length === 0) return new Map();

  const [
    { data: actions, error: actionsError },
    { data: auditRecords, error: auditError },
  ] = await Promise.all([
    supabase
      .from('moderation_actions')
      .select('comment_id, action_type, performed_by, facebook_response, action_status, reason, created_at')
      .in('comment_id', commentIds)
      .in('action_type', ['assigned', 'reassigned', 'claimed', 'released'])
      .order('created_at', { ascending: false }),
    supabase
      .from('audit_logs')
      .select('entity_id, event_type, metadata, created_at, admin_id')
      .eq('entity_type', 'comment')
      .in('entity_id', commentIds)
      .in('event_type', ['COMMENT_ASSIGNED', 'COMMENT_REASSIGNED', 'COMMENT_CLAIMED', 'COMMENT_RELEASED'])
      .order('created_at', { ascending: false }),
  ]);

  if (actionsError) throw new Error(`Failed to load comment assignment actions: ${actionsError.message}`);
  if (auditError) throw new Error(`Failed to load comment assignment audit history: ${auditError.message}`);

  return resolveCommentAssignments(actions || [], auditRecords || []);
}

export function getEscalationDetails(actions: Array<{
  action_type: string;
  reason: string | null;
  facebook_response: unknown;
}>, escalationNotifications: Array<{ title: string }> = [], auditRecords: Array<{
  event_type: string;
  metadata: unknown;
}> = []): { reason: string | null; priority: string | null } {
  const escalation = actions.find((action) => action.action_type === 'escalated');
  const escalationAudit = auditRecords.find((audit) => {
    const metadata = asRecord(audit.metadata);
    return audit.event_type === 'COMMENT_ESCALATED' ||
      (audit.event_type === 'COMMENT_OVERRIDE' && metadata?.new_status === 'escalated');
  });
  if (!escalation && !escalationAudit) return { reason: null, priority: null };

  const state = escalation ? getCommentState(escalation.facebook_response) : {};
  const response = escalation ? asRecord(escalation.facebook_response) : null;
  const auditMetadata = asRecord(escalationAudit?.metadata);
  const storedPriority = state.escalation_priority ?? response?.escalation_priority;
  const notificationPriority = escalationNotifications
    .map((notification) => notification.title.match(/priority\s*\[(low|medium|high|urgent)\]/i)?.[1]?.toLowerCase())
    .find(Boolean);
  const priority = auditMetadata?.escalation_priority ?? storedPriority ?? notificationPriority;
  const reason = typeof auditMetadata?.reason === 'string'
    ? auditMetadata.reason
    : escalation?.reason || null;
  return {
    reason,
    priority: typeof priority === 'string' ? priority : null,
  };
}

export function buildCommentRefreshPayload(
  postId: string,
  comment: {
    message: string;
    from?: { id?: string; name?: string };
  },
  updatedAt: string
) {
  return {
    message: comment.message,
    commenter_name: comment.from?.name || 'Facebook User',
    commenter_facebook_id: comment.from?.id || null,
    post_id: postId,
    comment_updated_at: updatedAt,
  };
}
