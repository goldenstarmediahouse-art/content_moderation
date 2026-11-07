import type { createAdminClient } from '@/lib/supabase/admin';

export const UNKNOWN_ASSIGNEE_ID = '__historical_assignee_unknown__';

type JsonRecord = Record<string, unknown>;
type AssignmentClient = ReturnType<typeof createAdminClient>;

export interface AssignmentActionRecord {
  comment_id: string;
  action: string;
  actor_id: string | null;
  api_response: unknown;
  created_at: string;
}

export interface AssignmentAuditRecord {
  entity_id: string | null;
  action: string;
  details: unknown;
  created_at: string;
  admin_id?: string | null;
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
  action: string;
  outcome: string;
  api_response: unknown;
}>): 'none' | 'pending_facebook_sync' | 'synced_facebook' | 'failed_facebook' {
  for (const action of actions) {
    const storedStatus = getCommentState(action.api_response).external_action_status;
    if (
      storedStatus === 'pending_facebook_sync' ||
      storedStatus === 'synced_facebook' ||
      storedStatus === 'failed_facebook'
    ) {
      return storedStatus;
    }

    if (!['hidden', 'restored', 'deleted'].includes(action.action)) continue;
    if (action.action === 'deleted') return 'pending_facebook_sync';

    const response = asRecord(getFacebookApiResponse(action.api_response));
    const note = typeof response?.note === 'string' ? response.note.toLowerCase() : '';
    if (note.includes('pending')) return 'pending_facebook_sync';
    if (action.outcome === 'failed' || response?.success === false) return 'failed_facebook';
    if (response?.success === true) return 'synced_facebook';
  }

  return 'none';
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
    if (!['assigned', 'reassigned', 'claimed', 'released'].includes(action.action)) continue;

    const state = getCommentState(action.api_response);
    let assignedTo: string;
    if (Object.prototype.hasOwnProperty.call(state, 'assigned_to')) {
      assignedTo = typeof state.assigned_to === 'string'
        ? state.assigned_to
        : state.assigned_to === null
          ? ''
          : UNKNOWN_ASSIGNEE_ID;
    } else if (action.action === 'released') {
      assignedTo = '';
    } else if (action.action === 'claimed' && action.actor_id) {
      assignedTo = action.actor_id;
    } else {
      assignedTo = UNKNOWN_ASSIGNEE_ID;
    }

    addEvent(action.comment_id, assignedTo || null, action.created_at, false);
  }

  for (const audit of auditRecords) {
    if (!audit.entity_id || !audit.action.startsWith('COMMENT_')) continue;
    const action = audit.action.slice('COMMENT_'.length).toLowerCase();
    if (!['assigned', 'reassigned', 'claimed', 'released'].includes(action)) continue;

    const details = asRecord(audit.details);
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
      .select('comment_id, action, actor_id, api_response, created_at')
      .in('comment_id', commentIds)
      .in('action', ['assigned', 'reassigned', 'claimed', 'released'])
      .order('created_at', { ascending: false }),
    supabase
      .from('audit_logs')
      .select('entity_id, action, details, created_at, admin_id')
      .eq('entity_type', 'comment')
      .in('entity_id', commentIds)
      .order('created_at', { ascending: false }),
  ]);

  if (actionsError) throw new Error(`Failed to load comment assignment actions: ${actionsError.message}`);
  if (auditError) throw new Error(`Failed to load comment assignment audit history: ${auditError.message}`);

  return resolveCommentAssignments(actions || [], auditRecords || []);
}

export function getEscalationDetails(actions: Array<{
  action: string;
  reason: string;
  api_response: unknown;
}>, legacyNotifications: Array<{ title: string }> = []): { reason: string | null; priority: string | null } {
  const escalation = actions.find((action) => action.action === 'escalated');
  if (!escalation) return { reason: null, priority: null };

  const state = getCommentState(escalation.api_response);
  const response = asRecord(escalation.api_response);
  const storedPriority = state.escalation_priority ?? response?.escalation_priority;
  const legacyPriority = legacyNotifications
    .map((notification) => notification.title.match(/priority\s*\[(low|medium|high|urgent)\]/i)?.[1]?.toLowerCase())
    .find(Boolean);
  const priority = storedPriority ?? legacyPriority;
  return {
    reason: escalation.reason || null,
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
