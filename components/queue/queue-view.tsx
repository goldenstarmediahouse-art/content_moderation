'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  EyeOff,
  Flag,
  AlertTriangle,
  Info,
  ExternalLink,
  User,
  UserCheck,
} from 'lucide-react';
import { CommentWithDetails, ModerationActionType, Database } from '@/types/database';
import { SeverityBadge, ModerationStatusBadge, ExternalActionBadge } from '@/components/ui/badge';
import { CommentDetailModal } from '@/components/comments/comment-detail-modal';
import { CurrentAdmin } from '@/lib/auth/session';

interface QueueViewProps {
  initialComments: CommentWithDetails[];
  currentAdmin: CurrentAdmin;
  moderators: Database['public']['Tables']['admin_users']['Row'][];
}

export function QueueView({ initialComments, currentAdmin, moderators }: QueueViewProps) {
  const router = useRouter();
  const [comments, setComments] = useState<CommentWithDetails[]>(initialComments);
  const [selectedComment, setSelectedComment] = useState<CommentWithDetails | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [confirmHideId, setConfirmHideId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  async function handleQuickAction(commentId: string, action: ModerationActionType, reason: string) {
    setLoadingActionId(commentId);
    setActionError(null);

    try {
      const res = await fetch('/api/comments/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId,
          action,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply moderation action.');
      }

      // Remove from queue on client
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setConfirmHideId(null);
      router.refresh();
    } catch (err: any) {
      setActionError({ id: commentId, message: err.message });
    } finally {
      setLoadingActionId(null);
    }
  }

  // Sort queue by priority: urgent escalations first, then severity
  const sortedComments = [...comments].sort((a, b) => {
    if (a.is_escalated && !b.is_escalated) return -1;
    if (!a.is_escalated && b.is_escalated) return 1;

    const severityScore: Record<string, number> = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      safe: 1,
    };
    const scoreA = severityScore[a.moderation_result?.severity || 'medium'] || 3;
    const scoreB = severityScore[b.moderation_result?.severity || 'medium'] || 3;
    return scoreB - scoreA;
  });

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-4 flex items-center justify-between text-xs">
        <div>
          <h2 className="font-semibold text-charcoal-100 uppercase tracking-wide">
            Human Moderation Decision Queue ({comments.length})
          </h2>
          <p className="text-charcoal-400 mt-0.5">
            Active cases awaiting human administrator decision. Internal decisions are recorded and preserved in audit logs.
          </p>
        </div>
      </div>

      {sortedComments.length === 0 ? (
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-12 text-center text-xs text-charcoal-500 space-y-2">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-75" />
          <h3 className="text-sm font-semibold text-charcoal-200">Review Queue is Clear</h3>
          <p>No comments currently require human review. New comments will appear here upon ingestion.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedComments.map((comment) => {
            const ai = comment.moderation_result;
            const isProcessing = loadingActionId === comment.id;
            const err = actionError?.id === comment.id ? actionError.message : null;
            const assignedName = comment.assigned_admin?.full_name || comment.assigned_admin?.email;
            const isAssignedToOther = comment.assigned_to && comment.assigned_to !== currentAdmin.id;
            const isLocked = isAssignedToOther && currentAdmin.role !== 'super_admin';

            return (
              <div
                key={comment.id}
                className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-5 space-y-4 hover:border-charcoal-700 transition-colors"
              >
                {err && (
                  <div className="p-3 rounded bg-red-950/30 border border-red-800/60 text-red-300 text-xs flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{err}</span>
                  </div>
                )}

                {/* Top Meta Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 text-xs">
                    <span className="font-semibold text-charcoal-100">
                      {comment.commenter_name || 'Facebook User'}
                    </span>
                    <span className="text-charcoal-600">•</span>
                    <span className="text-charcoal-400 font-medium">
                      {comment.page?.name || 'Church Page'}
                    </span>
                    <span className="text-charcoal-600">•</span>
                    <span className="text-charcoal-500 font-mono text-[11px]">
                      {new Date(comment.created_time).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <ModerationStatusBadge status={comment.moderation_status} />
                    {comment.assigned_to ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono bg-charcoal-850 text-charcoal-300 border border-charcoal-700">
                        <User className="w-3 h-3 text-charcoal-400" />
                        <span>{assignedName}</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 text-[11px] font-mono italic">
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>

                {/* Comment Text */}
                <div className="p-4 rounded bg-charcoal-950 border border-charcoal-800 text-charcoal-100 text-sm leading-relaxed whitespace-pre-wrap select-text">
                  {comment.message}
                </div>

                {/* Action Bar */}
                <div className="pt-2 flex items-center justify-between border-t border-charcoal-850">
                  <button
                    onClick={() => setSelectedComment(comment)}
                    className="text-xs text-charcoal-400 hover:text-charcoal-200 underline font-medium"
                  >
                    View Details & Internal Notes
                  </button>

                  <div className="flex items-center space-x-2">
                    {/* Approve Button */}
                    <button
                      disabled={Boolean(isProcessing || isLocked)}
                      onClick={() => handleQuickAction(comment.id, 'approved', 'Approved by administrator from queue')}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 text-xs font-medium disabled:opacity-40 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>

                    {/* Flag Button */}
                    <button
                      disabled={Boolean(isProcessing || isLocked)}
                      onClick={() => handleQuickAction(comment.id, 'flagged', 'Flagged by administrator for investigation')}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-800/60 text-xs font-medium disabled:opacity-40 transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>Flag</span>
                    </button>

                    {/* Hide Button with Confirmation */}
                    {confirmHideId === comment.id ? (
                      <div className="flex items-center space-x-1">
                        <button
                          disabled={Boolean(isProcessing)}
                          onClick={() => handleQuickAction(comment.id, 'hidden', 'Confirmed hide decision recorded internally')}
                          className="px-2.5 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
                        >
                          Confirm Hide
                        </button>
                        <button
                          onClick={() => setConfirmHideId(null)}
                          className="px-2 py-1.5 text-xs text-charcoal-400 hover:text-charcoal-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        disabled={Boolean(isProcessing || isLocked)}
                        onClick={() => setConfirmHideId(comment.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 text-xs font-medium disabled:opacity-40 transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedComment && (
        <CommentDetailModal
          comment={selectedComment}
          currentAdmin={currentAdmin}
          moderators={moderators}
          onClose={() => setSelectedComment(null)}
          onActionComplete={() => {
            setComments((prev) => prev.filter((c) => c.id !== selectedComment.id));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
