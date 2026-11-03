'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle,
  EyeOff,
  RotateCcw,
  Flag,
  AlertTriangle,
  Clock,
  UserCheck,
  UserPlus,
  Send,
  MessageSquare,
  Shield,
  Trash2,
  Lock,
  ArrowUpRight,
} from 'lucide-react';
import {
  CommentWithDetails,
  ModerationActionType,
  EscalationPriority,
  Database,
} from '@/types/database';
import {
  SeverityBadge,
  ModerationStatusBadge,
  EscalationPriorityBadge,
  ExternalActionBadge,
} from '@/components/ui/badge';
import { CurrentAdmin } from '@/lib/auth/session';

interface CommentDetailModalProps {
  comment: CommentWithDetails | null;
  currentAdmin: CurrentAdmin;
  moderators?: Database['public']['Tables']['admin_users']['Row'][];
  onClose: () => void;
  onActionComplete: () => void;
}

export function CommentDetailModal({
  comment,
  currentAdmin,
  moderators = [],
  onClose,
  onActionComplete,
}: CommentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'decision' | 'notes' | 'history'>('decision');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Form states for actions
  const [actionType, setActionType] = useState<ModerationActionType | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [escalationPriority, setEscalationPriority] = useState<EscalationPriority>('medium');
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Assignment states
  const [selectedModeratorId, setSelectedModeratorId] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [showReleaseModal, setShowReleaseModal] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const isSuperAdmin = currentAdmin.role === 'super_admin';
  const isAssignedToMe = comment?.assigned_to === currentAdmin.id;
  const isAssignedToOther = comment?.assigned_to && comment.assigned_to !== currentAdmin.id;
  const isLockedForMe = isAssignedToOther && !isSuperAdmin;

  useEffect(() => {
    if (comment?.id) {
      fetchNotes(comment.id);
    }
  }, [comment?.id]);

  async function fetchNotes(commentId: string) {
    try {
      const res = await fetch(`/api/comments/notes?commentId=${encodeURIComponent(commentId)}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  }

  if (!comment) return null;

  async function handleExecuteDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!actionType) return;

    setLoadingAction(actionType);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/comments/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment?.id,
          action: actionType,
          reason: actionReason,
          escalationPriority: actionType === 'escalated' ? escalationPriority : undefined,
          isOverride: isOverrideMode,
          overrideReason: isOverrideMode ? overrideReason : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete moderation decision');
      }

      setActionSuccess(`Decision "${actionType.toUpperCase()}" recorded successfully.`);
      setTimeout(() => {
        onActionComplete();
        onClose();
      }, 700);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoadingAction(null);
      setActionType(null);
      setActionReason('');
      setIsOverrideMode(false);
    }
  }

  async function handleClaimCase() {
    setLoadingAction('claim');
    setActionError(null);

    try {
      const res = await fetch('/api/comments/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment?.id,
          action: 'claim',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to claim case');

      setActionSuccess('Case claimed successfully into your assigned queue.');
      setTimeout(() => {
        onActionComplete();
      }, 500);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAssignCase(moderatorId: string) {
    if (!moderatorId) return;
    setLoadingAction('assign');
    setActionError(null);

    try {
      const res = await fetch('/api/comments/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment?.id,
          action: comment?.assigned_to ? 'reassign' : 'assign',
          targetModeratorId: moderatorId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign case');

      setActionSuccess('Case assigned successfully.');
      setTimeout(() => {
        onActionComplete();
      }, 500);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleReleaseCase() {
    if (!releaseReason.trim()) {
      setActionError('A reason is required to release an assigned case back to the queue.');
      return;
    }

    setLoadingAction('release');
    setActionError(null);

    try {
      const res = await fetch('/api/comments/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment?.id,
          action: 'release',
          reason: releaseReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to release case');

      setShowReleaseModal(false);
      setActionSuccess('Case released back to unassigned queue.');
      setTimeout(() => {
        onActionComplete();
      }, 500);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;

    setSubmittingNote(true);
    try {
      const res = await fetch('/api/comments/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: comment?.id,
          note: newNote.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add note');

      setNotes((prev) => [...prev, data.note]);
      setNewNote('');
    } catch (err: any) {
      alert(`Error saving internal note: ${err.message}`);
    } finally {
      setSubmittingNote(false);
    }
  }

  const assignedModeratorName =
    comment.assigned_admin?.full_name || comment.assigned_admin?.email || 'Unassigned';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs select-none">
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="px-6 py-4 border-b border-charcoal-800 flex items-center justify-between bg-charcoal-900/90">
          <div className="flex items-center space-x-3">
            <h2 className="text-sm font-semibold text-charcoal-100">
              Comment Case Management
            </h2>
            <ModerationStatusBadge status={comment.moderation_status} />
            <ExternalActionBadge status={comment.external_action_status} />
            {comment.is_escalated && (
              <EscalationPriorityBadge priority={comment.escalation_priority} />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-charcoal-400 hover:text-charcoal-200 hover:bg-charcoal-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-charcoal-800 bg-charcoal-950/60 flex items-center space-x-6 text-xs">
          <button
            onClick={() => setActiveTab('decision')}
            className={`py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'decision'
                ? 'border-charcoal-200 text-charcoal-100'
                : 'border-transparent text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            Review & Decision
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-3 font-medium border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'notes'
                ? 'border-charcoal-200 text-charcoal-100'
                : 'border-transparent text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            <span>Internal Notes</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-charcoal-800 text-charcoal-300 font-mono">
              {notes.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-charcoal-200 text-charcoal-100'
                : 'border-transparent text-charcoal-400 hover:text-charcoal-200'
            }`}
          >
            Audit History ({comment.actions?.length || 0})
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {actionError && (
            <div className="p-3 rounded bg-red-950/30 border border-red-800/60 text-red-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="p-3 rounded bg-emerald-950/30 border border-emerald-800/60 text-emerald-300 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* Comment Text Card */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-charcoal-400 uppercase tracking-wider">
                Comment Content
              </label>
              <span className="text-charcoal-500 font-mono text-[11px]">
                {new Date(comment.created_time).toLocaleString()}
              </span>
            </div>
            <div className="p-4 rounded bg-charcoal-950 border border-charcoal-800 text-charcoal-100 text-sm whitespace-pre-wrap leading-relaxed select-text">
              {comment.message}
            </div>
          </div>

          {/* Context Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded bg-charcoal-850/40 border border-charcoal-800">
              <span className="text-charcoal-500 block text-[11px]">Facebook Page</span>
              <span className="text-charcoal-200 font-medium truncate block">
                {comment.page?.name || 'Church Official Page'}
              </span>
            </div>
            <div className="p-3 rounded bg-charcoal-850/40 border border-charcoal-800">
              <span className="text-charcoal-500 block text-[11px]">Commenter</span>
              <span className="text-charcoal-200 font-medium truncate block">
                {comment.commenter_name || 'Anonymous User'}
              </span>
            </div>
            <div className="p-3 rounded bg-charcoal-850/40 border border-charcoal-800">
              <span className="text-charcoal-500 block text-[11px]">Assigned Moderator</span>
              <span className="text-charcoal-200 font-medium truncate block">
                {assignedModeratorName}
              </span>
            </div>
            <div className="p-3 rounded bg-charcoal-850/40 border border-charcoal-800">
              <span className="text-charcoal-500 block text-[11px]">Facebook Status</span>
              <span className="text-charcoal-300 font-mono text-[11px]">
                {comment.is_hidden ? 'Marked Hidden' : 'Active Public'}
              </span>
            </div>
          </div>

          {/* Original Post Context if available */}
          {comment.post && (
            <div className="p-3 rounded bg-charcoal-850/30 border border-charcoal-800">
              <span className="text-charcoal-500 block text-[11px] mb-1">Original Post Context:</span>
              <p className="text-charcoal-300 italic">{comment.post.message || 'Media / Link Post'}</p>
            </div>
          )}

          {/* TAB 1: DECISION & CASE MANAGEMENT */}
          {activeTab === 'decision' && (
            <div className="space-y-5">
              {/* Assignment Management Bar */}
              <div className="p-4 rounded bg-charcoal-950 border border-charcoal-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-4 h-4 text-charcoal-400" />
                    <span className="font-semibold text-charcoal-200 uppercase tracking-wide text-[11px]">
                      Case Assignment & Ownership
                    </span>
                  </div>
                  {comment.assigned_to ? (
                    <span className="text-charcoal-400 font-mono text-[11px]">
                      Assigned: {comment.assigned_at ? new Date(comment.assigned_at).toLocaleTimeString() : 'Active'}
                    </span>
                  ) : (
                    <span className="text-amber-400 font-mono text-[11px]">Unassigned in Central Queue</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {!comment.assigned_to ? (
                    <div className="flex items-center space-x-3">
                      <span className="text-charcoal-400">This comment has not been assigned to any moderator.</span>
                      <button
                        type="button"
                        onClick={handleClaimCase}
                        disabled={!!loadingAction}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 font-medium disabled:opacity-50"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Claim This Case</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-3">
                      <span className="text-charcoal-300">
                        Assigned to: <strong className="text-charcoal-100">{assignedModeratorName}</strong>
                      </span>
                      {(isAssignedToMe || isSuperAdmin) && (
                        <button
                          type="button"
                          onClick={() => setShowReleaseModal(true)}
                          className="px-2.5 py-1 text-xs text-charcoal-400 hover:text-charcoal-200 underline"
                        >
                          Release to Queue
                        </button>
                      )}
                    </div>
                  )}

                  {/* Super Admin Assignment Dropdown */}
                  {isSuperAdmin && moderators.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <select
                        value={selectedModeratorId}
                        onChange={(e) => setSelectedModeratorId(e.target.value)}
                        className="px-2.5 py-1.5 bg-charcoal-900 border border-charcoal-700 rounded text-charcoal-200 text-xs focus:outline-none"
                      >
                        <option value="">Select Moderator to Assign...</option>
                        {moderators.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name || m.email} ({m.role === 'super_admin' ? 'Super Admin' : 'Moderator'})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedModeratorId || !!loadingAction}
                        onClick={() => handleAssignCase(selectedModeratorId)}
                        className="px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 font-medium disabled:opacity-50"
                      >
                        {comment.assigned_to ? 'Reassign' : 'Assign'}
                      </button>
                    </div>
                  )}
                </div>

                {isLockedForMe && (
                  <div className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40 text-amber-300 text-[11px] flex items-center space-x-2">
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      Concurrency Guard: This case is assigned to {assignedModeratorName}. You cannot submit decisions unless it is reassigned to you or overridden by a Super Admin.
                    </span>
                  </div>
                )}
              </div>

              {/* Escalation Context if active */}
              {comment.is_escalated && (
                <div className="p-4 rounded bg-red-950/20 border border-red-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase tracking-wider text-red-400 flex items-center space-x-1.5">
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Case Escalated for Super Admin Oversight</span>
                    </span>
                    <EscalationPriorityBadge priority={comment.escalation_priority} />
                  </div>
                  <div className="text-charcoal-300 bg-charcoal-950/80 p-3 rounded border border-charcoal-800">
                    <span className="text-charcoal-500 block text-[11px] mb-0.5">Escalation Reason:</span>
                    <p>{comment.escalation_reason || 'No specific explanation recorded.'}</p>
                  </div>
                </div>
              )}

              {/* Decision Action Form */}
              {actionType && (
                <form onSubmit={handleExecuteDecision} className="p-4 rounded bg-charcoal-950 border border-charcoal-700 space-y-4">
                  <div className="flex items-center justify-between border-b border-charcoal-800 pb-2">
                    <span className="font-semibold uppercase tracking-wider text-charcoal-100">
                      Confirm Decision: {actionType.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActionType(null)}
                      className="text-xs text-charcoal-500 hover:text-charcoal-300"
                    >
                      Cancel
                    </button>
                  </div>

                  {actionType === 'escalated' && (
                    <div className="space-y-1">
                      <label className="text-charcoal-300 font-medium">Escalation Urgency Priority:</label>
                      <select
                        value={escalationPriority}
                        onChange={(e) => setEscalationPriority(e.target.value as EscalationPriority)}
                        className="w-full px-3 py-1.5 bg-charcoal-900 border border-charcoal-700 rounded text-charcoal-100"
                      >
                        <option value="low">Low (General Doctrinal Question)</option>
                        <option value="medium">Medium (Requires Senior Guidance)</option>
                        <option value="high">High (Severe Insult / Harassment)</option>
                        <option value="urgent">Urgent (Physical Harm / Severe Threat)</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-charcoal-300 font-medium">
                      {actionType === 'flagged' || actionType === 'escalated' || actionType === 'deleted'
                        ? 'Mandatory Explanation / Justification:'
                        : 'Optional Moderation Reason / Context:'}
                    </label>
                    <textarea
                      required={actionType === 'flagged' || actionType === 'escalated' || actionType === 'deleted'}
                      rows={3}
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder={
                        actionType === 'escalated'
                          ? 'Explain why this comment requires Super Admin intervention...'
                          : actionType === 'flagged'
                          ? 'Specify policy rule or violation suspected...'
                          : actionType === 'deleted'
                          ? 'State mandatory church policy justification for deletion request...'
                          : 'Notes regarding this approval...'
                      }
                      className="w-full px-3 py-2 bg-charcoal-900 border border-charcoal-700 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-500"
                    />
                  </div>

                  {actionType === 'hidden' && (
                    <div className="p-3 rounded bg-amber-950/30 border border-amber-800/60 text-amber-300 text-[11px]">
                      <strong>Note on Facebook Hiding:</strong> Facebook integration is not connected yet. This action records an internal decision to hide the comment and queues it for synchronization once the church Facebook Page is connected.
                    </div>
                  )}

                  {actionType === 'deleted' && (
                    <div className="p-3 rounded bg-red-950/30 border border-red-800/60 text-red-300 text-[11px]">
                      <strong>Permanent Audit Policy:</strong> Deleting a comment will mark it as deleted internally while preserving the full record in the church database for audit compliance.
                    </div>
                  )}

                  <div className="flex items-center justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActionType(null)}
                      className="px-3 py-1.5 rounded text-charcoal-400 hover:text-charcoal-200"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!!loadingAction}
                      className="px-4 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-600 font-semibold disabled:opacity-50"
                    >
                      {loadingAction ? 'Recording Decision...' : 'Confirm & Save Decision'}
                    </button>
                  </div>
                </form>
              )}

              {/* Super Admin Override Section */}
              {isSuperAdmin && comment.moderation_status !== 'pending' && !actionType && (
                <div className="p-3.5 rounded bg-purple-950/20 border border-purple-900/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-300 uppercase tracking-wide text-[11px] flex items-center space-x-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Super Admin Decision Override</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsOverrideMode(!isOverrideMode)}
                      className="text-xs text-purple-400 hover:text-purple-200 underline"
                    >
                      {isOverrideMode ? 'Cancel Override' : 'Override Previous Decision'}
                    </button>
                  </div>

                  {isOverrideMode && (
                    <div className="space-y-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-charcoal-300 font-medium">Override Justification Reason:</label>
                        <input
                          type="text"
                          required
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="State why previous decision is being superseded..."
                          className="w-full px-3 py-1.5 bg-charcoal-950 border border-charcoal-700 rounded text-charcoal-100"
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActionType('approved');
                          }}
                          className="px-3 py-1 rounded bg-emerald-900 text-emerald-200 border border-emerald-700 font-medium"
                        >
                          Override to Approved
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionType('hidden');
                          }}
                          className="px-3 py-1 rounded bg-red-900 text-red-200 border border-red-700 font-medium"
                        >
                          Override to Hidden
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionType('flagged');
                          }}
                          className="px-3 py-1 rounded bg-amber-900 text-amber-200 border border-amber-700 font-medium"
                        >
                          Override to Flagged
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PRIVATE INTERNAL NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="p-3 rounded bg-charcoal-950 border border-charcoal-800 text-[11px] text-charcoal-400">
                🔒 <strong>Confidentiality Notice:</strong> Internal collaboration notes are strictly visible to church administrators and are never published as Facebook comments or replies.
              </div>

              {/* Notes List */}
              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-charcoal-500 text-center py-6 italic">
                    No internal notes added to this case yet.
                  </p>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="p-3 rounded bg-charcoal-950 border border-charcoal-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-charcoal-200">
                          {n.admin?.full_name || n.admin?.email || 'Administrator'}
                          <span className="ml-1.5 font-mono text-[10px] text-charcoal-500 uppercase">
                            ({n.admin?.role === 'super_admin' ? 'Super Admin' : 'Moderator'})
                          </span>
                        </span>
                        <span className="text-charcoal-500 font-mono">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-charcoal-300 leading-relaxed whitespace-pre-wrap select-text">
                        {n.note}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Note Input */}
              <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-charcoal-800">
                <textarea
                  rows={2}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Write an internal note or context for other moderators..."
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 placeholder-charcoal-500 focus:outline-none focus:border-charcoal-600"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 font-medium disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingNote ? 'Saving...' : 'Add Internal Note'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: AUDIT & DECISION HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-charcoal-400">
                Chronological Case Actions
              </span>
              {!comment.actions || comment.actions.length === 0 ? (
                <p className="text-charcoal-500 italic py-6 text-center">
                  No moderation actions recorded for this comment yet.
                </p>
              ) : (
                <div className="border border-charcoal-800 rounded divide-y divide-charcoal-850">
                  {comment.actions.map((act) => (
                    <div key={act.id} className="p-3 flex items-start justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-charcoal-200 uppercase tracking-wide">
                            {act.action}
                          </span>
                          <span className="text-charcoal-500">•</span>
                          <span className="text-charcoal-400 capitalize">
                            by {act.actor_type}
                          </span>
                        </div>
                        <p className="text-charcoal-300 leading-normal">{act.reason}</p>
                      </div>
                      <span className="text-[11px] text-charcoal-500 font-mono flex-shrink-0">
                        {new Date(act.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Decision Action Buttons */}
        {activeTab === 'decision' && !actionType && (
          <div className="px-6 py-4 border-t border-charcoal-800 bg-charcoal-900 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-charcoal-500">
              {isLockedForMe ? (
                <span className="text-amber-400 font-medium">Locked: Assigned to {assignedModeratorName}</span>
              ) : (
                <span>Select human moderation action</span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* Restore Button (if hidden or deleted) */}
              {(comment.is_hidden || comment.moderation_status === 'deleted') && (
                <button
                  type="button"
                  disabled={isLockedForMe || !!loadingAction}
                  onClick={() => setActionType('restored')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 font-medium disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
              )}

              {/* Approve Button */}
              {comment.moderation_status !== 'approved' && (
                <button
                  type="button"
                  disabled={isLockedForMe || !!loadingAction}
                  onClick={() => setActionType('approved')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-emerald-950/50 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 font-medium disabled:opacity-40"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Approve</span>
                </button>
              )}

              {/* Flag Button */}
              {comment.moderation_status !== 'flagged' && (
                <button
                  type="button"
                  disabled={isLockedForMe || !!loadingAction}
                  onClick={() => setActionType('flagged')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-amber-950/50 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 font-medium disabled:opacity-40"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Flag</span>
                </button>
              )}

              {/* Escalate Button */}
              {!comment.is_escalated && (
                <button
                  type="button"
                  disabled={isLockedForMe || !!loadingAction}
                  onClick={() => setActionType('escalated')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-800/60 font-medium disabled:opacity-40"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Escalate</span>
                </button>
              )}

              {/* Hide Button */}
              {!comment.is_hidden && (
                <button
                  type="button"
                  disabled={isLockedForMe || !!loadingAction}
                  onClick={() => setActionType('hidden')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800/60 font-medium disabled:opacity-40"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide Comment</span>
                </button>
              )}

              {/* Delete Button (Super Admin Only) */}
              {isSuperAdmin && comment.moderation_status !== 'deleted' && (
                <button
                  type="button"
                  disabled={!!loadingAction}
                  onClick={() => setActionType('deleted')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-850 hover:bg-red-950 text-red-400 border border-charcoal-700 hover:border-red-800 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Release Modal */}
        {showReleaseModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
            <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-md w-full p-5 space-y-4 shadow-2xl">
              <h3 className="text-sm font-semibold text-charcoal-100">
                Release Case Back to Central Queue
              </h3>
              <p className="text-xs text-charcoal-400">
                Please state the reason for releasing this case so another moderator can claim it.
              </p>
              <textarea
                rows={3}
                required
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                placeholder="e.g. Requires language translation or supervisor review..."
                className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 focus:outline-none focus:border-charcoal-600"
              />
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReleaseModal(false)}
                  className="px-3 py-1.5 rounded text-charcoal-400 hover:text-charcoal-200 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!releaseReason.trim() || !!loadingAction}
                  onClick={handleReleaseCase}
                  className="px-4 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 text-xs font-medium disabled:opacity-50"
                >
                  {loadingAction ? 'Releasing...' : 'Confirm Release'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
