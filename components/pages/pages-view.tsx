'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Share2,
  Plus,
  Trash2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { Database } from '@/types/database';
import { CurrentAdmin } from '@/lib/auth/session';

interface PagesViewProps {
  initialPages: Database['public']['Tables']['facebook_pages']['Row'][];
  admin: CurrentAdmin;
}

export function PagesView({ initialPages, admin }: PagesViewProps) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [pageId, setPageId] = useState('');
  const [name, setName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryingPageId, setRetryingPageId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pageActionError, setPageActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isSuperAdmin = admin.role === 'super_admin';

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setPageActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          pageId,
          name,
          accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect page.');
      }

      if (!data.tokenValid) {
        setPageActionError(
          `Saved "${data.page.name}", but Page Access Token validation failed: ${data.webhookError || 'Unknown token error.'}`
        );
      } else if (data.webhookSubscribed) {
        setSuccessMsg(`Successfully connected "${data.page.name}". Feed webhook subscription is active.`);
      } else {
        setPageActionError(
          `Connected "${data.page.name}", but the webhook subscription failed: ${data.webhookError || data.webhookStatusError || 'Unknown error.'}`
        );
      }
      setShowConnectModal(false);
      setPageId('');
      setName('');
      setAccessToken('');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryWebhookSubscription(pageDbId: string, pageName: string) {
    setRetryingPageId(pageDbId);
    setPageActionError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry_webhook_subscription',
          pageDbId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retry the webhook subscription.');
      }

      setPages((prev) => prev.map((page) => page.id === pageDbId
        ? {
            ...page,
            webhook_subscribed: data.webhookSubscribed,
            error_message: data.webhookSubscribed
              ? null
              : `Webhook subscription failed (${data.webhookErrorCode || 'unknown'}): ${data.webhookError || 'Unknown subscription error.'}`,
          }
        : page
      ));

      if (data.webhookSubscribed) {
        setSuccessMsg(`Feed webhook subscription is active for "${pageName}".`);
      } else {
        setPageActionError(
          `Webhook subscription failed for "${pageName}" (${data.webhookErrorCode || 'unknown'}): ${data.webhookError || 'Unknown subscription error.'}`
        );
      }
      router.refresh();
    } catch (err: any) {
      alert(`Webhook subscription retry failed: ${err.message}`);
      router.refresh();
    } finally {
      setRetryingPageId(null);
    }
  }

  async function handleToggleSetting(pageDbId: string, setting: string, currentValue: boolean) {
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_setting',
          pageDbId,
          setting,
          value: !currentValue,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update setting');
      }

      setPages((prev) =>
        prev.map((p) => (p.id === pageDbId ? { ...p, [setting]: !currentValue } : p))
      );
      router.refresh();
    } catch (err: any) {
      alert(`Error updating page setting: ${err.message}`);
    }
  }

  async function handleDisconnect(pageDbId: string, pageName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to disconnect "${pageName}"? This will stop comment ingestion and remove associated stored tokens.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disconnect',
          pageDbId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to disconnect page');
      }

      setPages((prev) => prev.filter((p) => p.id !== pageDbId));
      router.refresh();
    } catch (err: any) {
      alert(`Error disconnecting page: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
            Connected Facebook Pages ({pages.length})
          </h2>
          <p className="text-xs text-charcoal-400 mt-0.5">
            Configure church Facebook Pages, monitoring rules, and Meta webhook subscriptions.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 text-xs font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Page</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {pageActionError && (
        <div className="p-3 rounded bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{pageActionError}</span>
        </div>
      )}

      {/* Pages List */}
      {pages.length === 0 ? (
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-12 text-center text-xs text-charcoal-500 space-y-3">
          <Share2 className="w-8 h-8 text-charcoal-600 mx-auto" />
          <h3 className="text-sm font-semibold text-charcoal-200">No Facebook Pages Connected</h3>
          <p className="max-w-md mx-auto">
            Connect church Facebook Pages using a valid Page Access Token to enable live comment ingestion, webhook alerts, and AI analysis.
          </p>
          {isSuperAdmin && (
            <button
              onClick={() => setShowConnectModal(true)}
              className="mt-2 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 text-xs font-medium"
            >
              Connect Page Now
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {pages.map((page) => (
            <div
              key={page.id}
              className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-charcoal-100">{page.name}</h3>
                  <div className="flex items-center space-x-3 text-xs text-charcoal-500 font-mono mt-1">
                    <span>Page ID: {page.page_id}</span>
                    <span>•</span>
                    <span>Category: {page.category || 'Church Page'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border uppercase ${
                      page.connection_status === 'connected'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                        : 'bg-red-950/60 text-red-300 border-red-800/60'
                    }`}
                  >
                    {page.connection_status.replace('_', ' ')}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border uppercase ${
                      page.webhook_subscribed
                        ? 'bg-charcoal-850 text-charcoal-300 border-charcoal-700'
                        : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                    }`}
                  >
                    {page.webhook_subscribed ? 'Feed Subscribed' : 'Webhook Unsubscribed'}
                  </span>
                </div>
              </div>

              {page.error_message && (
                <div className="p-3 rounded bg-red-950/20 border border-red-900/40 text-red-300 text-xs">
                  {page.error_message}
                </div>
              )}

              {/* Toggles & Settings Bar */}
              <div className="pt-3 border-t border-charcoal-850 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center space-x-6">
                  {/* Monitoring Toggle */}
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isSuperAdmin}
                      checked={page.is_monitored}
                      onChange={() => handleToggleSetting(page.id, 'is_monitored', page.is_monitored)}
                      className="rounded bg-charcoal-950 border-charcoal-700 text-charcoal-200 focus:ring-0"
                    />
                    <span className="text-charcoal-300 font-medium">Ingest & Monitor Comments</span>
                  </label>

                  {/* Auto-Approve Safe */}
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isSuperAdmin}
                      checked={page.auto_approve_safe}
                      onChange={() => handleToggleSetting(page.id, 'auto_approve_safe', page.auto_approve_safe)}
                      className="rounded bg-charcoal-950 border-charcoal-700 text-charcoal-200 focus:ring-0"
                    />
                    <span className="text-charcoal-300 font-medium">Auto-Approve Safe Comments</span>
                  </label>

                  {/* Auto-Hide Dangerous Comments */}
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isSuperAdmin}
                      checked={page.auto_hide_enabled}
                      onChange={() => {
                        if (!page.auto_hide_enabled) {
                          const conf = window.confirm(
                            'WARNING: Enabling automatic hiding will cause comments with high-confidence serious violations to be hidden via the Facebook API without human pre-approval. Continue?'
                          );
                          if (!conf) return;
                        }
                        handleToggleSetting(page.id, 'auto_hide_enabled', page.auto_hide_enabled);
                      }}
                      className="rounded bg-charcoal-950 border-charcoal-700 text-charcoal-200 focus:ring-0"
                    />
                    <span className="text-charcoal-300 font-medium">
                      Auto-Hide High Violations
                      {page.auto_hide_enabled && (
                        <span className="ml-1 text-[10px] text-amber-400 font-bold uppercase">(Active)</span>
                      )}
                    </span>
                  </label>
                </div>

                {isSuperAdmin && (
                  <div className="flex items-center space-x-4">
                    {!page.webhook_subscribed && (
                      <button
                        onClick={() => handleRetryWebhookSubscription(page.id, page.name)}
                        disabled={retryingPageId === page.id}
                        className="flex items-center space-x-1 text-xs text-charcoal-300 hover:text-white transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${retryingPageId === page.id ? 'animate-spin' : ''}`} />
                        <span>{retryingPageId === page.id ? 'Retrying...' : 'Retry webhook subscription'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDisconnect(page.id, page.name)}
                      className="flex items-center space-x-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-charcoal-800 pb-3">
              <h3 className="text-sm font-semibold text-charcoal-100">
                Connect Facebook Page
              </h3>
              <p className="text-xs text-charcoal-400 mt-0.5">
                Enter your Facebook Page ID and Page Access Token. The token will be encrypted server-side with AES-256-GCM before storage.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleConnect} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Page Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Grace Fellowship Church Harare"
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Facebook Page ID</label>
                <input
                  type="text"
                  required
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="e.g. 102938475610293"
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Page Access Token</label>
                <textarea
                  required
                  rows={3}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAA..."
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600 font-mono text-[11px]"
                />
                <span className="text-[10px] text-charcoal-500">
                  Webhook subscription requires <code className="text-charcoal-400">pages_manage_metadata</code>.
                  Comment ingestion also requires <code className="text-charcoal-400">pages_read_engagement</code>.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-charcoal-800">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-3 py-1.5 rounded text-charcoal-400 hover:text-charcoal-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 font-medium disabled:opacity-50"
                >
                  {submitting ? 'Connecting & Verifying...' : 'Save & Encrypt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
