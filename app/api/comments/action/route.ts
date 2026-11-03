import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto/token-encryption';
import { hideFacebookComment, unhideFacebookComment } from '@/lib/facebook/graph-api';
import { ModerationActionType } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireActiveAdmin();
    const body = await request.json();

    const { commentId, action, reason } = body as {
      commentId: string;
      action: ModerationActionType;
      reason: string;
    };

    if (!commentId || !action) {
      return NextResponse.json({ error: 'Missing commentId or action' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch comment with associated page
    const { data: comment, error: fetchErr } = await supabase
      .from('comments')
      .select('*, facebook_pages(*)')
      .eq('id', commentId)
      .single();

    if (fetchErr || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const page = (comment as any).facebook_pages;
    let apiResponse: any = null;
    let outcome: 'success' | 'failed' = 'success';
    let errorMessage: string | undefined;

    // 2. Perform external Facebook API calls if action is hide or restored
    if (action === 'hidden') {
      // Find decrypted token
      const { data: tokenRow } = await supabase
        .from('page_tokens')
        .select('encrypted_access_token')
        .eq('page_id', comment.page_id)
        .maybeSingle();

      if (tokenRow?.encrypted_access_token) {
        try {
          const decrypted = decryptToken(tokenRow.encrypted_access_token);
          const fbRes = await hideFacebookComment(comment.facebook_comment_id, decrypted);
          apiResponse = fbRes;
          if (!fbRes.success) {
            outcome = 'failed';
            errorMessage = fbRes.error;
          }
        } catch (decErr: any) {
          outcome = 'failed';
          errorMessage = `Token decryption failed: ${decErr.message}`;
        }
      } else {
        // Page token not present, perform internal hide but log warning
        outcome = 'success';
        apiResponse = { note: 'Internal hide only. No active Facebook Page token available.' };
      }
    } else if (action === 'restored') {
      const { data: tokenRow } = await supabase
        .from('page_tokens')
        .select('encrypted_access_token')
        .eq('page_id', comment.page_id)
        .maybeSingle();

      if (tokenRow?.encrypted_access_token) {
        try {
          const decrypted = decryptToken(tokenRow.encrypted_access_token);
          const fbRes = await unhideFacebookComment(comment.facebook_comment_id, decrypted);
          apiResponse = fbRes;
          if (!fbRes.success) {
            outcome = 'failed';
            errorMessage = fbRes.error;
          }
        } catch (decErr: any) {
          outcome = 'failed';
          errorMessage = `Token decryption failed: ${decErr.message}`;
        }
      }
    }

    // If Facebook action failed, return error without falsely reporting success
    if (outcome === 'failed') {
      await supabase.from('moderation_actions').insert({
        comment_id: comment.id,
        action,
        reason: reason || 'Manual action attempt failed',
        actor_type: admin.role,
        actor_id: admin.id,
        api_response: { error: errorMessage },
        outcome: 'failed',
      });

      return NextResponse.json(
        { error: errorMessage || 'Facebook action failed on Meta servers' },
        { status: 502 }
      );
    }

    // 3. Update comment status in database
    const newStatus =
      action === 'approved'
        ? 'approved'
        : action === 'hidden'
        ? 'hidden'
        : action === 'restored'
        ? 'restored'
        : 'flagged';

    await supabase
      .from('comments')
      .update({
        moderation_status: newStatus,
        is_hidden: action === 'hidden',
        updated_at: new Date().toISOString(),
      })
      .eq('id', comment.id);

    // 4. Record in moderation_actions
    await supabase.from('moderation_actions').insert({
      comment_id: comment.id,
      action,
      reason: reason || `Manual decision by ${admin.role} (${admin.full_name || admin.email})`,
      actor_type: admin.role,
      actor_id: admin.id,
      api_response: apiResponse,
      outcome: 'success',
    });

    // 5. Record in audit_logs
    await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      action: `COMMENT_${action.toUpperCase()}`,
      entity_type: 'comment',
      entity_id: comment.id,
      details: {
        facebook_comment_id: comment.facebook_comment_id,
        page_id: comment.page_id,
        reason,
        outcome,
      },
    });

    return NextResponse.json({
      success: true,
      commentId: comment.id,
      action,
      newStatus,
    });
  } catch (err: any) {
    console.error('Error executing comment action:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error executing action' },
      { status: 500 }
    );
  }
}
