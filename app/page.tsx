import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ShieldAlert,
  MessageSquare,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Share2,
  ArrowUpRight,
  Users,
} from 'lucide-react';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { ModerationStatusBadge, EscalationPriorityBadge } from '@/components/ui/badge';
import { CommentWithDetails, Database } from '@/types/database';
import { enrichCommentsWithDetails } from '@/lib/comments/enrich-comments';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect('/login');
  }

  const supabase = await createServerSupabaseClient();

  // 1. Fetch exact database metrics
  const [
    { count: totalComments },
    { count: awaitingReview },
    { count: commentsFlagged },
    { count: commentsHidden },
    { count: escalatedCases },
  ] = await Promise.all([
    supabase.from('comments').select('*', { count: 'exact', head: true }),
    supabase.from('comments').select('*', { count: 'exact', head: true }).in('moderation_status', ['pending', 'review_required']),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('moderation_status', 'flagged'),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('moderation_status', 'hidden'),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('moderation_status', 'escalated'),
  ]);

  // 2. Fetch Priority Review & Escalated Comments
  const { data: rawPriorityComments } = await supabase
    .from('comments')
    .select('*')
    .in('moderation_status', ['escalated', 'review_required', 'pending'])
    .order('comment_created_at', { ascending: false })
    .limit(6);

  const priorityComments: CommentWithDetails[] = await enrichCommentsWithDetails(supabase, rawPriorityComments || []);

  // 3. Fetch Recent Moderation Activity
  const { data: rawRecentActions } = await supabase
    .from('moderation_actions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8);

  const recentActions = (rawRecentActions || []) as Database['public']['Tables']['moderation_actions']['Row'][];

  // 4. Fetch Active Moderators and their assigned case counts
  const { data: rawModerators } = await supabase
    .from('admin_users')
    .select('*')
    .eq('is_active', true)
    .order('role', { ascending: false });

  const moderators = (rawModerators || []) as Database['public']['Tables']['admin_users']['Row'][];

  // 5. Fetch Connected Facebook Pages
  const { data: rawPages } = await supabase
    .from('facebook_pages')
    .select('id, page_id, name, is_monitored, auto_hide_enabled, connection_status, webhook_subscribed')
    .order('name');

  const pages = (rawPages || []) as Database['public']['Tables']['facebook_pages']['Row'][];

  return (
    <AppShell admin={admin} title="Moderation Operations Overview">
      <div className="space-y-6">
        {/* Real Operational Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider block">
              Total Ingested
            </span>
            <div className="text-xl font-bold text-charcoal-100 font-mono">
              {totalComments ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Live database records</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
              Awaiting Review
            </span>
            <div className="text-xl font-bold text-amber-400 font-mono">
              {awaitingReview ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Needs human decision</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider block">
              Flagged Cases
            </span>
            <div className="text-xl font-bold text-charcoal-100 font-mono">
              {commentsFlagged ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Under moderator review</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block">
              Hidden Decisions
            </span>
            <div className="text-xl font-bold text-red-400 font-mono">
              {commentsHidden ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Marked for hiding</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-red-500 uppercase tracking-wider block">
              Escalated Cases
            </span>
            <div className="text-xl font-bold text-red-500 font-mono">
              {escalatedCases ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Super Admin oversight</span>
          </div>
        </div>

        {/* Priority Review & Escalations Section */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-charcoal-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
                Priority Cases Requiring Moderator Review ({priorityComments.length})
              </h2>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <Link
                href="/escalations"
                className="text-red-400 hover:text-red-300 font-medium flex items-center space-x-1"
              >
                <span>Escalations Queue</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <span className="text-charcoal-700">•</span>
              <Link
                href="/queue"
                className="text-charcoal-400 hover:text-charcoal-200 flex items-center space-x-1"
              >
                <span>Full Review Queue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {priorityComments.length === 0 ? (
            <div className="p-8 text-center text-xs text-charcoal-500 space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto opacity-70" />
              <p className="font-medium text-charcoal-400">Review Queue is Clear</p>
              <p>No comments are currently pending moderation or escalated for review.</p>
            </div>
          ) : (
            <div className="divide-y divide-charcoal-800">
              {priorityComments.map((c) => {
                const assignedName = c.assigned_admin?.full_name || c.assigned_admin?.email || 'Unassigned';

                return (
                  <div key={c.id} className="p-4 hover:bg-charcoal-850/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="font-semibold text-charcoal-200">
                            {c.commenter_name || 'Facebook User'}
                          </span>
                          <span className="text-charcoal-600">•</span>
                          <span className="text-charcoal-400 font-medium">
                            {c.page?.name || 'Church Page'}
                          </span>
                          <span className="text-charcoal-600">•</span>
                          <span className="text-charcoal-500 font-mono text-[11px]">
                            {new Date(c.created_time).toLocaleTimeString()}
                          </span>
                          {c.is_escalated && (
                            <EscalationPriorityBadge priority={c.escalation_priority} />
                          )}
                        </div>

                        <p className="text-xs text-charcoal-200 bg-charcoal-950 p-2.5 rounded border border-charcoal-800 leading-relaxed select-text">
                          {c.message}
                        </p>

                        <div className="flex items-center space-x-3 text-xs text-charcoal-500 pt-0.5">
                          <span>
                            Assigned to: <strong className="text-charcoal-300 font-mono">{assignedName}</strong>
                          </span>
                          {c.escalation_reason && (
                            <>
                              <span>•</span>
                              <span className="text-red-400/90 truncate">
                                Escalation: {c.escalation_reason}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0 flex items-center space-x-2">
                        <Link
                          href="/queue"
                          className="px-2.5 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 text-xs font-medium border border-charcoal-700 transition-colors"
                        >
                          Review Case
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lower Grid: Moderator Roster + Recent Moderation Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Moderator Team Roster */}
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-charcoal-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-charcoal-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
                  Church Moderator Team ({moderators.length})
                </h3>
              </div>
              <Link
                href="/admins"
                className="text-xs text-charcoal-400 hover:text-charcoal-200"
              >
                Manage Accounts
              </Link>
            </div>

            <div className="divide-y divide-charcoal-800 text-xs">
              {moderators.map((m) => (
                <div key={m.id} className="p-3.5 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-charcoal-200 flex items-center space-x-2">
                      <span>{m.full_name || m.email}</span>
                      {m.id === admin.id && (
                        <span className="text-[10px] text-emerald-400 uppercase font-mono">(You)</span>
                      )}
                    </div>
                    <div className="text-[11px] text-charcoal-500 font-mono">{m.email}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                      m.role === 'super_admin'
                        ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                        : 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                    }`}
                  >
                    {m.role === 'super_admin' ? 'Super Admin' : 'Moderator'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Moderation Activity */}
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-charcoal-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-charcoal-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
                  Recent Moderation Activity
                </h3>
              </div>
              <Link
                href="/history"
                className="text-xs text-charcoal-400 hover:text-charcoal-200"
              >
                Full Audit Trail
              </Link>
            </div>

            {!recentActions || recentActions.length === 0 ? (
              <div className="p-6 text-center text-xs text-charcoal-500">
                No moderation decisions recorded in audit history yet.
              </div>
            ) : (
              <div className="divide-y divide-charcoal-800 text-xs">
                {recentActions.map((act) => (
                  <div key={act.id} className="p-3 flex items-start justify-between">
                    <div className="space-y-0.5 max-w-sm sm:max-w-md">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-charcoal-200 uppercase tracking-wide text-[11px]">
                          {act.action_type}
                        </span>
                        <span className="text-charcoal-500 text-[11px]">
                          by <span className="font-mono text-charcoal-300">{act.performed_by ? moderators.find((moderator) => moderator.id === act.performed_by)?.role || 'moderator' : /auto-|by ai|detected by ai/i.test(act.reason || '') ? 'ai' : 'system'}</span>
                        </span>
                      </div>
                      <p className="text-charcoal-400 text-[11px] truncate">
                        {act.reason}
                      </p>
                    </div>
                    <span className="text-[10px] text-charcoal-500 font-mono flex-shrink-0">
                      {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
