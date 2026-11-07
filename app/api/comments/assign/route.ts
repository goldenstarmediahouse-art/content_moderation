import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildAssignmentRecords,
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
    const now = new Date().toISOString();
    const assignmentTime = newAssignedTo ? now : null;
    const records = buildAssignmentRecords({
      commentId: commentRow.id,
      actionType,
      adminId: admin.id,
      description: actionDescription,
      reason: reason ?? null,
      previousAssignee: currentAssignedTo,
      newAssignee: newAssignedTo,
      assignedAt: assignmentTime,
      timestamp: now,
    });
    const { error: actionError } = await supabase.from('moderation_actions').insert(records.action);
    if (actionError) {
      return NextResponse.json({ error: actionError.message }, { status: 500 });
    }

    const warnings: string[] = [];

    // 5. Notify target moderator if newly assigned or reassigned
    if (newAssignedTo && newAssignedTo !== admin.id) {
      const { error: notificationError } = await supabase.from('notifications').insert({
        admin_id: newAssignedTo,
        title: actionType === 'reassigned' ? 'Case Reassigned To You' : 'New Case Assigned To You',
        message: `${admin.full_name || admin.email} assigned comment "${commentRow.message.slice(0, 80)}" to your queue.`,
        notification_type: actionType === 'reassigned' ? 'reassignment' : 'assignment',
        related_comment_id: commentRow.id,
      });
      if (notificationError) {
        console.error(`Assignment notification failed for comment ${commentRow.id}:`, notificationError);
        warnings.push('Assignment was saved, but its notification could not be delivered.');
      }
    }

    // 6. Audit Log
    const { error: auditError } = await supabase.from('audit_logs').insert(records.audit);
    if (auditError) {
      console.error(`Assignment audit insert failed for comment ${commentRow.id}:`, auditError);
      warnings.push('Assignment was saved, but its audit log could not be recorded. Do not retry this assignment.');
    }

    return NextResponse.json({
      success: true,
      commentId: commentRow.id,
      actionType,
      assigned_to: newAssignedTo,
      warnings,
    });
  } catch (err: any) {
    console.error('Error handling comment assignment:', err);
    return NextResponse.json({ error: err.message || 'Server error processing assignment' }, { status: 500 });
  }
}
