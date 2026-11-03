import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Verify user is an active admin in admin_users table
    const { data: adminData, error: adminErr } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', authData.user.id)
      .eq('is_active', true)
      .single();

    const adminRecord = adminData as Database['public']['Tables']['admin_users']['Row'] | null;

    if (adminErr || !adminRecord) {
      // User has Supabase auth account but is not authorized as an active admin
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: 'Access denied: You are not authorized as an active church administrator.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: adminRecord.id,
        email: adminRecord.email,
        role: adminRecord.role,
        full_name: adminRecord.full_name,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}
