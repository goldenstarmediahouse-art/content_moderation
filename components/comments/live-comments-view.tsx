'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  CheckCircle,
  EyeOff,
  Flag,
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  UserCheck,
  User,
  ArrowUpRight,
  Clock,
} from 'lucide-react';
import { CommentWithDetails, Database } from '@/types/database';
import {
  SeverityBadge,
  ModerationStatusBadge,
  EscalationPriorityBadge,
  ExternalActionBadge,
} from '@/components/ui/badge';
import { CommentDetailModal } from '@/components/comments/comment-detail-modal';
import { CurrentAdmin } from '@/lib/auth/session';

export type CommentViewTab = 'all' | 'my_assigned' | 'unassigned' | 'pending' | 'escalations';

interface LiveCommentsViewProps {
  initialComments: CommentWithDetails[];
  pages: Database['public']['Tables']['facebook_pages']['Row'][];
  moderators: Database['public']['Tables']['admin_users']['Row'][];
  currentAdmin: CurrentAdmin;
  totalCount: number;
  initialTab?: CommentViewTab;
}

export function LiveCommentsView({
  initialComments,
  pages,
  moderators,
  currentAdmin,
  totalCount,
  initialTab = 'all',
}: LiveCommentsViewProps) {
  const router = useRouter();
  const [selectedComment, setSelectedComment] = useState<CommentWithDetails | null>(null);
  const [currentTab, setCurrentTab] = useState<CommentViewTab>(initialTab);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPage, setSelectedPage] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'priority'>('newest');

  // Tab counts
  const countAll = initialComments.length;
  const countMyAssigned = initialComments.filter((c) => c.assigned_to === currentAdmin.id).length;
  const countUnassigned = initialComments.filter(
    (c) => !c.assigned_to && (c.moderation_status === 'pending' || c.moderation_status === 'review_required')
  ).length;
  const countPending = initialComments.filter(
    (c) => c.moderation_status === 'review_required' || c.moderation_status === 'pending'
  ).length;
  const countEscalations = initialComments.filter(
    (c) => c.is_escalated || c.moderation_status === 'escalated'
  ).length;

  // Filter comments based on tab & filters
  const filteredComments = initialComments.filter((c) => {
    // 1. Tab filtering
    if (currentTab === 'my_assigned' && c.assigned_to !== currentAdmin.id) {
      return false;
    }
    if (currentTab === 'unassigned') {
      if (c.assigned_to) return false;
      if (c.moderation_status !== 'pending' && c.moderation_status !== 'review_required') return false;
    }
    if (currentTab === 'pending') {
      if (c.moderation_status !== 'pending' && c.moderation_status !== 'review_required') return false;
    }
    if (currentTab === 'escalations') {
      if (!c.is_escalated && c.moderation_status !== 'escalated') return false;
    }

    // 2. Search
    if (searchTerm) {
      const matchText = c.message.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSender = (c.commenter_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchText && !matchSender) return false;
    }

    // 3. Page Filter
    if (selectedPage !== 'all' && c.page_id !== selectedPage) {
      return false;
    }

    // 4. Status Filter
    if (selectedStatus !== 'all' && c.moderation_status !== selectedStatus) {
      return false;
    }

    // 5. Assignee Filter
    if (selectedAssignee !== 'all') {
      if (selectedAssignee === 'unassigned' && c.assigned_to) return false;
      if (selectedAssignee !== 'unassigned' && c.assigned_to !== selectedAssignee) return false;
    }

    return true;
  });

  // Sorting
  const sortedComments = [...filteredComments].sort((a, b) => {
    if (sortOrder === 'oldest') {
      return new Date(a.created_time).getTime() - new Date(b.created_time).getTime();
    }
    if (sortOrder === 'priority') {
      const score = (item: CommentWithDetails) => {
        if (item.escalation_priority === 'urgent') return 5;
        if (item.escalation_priority === 'high') return 4;
        if (item.is_escalated) return 3;
        if (item.moderation_status === 'review_required') return 2;
        return 1;
      };
      return score(b) - score(a);
    }
    // Default newest
    return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
  });

  return (
    <div className="space-y-4">
      {/* Top Work Queue View Tabs */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-1.5 flex flex-wrap gap-1 text-xs">
        <button
          onClick={() => setCurrentTab('all')}
          className={`flex items-center space-x-2 px-3 py-2 rounded font-medium transition-colors ${
            currentTab === 'all'
              ? 'bg-charcoal-800 text-charcoal-100 border border-charcoal-700'
              : 'text-charcoal-400 hover:text-charcoal-200'
          }`}
        >
          <span>All Comments</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-charcoal-850 text-charcoal-300 font-mono">
            {countAll}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('my_assigned')}
          className={`flex items-center space-x-2 px-3 py-2 rounded font-medium transition-colors ${
            currentTab === 'my_assigned'
              ? 'bg-charcoal-800 text-charcoal-100 border border-charcoal-700'
              : 'text-charcoal-400 hover:text-charcoal-200'
          }`}
        >
          <User className="w-3.5 h-3.5 text-blue-400" />
          <span>My Assigned</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-950/80 text-blue-300 font-mono">
            {countMyAssigned}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('unassigned')}
          className={`flex items-center space-x-2 px-3 py-2 rounded font-medium transition-colors ${
            currentTab === 'unassigned'
              ? 'bg-charcoal-800 text-charcoal-100 border border-charcoal-700'
              : 'text-charcoal-400 hover:text-charcoal-200'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
          <span>Unassigned Queue</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-950/80 text-amber-300 font-mono">
            {countUnassigned}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('pending')}
          className={`flex items-center space-x-2 px-3 py-2 rounded font-medium transition-colors ${
            currentTab === 'pending'
              ? 'bg-charcoal-800 text-charcoal-100 border border-charcoal-700'
              : 'text-charcoal-400 hover:text-charcoal-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-yellow-400" />
          <span>Pending Review</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-charcoal-850 text-charcoal-300 font-mono">
            {countPending}
          </span>
        </button>

        <button
          onClick={() => setCurrentTab('escalations')}
          className={`flex items-center space-x-2 px-3 py-2 rounded font-medium transition-colors ${
            currentTab === 'escalations'
              ? 'bg-charcoal-800 text-charcoal-100 border border-charcoal-700'
              : 'text-charcoal-400 hover:text-charcoal-200'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
          <span>Escalations</span>
          {countEscalations > 0 && (
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-950 text-red-300 font-mono">
              {countEscalations}
            </span>
          )}
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-charcoal-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search comment text or commenter..."
              className="w-full pl-9 pr-3 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 placeholder-charcoal-500 focus:outline-none focus:border-charcoal-600"
            />
          </div>

          {/* Filter Page */}
          <div>
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Church Pages</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Moderation Statuses</option>
              <option value="pending">Pending</option>
              <option value="review_required">In Review</option>
              <option value="approved">Approved</option>
              <option value="flagged">Flagged</option>
              <option value="escalated">Escalated</option>
              <option value="hidden">Hidden</option>
              <option value="restored">Restored</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>

          {/* Filter Assignee */}
          <div>
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Assignees</option>
              <option value="unassigned">Unassigned Only</option>
              {moderators.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sub-bar showing count & sorting */}
        <div className="flex items-center justify-between text-xs text-charcoal-400 pt-1 border-t border-charcoal-850">
          <div>
            Showing <span className="font-mono text-charcoal-200">{sortedComments.length}</span> matching comments
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-charcoal-500">Sort By:</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="px-2 py-1 bg-charcoal-950 border border-charcoal-800 rounded text-[11px] text-charcoal-300"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="priority">Escalation Priority</option>
            </select>
          </div>
        </div>
      </div>

      {/* Comments Table */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
        {sortedComments.length === 0 ? (
          <div className="p-12 text-center text-xs text-charcoal-500 space-y-1">
            <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto opacity-60" />
            <p className="font-medium text-charcoal-300">No comments found in this view</p>
            <p>Either all cases have been moderated or no records match your active filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-charcoal-950 border-b border-charcoal-800 text-charcoal-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-4">Comment Text</th>
                  <th className="py-2.5 px-3">Facebook Page</th>
                  <th className="py-2.5 px-3">Assigned Moderator</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Sync Status</th>
                  <th className="py-2.5 px-3">Received Time</th>
                  <th className="py-2.5 px-4 text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-800">
                {sortedComments.map((comment) => {
                  const assignedName =
                    comment.assigned_admin?.full_name || comment.assigned_admin?.email;
                  const isAssignedToCurrent = comment.assigned_to === currentAdmin.id;

                  return (
                    <tr
                      key={comment.id}
                      className="hover:bg-charcoal-850/60 transition-colors cursor-pointer"
                      onClick={() => setSelectedComment(comment)}
                    >
                      {/* Comment & Sender */}
                      <td className="py-3 px-4 max-w-sm">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-charcoal-200">
                            {comment.commenter_name || 'Facebook User'}
                          </span>
                          {comment.is_escalated && (
                            <EscalationPriorityBadge priority={comment.escalation_priority} />
                          )}
                        </div>
                        <p className="text-charcoal-300 line-clamp-2 mt-0.5 leading-relaxed">
                          {comment.message}
                        </p>
                      </td>

                      {/* Page */}
                      <td className="py-3 px-3 text-charcoal-400 whitespace-nowrap">
                        {comment.page?.name || 'Page'}
                      </td>

                      {/* Assigned Moderator */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {comment.assigned_to ? (
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                              isAssignedToCurrent
                                ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                                : 'bg-charcoal-850 text-charcoal-300 border-charcoal-700'
                            }`}
                          >
                            <User className="w-3 h-3" />
                            <span>{assignedName}</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 font-mono text-[11px] italic">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Moderation Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <ModerationStatusBadge status={comment.moderation_status} />
                      </td>

                      {/* Facebook Sync Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <ExternalActionBadge status={comment.external_action_status} />
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-charcoal-500">
                        {new Date(comment.created_time).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(comment.created_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Actions */}
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setSelectedComment(comment)}
                          className="px-2.5 py-1 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 text-xs font-medium border border-charcoal-700 transition-colors"
                        >
                          Review & Notes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Comment Slide-over / Modal */}
      {selectedComment && (
        <CommentDetailModal
          comment={selectedComment}
          currentAdmin={currentAdmin}
          moderators={moderators}
          onClose={() => setSelectedComment(null)}
          onActionComplete={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
