import React from 'react';
import { SeverityLevel, ModerationStatus, RuleAction } from '@/types/database';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'threat' | 'warning' | 'safe' | 'muted' | 'default';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantStyles = {
    threat: 'bg-status-threat-bg text-red-400 border border-status-threat-border',
    warning: 'bg-status-warning-bg text-amber-400 border border-status-warning-border',
    safe: 'bg-status-safe-bg text-emerald-400 border border-status-safe-border',
    muted: 'bg-charcoal-800 text-charcoal-400 border border-charcoal-700',
    default: 'bg-charcoal-850 text-charcoal-300 border border-charcoal-800',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide uppercase ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  switch (severity) {
    case 'critical':
      return <Badge variant="threat">Critical</Badge>;
    case 'high':
      return <Badge variant="threat">High</Badge>;
    case 'medium':
      return <Badge variant="warning">Medium</Badge>;
    case 'low':
      return <Badge variant="muted">Low</Badge>;
    case 'safe':
    default:
      return <Badge variant="safe">Safe</Badge>;
  }
}

export function ModerationStatusBadge({ status }: { status: ModerationStatus }) {
  switch (status) {
    case 'approved':
      return <Badge variant="safe">Approved</Badge>;
    case 'hidden':
      return <Badge variant="threat">Hidden</Badge>;
    case 'restored':
      return <Badge variant="safe">Restored</Badge>;
    case 'flagged':
      return <Badge variant="warning">Flagged</Badge>;
    case 'review_required':
      return <Badge variant="warning">In Review</Badge>;
    case 'pending':
    default:
      return <Badge variant="muted">Pending</Badge>;
  }
}

export function RuleActionBadge({ action }: { action: RuleAction }) {
  switch (action) {
    case 'hide':
      return <Badge variant="threat">Hide</Badge>;
    case 'alert':
      return <Badge variant="threat">Alert</Badge>;
    case 'human_review':
      return <Badge variant="warning">Review</Badge>;
    case 'flag':
      return <Badge variant="warning">Flag</Badge>;
    case 'allow':
    default:
      return <Badge variant="safe">Allow</Badge>;
  }
}
