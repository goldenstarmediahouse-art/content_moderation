import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canClaimAssignment,
  canReassignAssignment,
  canReleaseAssignment,
  loadCommentAssignments,
  UNKNOWN_ASSIGNEE_ID,
} from '@/lib/comments/comment-state';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireActiveAdmin();
    const body = await request.json();

    const { commentId, action, targetModeratorId, reason } = body as {
      commentId: string;
      action: 'claim' | 'assign' | 'reassign' | 'release';
      targetModeratorId?: string;
      reason?: string;
    };

    if (!commentId || !action) {
      return NextResponse.json({ error: 'commentId and action are required.' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch current comment state
    const { data: commentRow, error: fetchErr } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .single();

    if (fetchErr || !commentRow) {
      return NextResponse.json({ error: 'Comment record not found' }, { status: 404 });
    }
    const assignments = await loadCommentAssignments(supabase, [commentRow.id]);
    const currentAssignedTo = assignments.get(commentRow.id)?.assignedTo || null;

    const { data: commentPost } = commentRow.post_id
      ? await supabase.from('posts').select('page_id').eq('id', commentRow.post_id).maybeSingle()
      : { data: null };
    const pageId = commentPost?.page_id || null;

    let newAssignedTo: string | null = null;
    let actionType: 'claimed' | 'assigned' | 'reassigned' | 'released' = 'claimed';
    let actionDescription = '';

    // 2. Process specific assignment action
    if (action === 'claim') {
      // Check if already claimed by someone else
      if (!canClaimAssignment(currentAssignedTo, admin.id)) {
        const { data: otherAdmin } = currentAssignedTo
          ? await supabase
            .from('admin_users')
            .select('full_name, email')
            .eq('id', currentAssignedTo)
            .maybeSingle()
          : { data: null };
        const otherName = otherAdmin?.full_name || otherAdmin?.email ||
          (currentAssignedTo === UNKNOWN_ASSIGNEE_ID
            ? 'a historical assignee with unavailable identity'
            : 'another moderator');
        return NextResponse.json(
          {
            error: `Cannot claim: This case was already claimed by ${otherName}.`,
          },
          { status: 409 }
        );
      }

      newAssignedTo = admin.id;
      actionType = 'claimed';
      actionDescription = `${admin.full_name || admin.email} claimed unassigned comment`;
    } else if (action === 'assign') {
      if (admin.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only a Super Admin can assign cases to other moderators.' }, { status: 403 });
      }

      if (!targetModeratorId) {
        return NextResponse.json({ error: 'targetModeratorId is required to assign.' }, { status: 400 });
      }

      newAssignedTo = targetModeratorId;
      actionType = 'assigned';
      actionDescription = `Super Admin assigned case to moderator`;
    } else if (action === 'reassign') {
      // Allowed for Super Admin or current assignee
      if (!canReassignAssignment(currentAssignedTo, admin.id, admin.role === 'super_admin')) {
        return NextResponse.json({ error: 'You do not have permission to reassign this case.' }, { status: 403 });
      }

      if (!targetModeratorId) {
        return NextResponse.json({ error: 'targetModeratorId is required to reassign.' }, { status: 400 });
      }

      newAssignedTo = targetModeratorId;
      actionType = 'reassigned';
      actionDescription = `Reassigned from ${currentAssignedTo ? 'previous assignee' : 'queue'} by ${admin.full_name || admin.email}`;
    } else if (action === 'release') {
      // Allowed for Super Admin or current assignee
      if (!canReleaseAssignment(currentAssignedTo, admin.id, admin.role === 'super_admin')) {
        return NextResponse.json({ error: 'You cannot release an assignment that is not assigned to you.' }, { status: 403 });
      }

      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: 'Releasing a case back to the queue requires a stated reason.' }, { status: 400 });
      }

      newAssignedTo = null;
      actionType = 'released';
      actionDescription = `Released back to unassigned queue: ${reason}`;
    }

    // Store assignment state in the action history because the comments table has no assignment columns.
    const assignmentTime = newAssignedTo ? new Date().toISOString() : null;
    const { error: actionError } = await supabase.from('moderation_actions').insert({
      comment_id: commentRow.id,
      action: actionType,
      reason: reason ? `${actionDescription} (${reason})` : actionDescription,
      actor_type: admin.role,
      actor_id: admin.id,
      outcome: 'success',
      api_response: {
        comment_state: {
          assigned_to: newAssignedTo,
          assigned_at: assignmentTime,
        },
      },
    });
    if (actionError) {
      return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    // 5. Notify target moderator if newly assigned or reassigned
    if (newAssignedTo && newAssignedTo !== admin.id) {
      await supabase.from('notifications').insert({
        admin_id: newAssignedTo,
        title: actionType === 'reassigned' ? 'Case Reassigned To You' : 'New Case Assigned To You',
        message: `${admin.full_name || admin.email} assigned comment "${commentRow.message.slice(0, 80)}" to your queue.`,
        type: actionType === 'reassigned' ? 'reassignment' : 'assignment',
        severity: 'medium',
        comment_id: commentRow.id,
        page_id: pageId,
      });
    }

    // 6. Audit Log
    await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      action: `COMMENT_${actionType.toUpperCase()}`,
      entity_type: 'comment',
      entity_id: commentRow.id,
      details: {
        previous_assignee: currentAssignedTo,
        new_assignee: newAssignedTo,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      commentId: commentRow.id,
      actionType,
      assigned_to: newAssignedTo,
    });
  } catch (err: any) {
    console.error('Error handling comment assignment:', err);
    return NextResponse.json({ error: err.message || 'Server error processing assignment' }, { status: 500 });
  }
}
