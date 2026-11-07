import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto/token-encryption';
import { hideFacebookComment, unhideFacebookComment } from '@/lib/facebook/graph-api';
import { Database, EscalationPriority, ModerationActionType, ModerationStatus } from '@/types/database';
import {
  canModerateAssignment,
  getExternalActionStatus,
  loadCommentAssignments,
} from '@/lib/comments/comment-state';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireActiveAdmin();
    const body = await request.json();

    const {
      commentId,
      action,
      reason,
      escalationPriority,
      isOverride,
      overrideReason,
    } = body as {
      commentId: string;
      action: ModerationActionType;
      reason: string;
      escalationPriority?: EscalationPriority;
      isOverride?: boolean;
      overrideReason?: string;
    };

    if (!commentId || !action) {
      return NextResponse.json({ error: 'Missing commentId or action' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch target comment with current assignment and page info
    const { data: comment, error: fetchErr } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .single();

    if (fetchErr || !comment) {
      return NextResponse.json({ error: 'Comment record not found in database' }, { status: 404 });
    }
    const { data: actionHistory, error: actionHistoryError } = await supabase
      .from('moderation_actions')
      .select('*')
      .eq('comment_id', comment.id)
      .order('created_at', { ascending: false });
    if (actionHistoryError) {
      return NextResponse.json({ error: actionHistoryError.message }, { status: 500 });
    }

    const assignments = await loadCommentAssignments(supabase, [comment.id]);
    const assignedTo = assignments.get(comment.id)?.assignedTo || null;
    const initialExternalActionStatus = getExternalActionStatus(actionHistory || []);
    const { data: commentPost } = comment.post_id
      ? await supabase.from('posts').select('page_id').eq('id', comment.post_id).maybeSingle()
      : { data: null };
    const pageId = commentPost?.page_id || null;
    const { data: assignedAdmin } = assignedTo
      ? await supabase.from('admin_users').select('full_name, email').eq('id', assignedTo).maybeSingle()
      : { data: null };

    // 2. Concurrency Lock: Prevent two moderators from acting simultaneously on the same case
    if (!canModerateAssignment(assignedTo, admin.id, admin.role === 'super_admin')) {
      const assignedName = assignedAdmin?.full_name || assignedAdmin?.email || 'another moderator';
      return NextResponse.json(
        {
          error: `Concurrency Conflict: This comment is actively assigned to ${assignedName}. Only they or a Super Admin can take action on it.`,
        },
        { status: 409 }
      );
    }

    // Super Admin Override verification
    if (isOverride && admin.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only a Super Admin can perform a decision override.' }, { status: 403 });
    }

    let newStatus: ModerationStatus = comment.moderation_status;
    let externalActionStatus = initialExternalActionStatus;
    let isHidden = comment.is_hidden;
    let isDeleted = comment.is_deleted;
    let finalReason = reason;
    let apiResponse: any = null;
    let outcome: 'success' | 'failed' = 'success';

    // Fetch encrypted token if action requires external Meta Graph API call
    let tokenRow: { encrypted_access_token: unknown } | null = null;
    if ((action === 'hidden' || action === 'restored') && pageId) {
      const { data } = await supabase
        .from('page_tokens')
        .select('encrypted_access_token')
        .eq('page_id', pageId)
        .maybeSingle();
      tokenRow = data;
    }

    // 3. Map action to status & external sync states
    switch (action) {
      case 'approved':
        newStatus = 'approved';
        break;

      case 'flagged':
        if (!reason || !reason.trim()) {
          return NextResponse.json({ error: 'Flagging a comment requires a recorded explanation.' }, { status: 400 });
        }
        newStatus = 'flagged';
        break;

      case 'escalated':
        if (!reason || !reason.trim()) {
          return NextResponse.json({ error: 'Escalating a comment requires a detailed reason for Super Admin review.' }, { status: 400 });
        }
        newStatus = 'escalated';
        break;

      case 'hidden':
        if (tokenRow?.encrypted_access_token) {
          try {
            const decrypted = decryptToken(tokenRow.encrypted_access_token as any);
            const fbRes = await hideFacebookComment(comment.facebook_comment_id, decrypted);
            apiResponse = fbRes;
            if (fbRes.success) {
              externalActionStatus = 'synced_facebook';
              isHidden = true;
            } else {
              externalActionStatus = 'failed_facebook';
              outcome = 'failed';
            }
          } catch {
            externalActionStatus = 'failed_facebook';
            outcome = 'failed';
          }
        } else {
          // Pre-Facebook Phase: internal moderation decision preserved without false claim of Facebook execution
          externalActionStatus = 'pending_facebook_sync';
          isHidden = true;
          apiResponse = { note: 'Internal moderation decision recorded: marked hidden locally. Facebook API sync pending connection.' };
        }
        newStatus = 'hidden';
        break;

      case 'deleted':
        if (admin.role !== 'super_admin') {
          return NextResponse.json({ error: 'Deletion request requires Super Admin approval.' }, { status: 403 });
        }
        if (!reason || !reason.trim()) {
          return NextResponse.json({ error: 'Deletion requires a recorded justification.' }, { status: 400 });
        }
        newStatus = 'deleted';
        isDeleted = true;
        externalActionStatus = 'pending_facebook_sync';
        apiResponse = { note: 'Internal deletion decision recorded. Preserved in database permanently for audit history.' };
        break;

      case 'restored':
        newStatus = 'restored';
        isHidden = false;
        isDeleted = false;
        if (tokenRow?.encrypted_access_token) {
          try {
            const decrypted = decryptToken(tokenRow.encrypted_access_token as any);
            const fbRes = await unhideFacebookComment(comment.facebook_comment_id, decrypted);
            apiResponse = fbRes;
            if (fbRes.success) {
              externalActionStatus = 'synced_facebook';
            } else {
              externalActionStatus = 'failed_facebook';
              outcome = 'failed';
            }
          } catch {
            externalActionStatus = 'failed_facebook';
            outcome = 'failed';
          }
        } else {
          externalActionStatus = 'pending_facebook_sync';
          apiResponse = { note: 'Internal moderation decision recorded: marked restored locally. Facebook API sync pending connection.' };
        }
        break;

      case 'overridden':
        if (!overrideReason || !overrideReason.trim()) {
          return NextResponse.json({ error: 'Decision override requires a recorded reason.' }, { status: 400 });
        }
        finalReason = `Super Admin Override: ${overrideReason}`;
        break;

      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    // 4. Update comment record in database
    const updatePayload: Database['public']['Tables']['comments']['Update'] = {
      moderation_status: newStatus,
      is_hidden: isHidden,
      is_deleted: isDeleted,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('comments')
      .update(updatePayload)
      .eq('id', comment.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 5. Insert record into moderation_actions table
    const { error: actionInsertError } = await supabase.from('moderation_actions').insert({
      comment_id: comment.id,
      action,
      reason: finalReason || `Manual decision by ${admin.role} (${admin.full_name || admin.email})`,
      actor_type: admin.role,
      actor_id: admin.id,
      api_response: {
        facebook_response: apiResponse,
        comment_state: {
          external_action_status: externalActionStatus,
          escalation_reason: action === 'escalated' ? reason : null,
          escalation_priority: action === 'escalated' ? escalationPriority || 'medium' : null,
        },
      },
      outcome,
    });
    if (actionInsertError) {
      return NextResponse.json({ error: actionInsertError.message }, { status: 500 });
    }

    // 6. Create notifications for escalations or urgent decisions
    if (action === 'escalated') {
      // Notify all Super Admins
      const { data: superAdmins } = await supabase
        .from('admin_users')
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true);

      if (superAdmins) {
        for (const sa of superAdmins) {
          await supabase.from('notifications').insert({
            admin_id: sa.id,
            title: `CASE ESCALATED: Priority [${(escalationPriority || 'medium').toUpperCase()}]`,
            message: `Comment by ${comment.commenter_name || 'User'} was escalated by ${admin.full_name || admin.email}: "${reason}"`,
            type: 'escalation',
            severity: escalationPriority === 'urgent' ? 'critical' : escalationPriority === 'high' ? 'high' : 'medium',
            comment_id: comment.id,
            page_id: pageId,
          });
        }
      }
    }

    // 7. Audit Log
    await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      action: isOverride ? 'COMMENT_OVERRIDE' : `COMMENT_${action.toUpperCase()}`,
      entity_type: 'comment',
      entity_id: comment.id,
      details: {
        previous_status: comment.moderation_status,
        new_status: newStatus,
        reason: finalReason,
        external_action_status: externalActionStatus,
        outcome,
      },
    });

    return NextResponse.json({
      success: true,
      commentId: comment.id,
      action,
      newStatus,
      externalActionStatus,
    });
  } catch (err: any) {
    console.error('Error executing human moderation action:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error executing action' },
      { status: 500 }
    );
  }
}
