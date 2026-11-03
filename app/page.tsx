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
} from 'lucide-react';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { SeverityBadge } from '@/components/ui/badge';
import { CommentWithDetails, Database } from '@/types/database';

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
    { count: criticalThreats },
  ] = await Promise.all([
    supabase.from('comments').select('*', { count: 'exact', head: true }),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('moderation_status', 'review_required'),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('moderation_status', 'flagged'),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('is_hidden', true),
    supabase.from('moderation_results').select('*', { count: 'exact', head: true }).eq('severity', 'critical'),
  ]);

  // 2. Fetch Priority Review Comments
  const { data: rawPriorityComments } = await supabase
    .from('comments')
    .select('*, page:facebook_pages(*), post:posts(*), moderation_result:moderation_results(*)')
    .eq('moderation_status', 'review_required')
    .order('created_time', { ascending: false })
    .limit(5);

  const priorityComments = (rawPriorityComments || []) as CommentWithDetails[];

  // 3. Fetch Recent Moderation Activity
  const { data: rawRecentActions } = await supabase
    .from('moderation_actions')
    .select('*, comments(message, facebook_comment_id, facebook_pages(name))')
    .order('created_at', { ascending: false })
    .limit(6);

  const recentActions = (rawRecentActions || []) as Array<
    Database['public']['Tables']['moderation_actions']['Row'] & {
      comments: {
        message: string;
        facebook_comment_id: string;
        facebook_pages: { name: string } | null;
      } | null;
    }
  >;

  // 4. Fetch Connected Facebook Pages
  const { data: rawPages } = await supabase
    .from('facebook_pages')
    .select('id, page_id, name, is_monitored, auto_hide_enabled, connection_status, webhook_subscribed')
    .order('name');

  const pages = (rawPages || []) as Database['public']['Tables']['facebook_pages']['Row'][];

  // 5. Fetch Recent Failed Moderation Jobs or Integration Errors
  const { data: rawFailedJobs } = await supabase
    .from('moderation_jobs')
    .select('id, last_error, attempts, updated_at, comment_id')
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .limit(3);

  const failedJobs = (rawFailedJobs || []) as Database['public']['Tables']['moderation_jobs']['Row'][];

  return (
    <AppShell admin={admin} title="Operations Overview">
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
            <span className="text-[10px] text-charcoal-500">Live database count</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
              Awaiting Review
            </span>
            <div className="text-xl font-bold text-amber-400 font-mono">
              {awaitingReview ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Action required</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider block">
              Flagged Items
            </span>
            <div className="text-xl font-bold text-charcoal-100 font-mono">
              {commentsFlagged ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Under observation</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block">
              Hidden on FB
            </span>
            <div className="text-xl font-bold text-red-400 font-mono">
              {commentsHidden ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Suppressed comments</span>
          </div>

          <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
            <span className="text-[11px] font-semibold text-red-500 uppercase tracking-wider block">
              Critical Threats
            </span>
            <div className="text-xl font-bold text-red-500 font-mono">
              {criticalThreats ?? 0}
            </div>
            <span className="text-[10px] text-charcoal-500">Severity level critical</span>
          </div>
        </div>

        {/* Priority Review Queue Section */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-charcoal-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
                Priority Review Queue ({awaitingReview ?? 0})
              </h2>
            </div>
            <Link
              href="/queue"
              className="text-xs text-charcoal-400 hover:text-charcoal-200 flex items-center space-x-1"
            >
              <span>View Full Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {priorityComments.length === 0 ? (
            <div className="p-8 text-center text-xs text-charcoal-500 space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto opacity-70" />
              <p className="font-medium text-charcoal-400">Queue is clear</p>
              <p>No comments currently require human administrator review.</p>
            </div>
          ) : (
            <div className="divide-y divide-charcoal-800">
              {priorityComments.map((c) => {
                const ai = c.moderation_result;
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
                            {c.page?.name || 'Facebook Page'}
                          </span>
                          <span className="text-charcoal-600">•</span>
                          <span className="text-charcoal-500 font-mono text-[11px]">
                            {new Date(c.created_time).toLocaleTimeString()}
                          </span>
                        </div>

                        <p className="text-xs text-charcoal-200 bg-charcoal-950 p-2.5 rounded border border-charcoal-800 leading-relaxed">
                          {c.message}
                        </p>

                        {ai && (
                          <div className="flex items-center space-x-2 text-xs pt-1">
                            <SeverityBadge severity={ai.severity} />
                            <span className="text-charcoal-400 font-medium uppercase text-[10px]">
                              {ai.detected_category}
                            </span>
                            <span className="text-charcoal-600">•</span>
                            <span className="text-charcoal-500 text-[11px] truncate">
                              {ai.explanation}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0 flex items-center space-x-2">
                        <Link
                          href="/queue"
                          className="px-2.5 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 text-xs font-medium border border-charcoal-700 transition-colors"
                        >
                          Review Decision
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lower Grid: Connected Pages + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Connected Facebook Pages */}
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-charcoal-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Share2 className="w-4 h-4 text-charcoal-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
                  Monitored Facebook Pages ({pages?.length ?? 0})
                </h3>
              </div>
              <Link
                href="/pages"
                className="text-xs text-charcoal-400 hover:text-charcoal-200"
              >
                Manage Pages
              </Link>
            </div>

            {!pages || pages.length === 0 ? (
              <div className="p-6 text-center text-xs text-charcoal-500 space-y-2">
                <p>No Facebook Pages connected yet.</p>
                <Link
                  href="/pages"
                  className="inline-block px-3 py-1.5 rounded bg-charcoal-800 text-charcoal-200 hover:bg-charcoal-700 border border-charcoal-700 text-xs"
                >
                  Connect First Page
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-charcoal-800 text-xs">
                {pages.map((p) => (
                  <div key={p.id} className="p-3.5 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-charcoal-200">{p.name}</div>
                      <div className="text-[11px] text-charcoal-500 font-mono">ID: {p.page_id}</div>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px]">
                      <span
                        className={`px-2 py-0.5 rounded border ${
                          p.connection_status === 'connected'
                            ? 'bg-status-safe-bg text-emerald-400 border-status-safe-border'
                            : 'bg-status-threat-bg text-red-400 border-status-threat-border'
                        }`}
                      >
                        {p.connection_status}
                      </span>
                      <span className="text-charcoal-400">
                        {p.is_monitored ? 'Monitoring Active' : 'Monitoring Paused'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                Full History
              </Link>
            </div>

            {!recentActions || recentActions.length === 0 ? (
              <div className="p-6 text-center text-xs text-charcoal-500">
                No moderation actions recorded in database yet.
              </div>
            ) : (
              <div className="divide-y divide-charcoal-800 text-xs">
                {recentActions.map((act) => (
                  <div key={act.id} className="p-3 flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-charcoal-200 uppercase tracking-wide text-[11px]">
                          {act.action}
                        </span>
                        <span className="text-charcoal-500 text-[11px]">
                          by <span className="font-mono text-charcoal-300">{act.actor_type}</span>
                        </span>
                      </div>
                      <p className="text-charcoal-400 text-[11px] truncate max-w-xs sm:max-w-md">
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

        {/* Failed Background Jobs Alert Section (Only visible when real issues exist) */}
        {failedJobs && failedJobs.length > 0 && (
          <div className="p-4 rounded-lg bg-red-950/20 border border-red-900/40 space-y-2">
            <div className="flex items-center space-x-2 text-red-400 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>Background Processing Issues Detected ({failedJobs.length})</span>
            </div>
            <div className="divide-y divide-red-950/50 text-xs text-red-300">
              {failedJobs.map((j) => (
                <div key={j.id} className="py-2 flex items-center justify-between">
                  <span className="truncate pr-4">{j.last_error || 'Processing failed'}</span>
                  <span className="text-[11px] font-mono text-red-400/80 flex-shrink-0">
                    Attempts: {j.attempts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
