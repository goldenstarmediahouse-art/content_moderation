import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { Database } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const admin = await requireSuperAdmin();
    const body = await request.json();
    const { ruleId, is_enabled, severity, action, description } = body;

    if (!ruleId) {
      return NextResponse.json({ error: 'ruleId is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const updatePayload: Database['public']['Tables']['moderation_rules']['Update'] = {
      updated_at: new Date().toISOString(),
    };

    if (typeof is_enabled === 'boolean') updatePayload.is_enabled = is_enabled;
    if (severity) updatePayload.severity = severity;
    if (action) updatePayload.action = action;
    if (description) updatePayload.description = description;

    const { data: updatedRule, error } = await supabase
      .from('moderation_rules')
      .update(updatePayload)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      action: 'UPDATE_MODERATION_RULE',
      entity_type: 'moderation_rules',
      entity_id: ruleId,
      details: updatePayload as any,
    });

    return NextResponse.json({ success: true, rule: updatedRule });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
