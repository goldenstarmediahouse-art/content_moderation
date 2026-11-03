import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const { data: comment, error: fetchErr } = await supabase
      .from('comments')
      .select('*, assigned_admin:admin_users!comments_assigned_to_fkey(*)')
      .eq('id', commentId)
      .single();

    if (fetchErr || !comment) {
      return NextResponse.json({ error: 'Comment record not found' }, { status: 404 });
    }

    let newAssignedTo: string | null = null;
    let actionType: 'claimed' | 'assigned' | 'reassigned' | 'released' = 'claimed';
    let actionDescription = '';

    // 2. Process specific assignment action
    if (action === 'claim') {
      // Check if already claimed by someone else
      if (comment.assigned_to && comment.assigned_to !== admin.id) {
        const otherName = (comment as any).assigned_admin?.full_name || (comment as any).assigned_admin?.email || 'another moderator';
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
      if (admin.role !== 'super_admin' && comment.assigned_to !== admin.id) {
        return NextResponse.json({ error: 'You do not have permission to reassign this case.' }, { status: 403 });
      }

      if (!targetModeratorId) {
        return NextResponse.json({ error: 'targetModeratorId is required to reassign.' }, { status: 400 });
      }

      newAssignedTo = targetModeratorId;
      actionType = 'reassigned';
      actionDescription = `Reassigned from ${comment.assigned_to ? 'previous assignee' : 'queue'} by ${admin.full_name || admin.email}`;
    } else if (action === 'release') {
      // Allowed for Super Admin or current assignee
      if (admin.role !== 'super_admin' && comment.assigned_to !== admin.id) {
        return NextResponse.json({ error: 'You cannot release an assignment that is not assigned to you.' }, { status: 403 });
      }

      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: 'Releasing a case back to the queue requires a stated reason.' }, { status: 400 });
      }

      newAssignedTo = null;
      actionType = 'released';
      actionDescription = `Released back to unassigned queue: ${reason}`;
    }

    // 3. Update comments table
    const { error: updateErr } = await supabase
      .from('comments')
      .update({
        assigned_to: newAssignedTo,
        assigned_at: newAssignedTo ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', comment.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 4. Record action in moderation_actions
    await supabase.from('moderation_actions').insert({
      comment_id: comment.id,
      action: actionType,
      reason: reason ? `${actionDescription} (${reason})` : actionDescription,
      actor_type: admin.role,
      actor_id: admin.id,
      outcome: 'success',
    });

    // 5. Notify target moderator if newly assigned or reassigned
    if (newAssignedTo && newAssignedTo !== admin.id) {
      await supabase.from('notifications').insert({
        admin_id: newAssignedTo,
        title: actionType === 'reassigned' ? 'Case Reassigned To You' : 'New Case Assigned To You',
        message: `${admin.full_name || admin.email} assigned comment "${comment.message.slice(0, 80)}" to your queue.`,
        type: actionType === 'reassigned' ? 'reassignment' : 'assignment',
        severity: 'medium',
        comment_id: comment.id,
        page_id: comment.page_id,
      });
    }

    // 6. Audit Log
    await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      action: `COMMENT_${actionType.toUpperCase()}`,
      entity_type: 'comment',
      entity_id: comment.id,
      details: {
        previous_assignee: comment.assigned_to,
        new_assignee: newAssignedTo,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      commentId: comment.id,
      actionType,
      assigned_to: newAssignedTo,
    });
  } catch (err: any) {
    console.error('Error handling comment assignment:', err);
    return NextResponse.json({ error: err.message || 'Server error processing assignment' }, { status: 500 });
  }
}
