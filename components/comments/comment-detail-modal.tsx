'use client';

import React, { useState } from 'react';
import { X, CheckCircle, EyeOff, RotateCcw, Flag, AlertTriangle, Clock } from 'lucide-react';
import { CommentWithDetails, ModerationActionType } from '@/types/database';
import { SeverityBadge, ModerationStatusBadge } from '@/components/ui/badge';

interface CommentDetailModalProps {
  comment: CommentWithDetails | null;
  onClose: () => void;
  onActionComplete: () => void;
}

export function CommentDetailModal({
  comment,
  onClose,
  onActionComplete,
}: CommentDetailModalProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmHide, setConfirmHide] = useState(false);

  if (!comment) return null;

  async function handleAction(action: ModerationActionType, reason: string) {
    setLoadingAction(action);
    setActionError(null);

    try {
      const res = await fetch('/api/comments/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment?.id,
          action,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete moderation action');
      }

      onActionComplete();
      onClose();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoadingAction(null);
      setConfirmHide(false);
    }
  }

  const ai = comment.moderation_result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-charcoal-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-semibold text-charcoal-100">
              Comment Moderation Details
            </h2>
            <ModerationStatusBadge status={comment.moderation_status} />
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-charcoal-400 hover:text-charcoal-200 hover:bg-charcoal-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {actionError && (
            <div className="p-3 rounded bg-status-threat-bg border border-status-threat-border text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Comment Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-charcoal-400 uppercase tracking-wider">
              Comment Text
            </label>
            <div className="p-4 rounded bg-charcoal-950 border border-charcoal-800 text-charcoal-100 text-sm whitespace-pre-wrap leading-relaxed select-text">
              {comment.message}
            </div>
          </div>

          {/* Context Details Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded bg-charcoal-850/50 border border-charcoal-800">
              <span className="text-charcoal-500 block">Facebook Page</span>
              <span className="text-charcoal-200 font-medium">{comment.page?.name || 'Unknown Page'}</span>
            </div>
            <div className="p-3 rounded bg-charcoal-850/50 border border-charcoal-800">
              <span className="text-charcoal-500 block">Commenter</span>
              <span className="text-charcoal-200 font-medium">{comment.commenter_name || 'Anonymous User'}</span>
            </div>
            <div className="p-3 rounded bg-charcoal-850/50 border border-charcoal-800">
              <span className="text-charcoal-500 block">Received Timestamp</span>
              <span className="text-charcoal-200 font-mono">
                {new Date(comment.created_time).toLocaleString()}
              </span>
            </div>
            <div className="p-3 rounded bg-charcoal-850/50 border border-charcoal-800">
              <span className="text-charcoal-500 block">Facebook Comment ID</span>
              <span className="text-charcoal-400 font-mono truncate block" title={comment.facebook_comment_id}>
                {comment.facebook_comment_id}
              </span>
            </div>
          </div>

          {/* Post context if available */}
          {comment.post && (
            <div className="p-3 rounded bg-charcoal-850/30 border border-charcoal-800 text-xs">
              <span className="text-charcoal-500 block mb-1">Original Post Context:</span>
              <p className="text-charcoal-300 italic">{comment.post.message || 'Media / Link Post'}</p>
            </div>
          )}

          {/* AI Moderation Assessment */}
          <div className="p-4 rounded bg-charcoal-950 border border-charcoal-800 space-y-3">
            <div className="flex items-center justify-between border-b border-charcoal-850 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-charcoal-300">
                AI Analysis Assessment
              </span>
              {ai && <SeverityBadge severity={ai.severity} />}
            </div>

            {ai ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2 py-1">
                  <div>
                    <span className="text-charcoal-500 block">Category:</span>
                    <span className="text-charcoal-200 font-medium capitalize">{ai.detected_category}</span>
                  </div>
                  <div>
                    <span className="text-charcoal-500 block">Confidence:</span>
                    <span className="text-charcoal-200 font-medium">{Math.round(ai.confidence_score * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-charcoal-500 block">Language:</span>
                    <span className="text-charcoal-200 uppercase font-mono">{ai.detected_language}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-charcoal-500 block">Explanation:</span>
                  <p className="text-charcoal-300 leading-normal mt-0.5">{ai.explanation}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-charcoal-500 italic">
                AI analysis has not yet been processed for this comment.
              </p>
            )}
          </div>

          {/* Moderation History */}
          {comment.actions && comment.actions.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-charcoal-400">
                Action History
              </span>
              <div className="border border-charcoal-800 rounded divide-y divide-charcoal-850 text-xs">
                {comment.actions.map((act) => (
                  <div key={act.id} className="p-2.5 flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-charcoal-200 capitalize">{act.action}</span>
                        <span className="text-charcoal-500">by</span>
                        <span className="text-charcoal-300 font-mono capitalize">{act.actor_type}</span>
                      </div>
                      <p className="text-charcoal-400 mt-0.5">{act.reason}</p>
                    </div>
                    <span className="text-[11px] text-charcoal-500 font-mono">
                      {new Date(act.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Bar Footer */}
        <div className="px-6 py-4 border-t border-charcoal-800 bg-charcoal-900 flex items-center justify-between">
          <div className="text-xs text-charcoal-500">
            {comment.is_hidden ? (
              <span className="text-red-400 font-medium">Currently hidden on Facebook</span>
            ) : (
              <span>Visible on Facebook</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* If currently hidden, allow restoring */}
            {comment.is_hidden ? (
              <button
                disabled={!!loadingAction}
                onClick={() => handleAction('restored', 'Admin restored previously hidden comment')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 text-xs font-medium disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore to Facebook</span>
              </button>
            ) : (
              <>
                {/* Approve Button */}
                <button
                  disabled={!!loadingAction || comment.moderation_status === 'approved'}
                  onClick={() => handleAction('approved', 'Manual approval by administrator')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 text-xs font-medium disabled:opacity-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Approve</span>
                </button>

                {/* Flag Button */}
                <button
                  disabled={!!loadingAction}
                  onClick={() => handleAction('flagged', 'Manual flag by administrator')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-amber-950/50 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 text-xs font-medium disabled:opacity-50"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Flag</span>
                </button>

                {/* Hide Button with Confirmation */}
                {confirmHide ? (
                  <div className="flex items-center space-x-1">
                    <button
                      disabled={!!loadingAction}
                      onClick={() => handleAction('hidden', 'Confirmed manual hide by administrator')}
                      className="px-2.5 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-medium"
                    >
                      Confirm Hide
                    </button>
                    <button
                      onClick={() => setConfirmHide(false)}
                      className="px-2 py-1.5 text-xs text-charcoal-400 hover:text-charcoal-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={!!loadingAction}
                    onClick={() => setConfirmHide(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 text-xs font-medium disabled:opacity-50"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide on Facebook</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
