import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const path = request.nextUrl.pathname;
  let validSupabaseUrl = false;
  try {
    const parsedUrl = new URL(supabaseUrl);
    validSupabaseUrl =
      (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') &&
      Boolean(parsedUrl.host);
  } catch {
    validSupabaseUrl = false;
  }

  if (
    path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon.ico') ||
    path.startsWith('/api/webhooks') ||
    /\.(?:svg|png|jpe?g|gif|webp)$/.test(path.toLowerCase())
  ) {
    return response;
  }

  if (!validSupabaseUrl || !supabaseAnonKey) {
    if (path === '/login') return response;

    console.error('Supabase authentication is unavailable: required environment variables are missing or invalid.');
    return NextResponse.json(
      { error: 'Authentication is temporarily unavailable. Supabase configuration is missing or invalid.' },
      { status: 503 }
    );
  }

  // Create supabase client to refresh cookies
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = path === '/login';

  // If not authenticated and attempting to access protected route
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If authenticated and visiting /login, redirect to overview
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
