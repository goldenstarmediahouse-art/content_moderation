'use client';

import React, { useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  EyeOff,
  Flag,
  RotateCcw,
  ShieldAlert,
  User,
  Users,
} from 'lucide-react';
import { CommentWithDetails, Database } from '@/types/database';

export type TimeframePeriod = 'daily' | 'weekly' | 'monthly' | 'all';

interface ReportsViewProps {
  comments: CommentWithDetails[];
  actions: (Database['public']['Tables']['moderation_actions']['Row'] & {
    actor?: { full_name: string | null; email: string; role: string } | null;
  })[];
  moderators: Database['public']['Tables']['admin_users']['Row'][];
}

export function ReportsView({ comments, actions, moderators }: ReportsViewProps) {
  const [period, setPeriod] = useState<TimeframePeriod>('weekly');

  const now = new Date();
  let cutoffDate = new Date(0); // Epoch for 'all'

  if (period === 'daily') {
    cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === 'weekly') {
    cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'monthly') {
    cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Filter records within period
  const periodComments = comments.filter((c) => new Date(c.created_time) >= cutoffDate);
  const periodActions = actions.filter((a) => new Date(a.created_at) >= cutoffDate);

  // Exact calculations
  const totalReceived = periodComments.length;
  const totalReviewed = periodActions.filter((a) =>
    ['approved', 'hidden', 'restored', 'flagged', 'escalated', 'deleted', 'overridden'].includes(a.action)
  ).length;

  const totalApproved = periodComments.filter((c) => c.moderation_status === 'approved').length;
  const totalFlagged = periodComments.filter((c) => c.moderation_status === 'flagged').length;
  const totalHidden = periodComments.filter((c) => c.moderation_status === 'hidden').length;
  const totalDeleted = periodComments.filter((c) => c.moderation_status === 'deleted').length;
  const totalEscalated = periodComments.filter((c) => c.is_escalated || c.moderation_status === 'escalated').length;
  const totalPending = periodComments.filter(
    (c) => c.moderation_status === 'pending' || c.moderation_status === 'review_required'
  ).length;

  // Moderator workload calculations
  const moderatorWorkload = moderators.map((mod) => {
    // Current active assigned comments
    const activeAssigned = comments.filter(
      (c) => c.assigned_to === mod.id && ['pending', 'review_required', 'escalated'].includes(c.moderation_status)
    ).length;

    // Decisions taken by this moderator in the period
    const modActions = periodActions.filter((a) => a.actor_id === mod.id);
    const approvedCount = modActions.filter((a) => a.action === 'approved').length;
    const flaggedCount = modActions.filter((a) => a.action === 'flagged').length;
    const hiddenCount = modActions.filter((a) => a.action === 'hidden').length;
    const escalatedCount = modActions.filter((a) => a.action === 'escalated').length;
    const totalHandled = modActions.length;

    // Calculate average review time where comment assigned_at is available
    const times = modActions
      .map((a) => {
        const matchingComment = comments.find((c) => c.id === a.comment_id);
        if (matchingComment && matchingComment.assigned_at) {
          const diffMs = new Date(a.created_at).getTime() - new Date(matchingComment.assigned_at).getTime();
          return diffMs > 0 ? diffMs : null;
        }
        return null;
      })
      .filter((t): t is number => t !== null);

    let avgTimeStr = 'N/A';
    if (times.length > 0) {
      const avgMs = times.reduce((acc, v) => acc + v, 0) / times.length;
      const mins = Math.round(avgMs / 60000);
      if (mins < 60) {
        avgTimeStr = `${mins}m`;
      } else {
        const hrs = (mins / 60).toFixed(1);
        avgTimeStr = `${hrs}h`;
      }
    }

    return {
      id: mod.id,
      name: mod.full_name || mod.email,
      email: mod.email,
      role: mod.role,
      activeAssigned,
      totalHandled,
      approvedCount,
      flaggedCount,
      hiddenCount,
      escalatedCount,
      avgReviewTime: avgTimeStr,
    };
  });

  function handleExportCSV() {
    const rows = [
      ['Metric', 'Value'],
      ['Timeframe', period.toUpperCase()],
      ['Comments Received', totalReceived],
      ['Decisions Completed', totalReviewed],
      ['Approved', totalApproved],
      ['Flagged', totalFlagged],
      ['Hidden', totalHidden],
      ['Deleted', totalDeleted],
      ['Escalated', totalEscalated],
      ['Pending Review', totalPending],
      [],
      ['Moderator Workload Breakdown'],
      ['Name', 'Email', 'Role', 'Active Assigned', 'Total Handled', 'Approved', 'Flagged', 'Hidden', 'Escalated', 'Avg Review Time'],
      ...moderatorWorkload.map((m) => [
        m.name,
        m.email,
        m.role,
        m.activeAssigned,
        m.totalHandled,
        m.approvedCount,
        m.flaggedCount,
        m.hiddenCount,
        m.escalatedCount,
        m.avgReviewTime,
      ]),
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `church_moderation_report_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
            Moderation Operations & Performance Reports
          </h2>
          <p className="text-xs text-charcoal-400 mt-0.5">
            Real database audit records calculating received comments, reviewer workloads, and case outcomes.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Timeframe Buttons */}
          <div className="bg-charcoal-950 border border-charcoal-800 rounded p-1 flex items-center space-x-1 text-xs">
            <button
              onClick={() => setPeriod('daily')}
              className={`px-2.5 py-1 rounded transition-colors ${
                period === 'daily'
                  ? 'bg-charcoal-800 text-charcoal-100 font-medium'
                  : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              Daily (24h)
            </button>
            <button
              onClick={() => setPeriod('weekly')}
              className={`px-2.5 py-1 rounded transition-colors ${
                period === 'weekly'
                  ? 'bg-charcoal-800 text-charcoal-100 font-medium'
                  : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              Weekly (7d)
            </button>
            <button
              onClick={() => setPeriod('monthly')}
              className={`px-2.5 py-1 rounded transition-colors ${
                period === 'monthly'
                  ? 'bg-charcoal-800 text-charcoal-100 font-medium'
                  : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              Monthly (30d)
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                period === 'all'
                  ? 'bg-charcoal-800 text-charcoal-100 font-medium'
                  : 'text-charcoal-400 hover:text-charcoal-200'
              }`}
            >
              All Time
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 border border-charcoal-700 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider block">
            Comments Received
          </span>
          <div className="text-2xl font-bold text-charcoal-100 font-mono">{totalReceived}</div>
          <span className="text-[10px] text-charcoal-500">In selected period</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            Actions Completed
          </span>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{totalReviewed}</div>
          <span className="text-[10px] text-charcoal-500">Reviewed by human moderators</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider block">
            Approved Comments
          </span>
          <div className="text-2xl font-bold text-charcoal-100 font-mono">{totalApproved}</div>
          <span className="text-[10px] text-charcoal-500">Safe church discussion</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            Pending Cases
          </span>
          <div className="text-2xl font-bold text-amber-400 font-mono">{totalPending}</div>
          <span className="text-[10px] text-charcoal-500">Awaiting moderator decision</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            Flagged Comments
          </span>
          <div className="text-2xl font-bold text-amber-400 font-mono">{totalFlagged}</div>
          <span className="text-[10px] text-charcoal-500">Marked for review</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block">
            Hidden Comments
          </span>
          <div className="text-2xl font-bold text-red-400 font-mono">{totalHidden}</div>
          <span className="text-[10px] text-charcoal-500">Marked for suppression</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-red-500 uppercase tracking-wider block">
            Escalated Cases
          </span>
          <div className="text-2xl font-bold text-red-500 font-mono">{totalEscalated}</div>
          <span className="text-[10px] text-charcoal-500">Referred to Super Admins</span>
        </div>

        <div className="p-4 rounded-lg bg-charcoal-900 border border-charcoal-800 space-y-1">
          <span className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider block">
            Deleted Locally
          </span>
          <div className="text-2xl font-bold text-charcoal-100 font-mono">{totalDeleted}</div>
          <span className="text-[10px] text-charcoal-500">Preserved in audit archive</span>
        </div>
      </div>

      {/* Moderator Workload & Case Handling Breakdown */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden space-y-3">
        <div className="p-4 border-b border-charcoal-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-charcoal-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
              Moderator Workload & Review Times
            </h3>
          </div>
          <span className="text-xs text-charcoal-500 font-mono">
            Period: {period.toUpperCase()}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-charcoal-950 border-b border-charcoal-800 text-charcoal-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-4">Moderator</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3 text-center">Active Assigned</th>
                <th className="py-2.5 px-3 text-center">Handled (Period)</th>
                <th className="py-2.5 px-3 text-center">Approved</th>
                <th className="py-2.5 px-3 text-center">Flagged</th>
                <th className="py-2.5 px-3 text-center">Hidden</th>
                <th className="py-2.5 px-3 text-center">Escalated</th>
                <th className="py-2.5 px-4 text-right">Avg Review Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal-800">
              {moderatorWorkload.map((m) => (
                <tr key={m.id} className="hover:bg-charcoal-850/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-charcoal-100">{m.name}</div>
                    <div className="text-[11px] text-charcoal-500 font-mono">{m.email}</div>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                        m.role === 'super_admin'
                          ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                          : 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                      }`}
                    >
                      {m.role === 'super_admin' ? 'Super Admin' : 'Moderator'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-charcoal-200">
                    {m.activeAssigned}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-charcoal-100">
                    {m.totalHandled}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-emerald-400">
                    {m.approvedCount}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-amber-400">
                    {m.flaggedCount}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-red-400">
                    {m.hiddenCount}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-purple-400">
                    {m.escalatedCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-charcoal-300">
                    {m.avgReviewTime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-charcoal-950/60 border-t border-charcoal-800 text-[11px] text-charcoal-500 italic">
          * Integrity Guarantee: All counts are calculated directly from recorded database entries. Internal moderation actions are never counted as successful Facebook Graph API actions.
        </div>
      </div>
    </div>
  );
}
