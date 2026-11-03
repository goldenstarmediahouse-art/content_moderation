import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

export type CurrentAdmin = Database['public']['Tables']['admin_users']['Row'];

/**
 * Retrieves the currently authenticated Supabase user and validates
 * against the admin_users table to ensure active status and assigned role.
 * Returns null if not authenticated, inactive, or not in admin_users.
 */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (adminError || !adminUser) {
      return null;
    }

    return adminUser;
  } catch (err) {
    console.error('Error verifying current admin session:', err);
    return null;
  }
}

/**
 * Checks if the current authenticated user is an active Super Admin.
 */
export async function requireSuperAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Authentication required.');
  }
  if (admin.role !== 'super_admin') {
    throw new Error('Forbidden: Super Admin privilege required.');
  }
  return admin;
}

/**
 * Checks if the current authenticated user is an active Admin (Super Admin or Moderator).
 */
export async function requireActiveAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Active administrator account required.');
  }
  return admin;
}
