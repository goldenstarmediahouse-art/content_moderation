import {
  CommentWithDetails,
  Database,
  ExternalActionStatus,
} from '@/types/database';
import type { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getCommentState,
  getExternalActionStatus,
  getEscalationDetails,
  resolveCommentAssignments,
} from './comment-state';

type CommentRow = Database['public']['Tables']['comments']['Row'];
type ActionRow = Database['public']['Tables']['moderation_actions']['Row'];
type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function enrichCommentsWithDetails(
  supabase: ServerSupabaseClient,
  comments: CommentRow[]
): Promise<CommentWithDetails[]> {
  if (comments.length === 0) return [];

  const commentIds = comments.map((comment) => comment.id);
  const postIds = Array.from(new Set(comments.flatMap((comment) => comment.post_id ? [comment.post_id] : [])));
  let postRows: Database['public']['Tables']['posts']['Row'][] = [];
  if (postIds.length > 0) {
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);
    if (postsError) throw new Error(`Failed to load comment posts: ${postsError.message}`);
    postRows = (posts || []) as Database['public']['Tables']['posts']['Row'][];
  }

  const [
    { data: actions, error: actionsError },
    { data: auditRecords, error: auditError },
    { data: results, error: resultsError },
    { data: notes, error: notesError },
    { data: escalationNotifications, error: escalationNotificationsError },
  ] = await Promise.all([
    supabase.from('moderation_actions').select('*').in('comment_id', commentIds).order('created_at', { ascending: false }),
    supabase.from('audit_logs').select('entity_id, action, details, created_at, admin_id').eq('entity_type', 'comment').in('entity_id', commentIds).in('action', ['COMMENT_ASSIGNED', 'COMMENT_REASSIGNED', 'COMMENT_CLAIMED', 'COMMENT_RELEASED']).order('created_at', { ascending: false }),
    supabase.from('moderation_results').select('*').in('comment_id', commentIds),
    supabase.from('comment_notes').select('*').in('comment_id', commentIds).order('created_at', { ascending: false }),
    supabase.from('notifications').select('comment_id, title').eq('type', 'escalation').in('comment_id', commentIds),
  ]);

  if (actionsError) throw new Error(`Failed to load comment actions: ${actionsError.message}`);
  if (auditError) throw new Error(`Failed to load comment assignment history: ${auditError.message}`);
  if (resultsError) throw new Error(`Failed to load moderation results: ${resultsError.message}`);
  if (notesError) throw new Error(`Failed to load comment notes: ${notesError.message}`);
  if (escalationNotificationsError) throw new Error(`Failed to load escalation notifications: ${escalationNotificationsError.message}`);

  const actionRows = (actions || []) as ActionRow[];
  const assignmentByComment = resolveCommentAssignments(actionRows, auditRecords || []);
  const resultRows = (results || []) as Database['public']['Tables']['moderation_results']['Row'][];
  const noteRows = (notes || []) as Database['public']['Tables']['comment_notes']['Row'][];
  const escalationNotificationRows = (escalationNotifications || []) as Pick<
    Database['public']['Tables']['notifications']['Row'],
    'comment_id' | 'title'
  >[];
  const escalationNotificationsByComment = new Map<string, Array<{ title: string }>>();
  for (const notification of escalationNotificationRows) {
    if (!notification.comment_id) continue;
    const existing = escalationNotificationsByComment.get(notification.comment_id) || [];
    existing.push({ title: notification.title });
    escalationNotificationsByComment.set(notification.comment_id, existing);
  }

  const pageIds = Array.from(new Set(postRows.map((post) => post.page_id)));
  const actionAdminIds = Array.from(new Set(actionRows.flatMap((action) => action.actor_id ? [action.actor_id] : [])));
  const assignedIds = Array.from(new Set(Array.from(assignmentByComment.values())
    .flatMap((assignment) => assignment.assignedTo ? [assignment.assignedTo] : [])));
  const noteAdminIds = Array.from(new Set(noteRows.map((note) => note.admin_id)));
  const adminIds = Array.from(new Set([...actionAdminIds, ...assignedIds, ...noteAdminIds]));

  let pageRows: Database['public']['Tables']['facebook_pages']['Row'][] = [];
  if (pageIds.length > 0) {
    const { data: pages, error: pagesError } = await supabase
      .from('facebook_pages')
      .select('*')
      .in('id', pageIds);
    if (pagesError) throw new Error(`Failed to load comment Pages: ${pagesError.message}`);
    pageRows = (pages || []) as Database['public']['Tables']['facebook_pages']['Row'][];
  }

  let adminRows: Database['public']['Tables']['admin_users']['Row'][] = [];
  if (adminIds.length > 0) {
    const { data: admins, error: adminsError } = await supabase
      .from('admin_users')
      .select('*')
      .in('id', adminIds);
    if (adminsError) throw new Error(`Failed to load comment administrators: ${adminsError.message}`);
    adminRows = (admins || []) as Database['public']['Tables']['admin_users']['Row'][];
  }

  const postById = new Map(postRows.map((post) => [post.id, post]));
  const pageById = new Map(pageRows.map((page) => [page.id, page]));
  const adminById = new Map(adminRows.map((admin) => [admin.id, admin]));
  const actionsByComment = new Map<string, ActionRow[]>();
  const resultByComment = new Map(resultRows.map((result) => [result.comment_id, result]));
  const notesByComment = new Map<string, Database['public']['Tables']['comment_notes']['Row'][]>();

  for (const action of actionRows) {
    const existing = actionsByComment.get(action.comment_id) || [];
    existing.push(action);
    actionsByComment.set(action.comment_id, existing);
  }
  for (const note of noteRows) {
    const existing = notesByComment.get(note.comment_id) || [];
    existing.push(note);
    notesByComment.set(note.comment_id, existing);
  }

  return comments.map((comment) => {
    const post = comment.post_id ? postById.get(comment.post_id) : undefined;
    const page = post ? pageById.get(post.page_id) : undefined;
    const commentActions = actionsByComment.get(comment.id) || [];
    const assignment = assignmentByComment.get(comment.id);
    const escalation = getEscalationDetails(
      commentActions,
      escalationNotificationsByComment.get(comment.id) || []
    );
    const assignedTo = assignment?.assignedTo || null;
    const externalActionStatus = getExternalActionStatus(commentActions);
    const commentNotes = notesByComment.get(comment.id) || [];

    return {
      ...comment,
      page_id: post?.page_id || null,
      facebook_post_id: post?.facebook_post_id || null,
      parent_comment_id: comment.parent_facebook_comment_id,
      created_time: comment.comment_created_at,
      assigned_to: assignedTo,
      assigned_at: assignment?.assignedAt || null,
      is_escalated: comment.moderation_status === 'escalated',
      escalation_reason: escalation.reason,
      escalation_priority:
        escalation.priority === 'low' || escalation.priority === 'medium' ||
        escalation.priority === 'high' || escalation.priority === 'urgent'
          ? escalation.priority
          : null,
      external_action_status:
        externalActionStatus as ExternalActionStatus,
      page,
      post,
      assigned_admin: assignedTo ? adminById.get(assignedTo) || null : null,
      moderation_result: resultByComment.get(comment.id),
      actions: commentActions.map((action) => ({
        ...action,
        admin: action.actor_id ? adminById.get(action.actor_id) || null : null,
      })),
      notes: commentNotes.map((note) => ({
        ...note,
        admin: adminById.get(note.admin_id) || null,
      })),
    };
  });
}
