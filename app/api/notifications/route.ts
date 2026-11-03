import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireActiveAdmin();
    const body = await request.json();
    const { action, notificationId } = body;
    const supabase = createAdminClient();

    if (action === 'mark_read') {
      if (!notificationId) {
        return NextResponse.json({ error: 'notificationId required' }, { status: 400 });
      }

      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      return NextResponse.json({ success: true, notificationId });
    }

    if (action === 'mark_all_read') {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
