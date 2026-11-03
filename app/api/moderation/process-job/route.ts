import { NextRequest, NextResponse } from 'next/server';
import { requireActiveAdmin } from '@/lib/auth/session';
import { processModerationJob } from '@/lib/moderation/job-runner';

export async function POST(request: NextRequest) {
  try {
    // Authenticate administrator
    await requireActiveAdmin();

    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const result = await processModerationJob(jobId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to process job' },
      { status: 500 }
    );
  }
}
