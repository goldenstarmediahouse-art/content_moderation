import { createAdminClient } from './admin';
import { createServerSupabaseClient } from './server';

/**
 * Resolves a Supabase client suitable for server operations.
 * If SUPABASE_SERVICE_ROLE_KEY is set to a real key (not a placeholder),
 * returns the privileged admin client.
 * Otherwise, falls back to the authenticated user's session client where RLS
 * policies allow active admins and super admins to manage data.
 */
export async function getScopedAdminSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isRealServiceRoleKey =
    Boolean(serviceRoleKey) &&
    !serviceRoleKey?.includes('placeholder') &&
    (serviceRoleKey?.length || 0) > 30;

  if (isRealServiceRoleKey) {
    try {
      return createAdminClient();
    } catch {
      // Fall through to session client
    }
  }

  try {
    return await createServerSupabaseClient();
  } catch {
    return createAdminClient();
  }
}
