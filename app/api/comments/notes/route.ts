import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth/session';

const NOTES_UNAVAILABLE_ERROR =
  'Internal notes are unavailable because public.comment_notes is not present in the connected Supabase database.';

function unavailable() {
  return NextResponse.json({ error: NOTES_UNAVAILABLE_ERROR }, { status: 501 });
}

export async function GET() {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: 'Active administrator account required.' }, { status: 401 });
  }
  return unavailable();
}

export async function POST() {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: 'Active administrator account required.' }, { status: 401 });
  }
  return unavailable();
}
