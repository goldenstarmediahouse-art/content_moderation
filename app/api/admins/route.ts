import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const body = await request.json();
    const { action } = body;
    const supabase = createAdminClient();

    if (action === 'create_admin' || action === 'create_moderator') {
      const { email, password, full_name, role } = body;
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and temporary password are required' }, { status: 400 });
      }

      const assignedRole: 'super_admin' | 'moderator' =
        role === 'super_admin' ? 'super_admin' : 'moderator';

      // Create Supabase Auth user
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role: assignedRole },
      });

      if (authErr || !authUser.user) {
        return NextResponse.json({ error: authErr?.message || 'Failed to create auth user' }, { status: 500 });
      }

      // Insert into admin_users table
      const { data: adminRecord, error: adminErr } = await supabase
        .from('admin_users')
        .insert({
          id: authUser.user.id,
          email,
          role: assignedRole,
          full_name: full_name || null,
          is_active: true,
        })
        .select()
        .single();

      if (adminErr) {
        // Rollback auth user if admin_users insert failed
        await supabase.auth.admin.deleteUser(authUser.user.id);
        return NextResponse.json({ error: adminErr.message }, { status: 500 });
      }

      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        event_type: assignedRole === 'super_admin' ? 'CREATE_SUPER_ADMIN_ACCOUNT' : 'CREATE_MODERATOR_ACCOUNT',
        description: `Created ${assignedRole === 'super_admin' ? 'Super Admin' : 'Moderator'} account`,
        entity_type: 'admin_users',
        entity_id: adminRecord.id,
        metadata: { email, full_name, role: assignedRole },
      });

      return NextResponse.json({ success: true, user: adminRecord });
    }

    if (action === 'toggle_status') {
      const { targetAdminId, is_active } = body;
      if (!targetAdminId) {
        return NextResponse.json({ error: 'targetAdminId is required' }, { status: 400 });
      }

      if (targetAdminId === admin.id) {
        return NextResponse.json({ error: 'Cannot deactivate your own Super Admin account' }, { status: 400 });
      }

      const { data: updated, error } = await supabase
        .from('admin_users')
        .update({
          is_active: Boolean(is_active),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetAdminId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await supabase.from('audit_logs').insert({
        admin_id: admin.id,
        event_type: `ADMIN_STATUS_${is_active ? 'ACTIVATED' : 'DEACTIVATED'}`,
        description: `${is_active ? 'Activated' : 'Deactivated'} admin account`,
        entity_type: 'admin_users',
        entity_id: targetAdminId,
        metadata: { is_active },
      });

      return NextResponse.json({ success: true, admin: updated });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
