import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    await requireActiveAdmin();
    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json({ error: 'commentId query param required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: notes, error } = await supabase
      .from('comment_notes')
      .select('*, admin:admin_users(full_name, email, role)')
      .eq('comment_id', commentId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notes: notes || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireActiveAdmin();
    const body = await request.json();
    const { commentId, note } = body;

    if (!commentId || !note || !note.trim()) {
      return NextResponse.json({ error: 'commentId and note text are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: noteRecord, error: noteErr } = await supabase
      .from('comment_notes')
      .insert({
        comment_id: commentId,
        admin_id: admin.id,
        note: note.trim(),
      })
      .select('*, admin:admin_users(full_name, email, role)')
      .single();

    if (noteErr) {
      return NextResponse.json({ error: noteErr.message }, { status: 500 });
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      action: 'ADD_INTERNAL_NOTE',
      entity_type: 'comment',
      entity_id: commentId,
      details: { note_id: noteRecord.id },
    });

    return NextResponse.json({ success: true, note: noteRecord });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
