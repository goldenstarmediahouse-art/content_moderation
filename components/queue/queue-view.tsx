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
} from 'lucide-react';
import { CommentWithDetails, ModerationActionType } from '@/types/database';
import { SeverityBadge } from '@/components/ui/badge';
import { CommentDetailModal } from '@/components/comments/comment-detail-modal';

interface QueueViewProps {
  initialComments: CommentWithDetails[];
}

export function QueueView({ initialComments }: QueueViewProps) {
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

  // Sort queue by severity priority (critical -> high -> medium -> low -> safe)
  const sortedComments = [...comments].sort((a, b) => {
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
          <h2 className="font-semibold text-charcoal-100">
            Pending Human Decisions ({comments.length})
          </h2>
          <p className="text-charcoal-400 mt-0.5">
            Comments prioritized by threat level and AI confidence. Action decisions are executed against Meta Graph API in real-time.
          </p>
        </div>
      </div>

      {sortedComments.length === 0 ? (
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-12 text-center text-xs text-charcoal-500 space-y-2">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto opacity-75" />
          <h3 className="text-sm font-semibold text-charcoal-200">No Comments in Moderation Queue</h3>
          <p>All incoming comments have been resolved or auto-moderated safely.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedComments.map((comment) => {
            const ai = comment.moderation_result;
            const isProcessing = loadingActionId === comment.id;
            const err = actionError?.id === comment.id ? actionError.message : null;

            return (
              <div
                key={comment.id}
                className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-5 space-y-4 hover:border-charcoal-700 transition-colors"
              >
                {err && (
                  <div className="p-3 rounded bg-status-threat-bg border border-status-threat-border text-red-300 text-xs flex items-center space-x-2">
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
                      {comment.page?.name || 'Page'}
                    </span>
                    <span className="text-charcoal-600">•</span>
                    <span className="text-charcoal-500 font-mono text-[11px]">
                      {new Date(comment.created_time).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {ai && <SeverityBadge severity={ai.severity} />}
                    {ai && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-charcoal-850 text-charcoal-300 border border-charcoal-800">
                        {ai.detected_language}
                      </span>
                    )}
                  </div>
                </div>

                {/* Comment Text */}
                <div className="p-4 rounded bg-charcoal-950 border border-charcoal-800 text-charcoal-100 text-sm leading-relaxed whitespace-pre-wrap select-text">
                  {comment.message}
                </div>

                {/* AI Explanation Box */}
                {ai && (
                  <div className="p-3 rounded bg-charcoal-850/40 border border-charcoal-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase tracking-wider text-charcoal-400">
                        Detected Category: <span className="text-charcoal-200">{ai.detected_category}</span>
                      </span>
                      <span className="font-mono text-charcoal-500">
                        Confidence: {Math.round(ai.confidence_score * 100)}%
                      </span>
                    </div>
                    <p className="text-charcoal-300 leading-normal">{ai.explanation}</p>
                    <div className="pt-1 text-[11px] text-charcoal-500">
                      AI Recommendation:{' '}
                      <span className="font-medium uppercase text-charcoal-300">
                        {ai.recommended_action}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="pt-2 flex items-center justify-between border-t border-charcoal-850">
                  <button
                    onClick={() => setSelectedComment(comment)}
                    className="text-xs text-charcoal-400 hover:text-charcoal-200 underline font-medium"
                  >
                    Inspect Full Context & History
                  </button>

                  <div className="flex items-center space-x-2">
                    {/* Approve Button */}
                    <button
                      disabled={isProcessing}
                      onClick={() => handleQuickAction(comment.id, 'approved', 'Approved by administrator from queue')}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 text-xs font-medium disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>

                    {/* Flag Button */}
                    <button
                      disabled={isProcessing}
                      onClick={() => handleQuickAction(comment.id, 'flagged', 'Flagged by administrator from queue')}
                      className="flex items-center space-x-1 px-3 py-1.5 rounded bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-800/60 text-xs font-medium disabled:opacity-50 transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>Flag</span>
                    </button>

                    {/* Hide Button with Confirmation */}
                    {confirmHideId === comment.id ? (
                      <div className="flex items-center space-x-1">
                        <button
                          disabled={isProcessing}
                          onClick={() => handleQuickAction(comment.id, 'hidden', 'Confirmed hide from queue')}
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
                        disabled={isProcessing}
                        onClick={() => setConfirmHideId(comment.id)}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide on Facebook</span>
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
