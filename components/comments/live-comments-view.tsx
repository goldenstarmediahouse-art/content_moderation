'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { CommentWithDetails, Database } from '@/types/database';
import { SeverityBadge, ModerationStatusBadge } from '@/components/ui/badge';
import { CommentDetailModal } from '@/components/comments/comment-detail-modal';
import { useRouter } from 'next/navigation';

interface LiveCommentsViewProps {
  initialComments: CommentWithDetails[];
  pages: Database['public']['Tables']['facebook_pages']['Row'][];
  totalCount: number;
}

export function LiveCommentsView({
  initialComments,
  pages,
  totalCount,
}: LiveCommentsViewProps) {
  const router = useRouter();
  const [selectedComment, setSelectedComment] = useState<CommentWithDetails | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPage, setSelectedPage] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  // Client-side filtering
  const filteredComments = initialComments.filter((c) => {
    if (searchTerm) {
      const matchText = c.message.toLowerCase().includes(searchTerm.toLowerCase());
      const matchSender = (c.commenter_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchText && !matchSender) return false;
    }

    if (selectedPage !== 'all' && c.page_id !== selectedPage) {
      return false;
    }

    if (selectedStatus !== 'all' && c.moderation_status !== selectedStatus) {
      return false;
    }

    if (selectedSeverity !== 'all' && c.moderation_result?.severity !== selectedSeverity) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Control Bar: Search & Filters */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-charcoal-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search comments or commenter name..."
              className="w-full pl-9 pr-3 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 placeholder-charcoal-500 focus:outline-none focus:border-charcoal-600 transition-colors"
            />
          </div>

          {/* Filter by Page */}
          <div>
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Facebook Pages</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Moderation Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="review_required">In Review</option>
              <option value="flagged">Flagged</option>
              <option value="hidden">Hidden on Facebook</option>
              <option value="restored">Restored</option>
            </select>
          </div>
        </div>

        {/* Sub-bar showing count & severity filter */}
        <div className="flex items-center justify-between text-xs text-charcoal-400 pt-1 border-t border-charcoal-850">
          <div>
            Showing <span className="font-mono text-charcoal-200">{filteredComments.length}</span> of{' '}
            <span className="font-mono text-charcoal-200">{totalCount}</span> comments
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-charcoal-500">Filter Severity:</span>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="px-2 py-1 bg-charcoal-950 border border-charcoal-800 rounded text-[11px] text-charcoal-300"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="safe">Safe</option>
            </select>
          </div>
        </div>
      </div>

      {/* Comments Table */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
        {filteredComments.length === 0 ? (
          <div className="p-12 text-center text-xs text-charcoal-500">
            No comments match the selected criteria or none have been ingested yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-charcoal-950 border-b border-charcoal-800 text-charcoal-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-4">Comment</th>
                  <th className="py-2.5 px-3">Page</th>
                  <th className="py-2.5 px-3">AI Category</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-800">
                {filteredComments.map((comment) => {
                  const ai = comment.moderation_result;

                  return (
                    <tr
                      key={comment.id}
                      className="hover:bg-charcoal-850/60 transition-colors cursor-pointer"
                      onClick={() => setSelectedComment(comment)}
                    >
                      {/* Comment & Sender */}
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-semibold text-charcoal-200">
                          {comment.commenter_name || 'Facebook User'}
                        </div>
                        <p className="text-charcoal-300 line-clamp-2 mt-0.5 leading-relaxed">
                          {comment.message}
                        </p>
                      </td>

                      {/* Page */}
                      <td className="py-3 px-3 text-charcoal-400 whitespace-nowrap">
                        {comment.page?.name || 'Page'}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {ai ? (
                          <div className="capitalize text-charcoal-300 font-medium">
                            {ai.detected_category}
                            <span className="text-[10px] text-charcoal-500 ml-1 font-mono">
                              ({Math.round(ai.confidence_score * 100)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-charcoal-500 italic">Pending</span>
                        )}
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {ai ? <SeverityBadge severity={ai.severity} /> : <span className="text-charcoal-600">—</span>}
                      </td>

                      {/* Moderation Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <ModerationStatusBadge status={comment.moderation_status} />
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
                          Details
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
          onClose={() => setSelectedComment(null)}
          onActionComplete={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
