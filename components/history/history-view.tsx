'use client';

import React, { useState } from 'react';
import { Search, Filter, History, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { Database } from '@/types/database';
import { getFacebookApiResponse } from '@/lib/comments/comment-state';

interface HistoryViewProps {
  initialActions: (Database['public']['Tables']['moderation_actions']['Row'] & {
    comments: {
      message: string;
      commenter_name: string | null;
      facebook_pages: { name: string } | null;
    } | null;
  })[];
}

export function HistoryView({ initialActions }: HistoryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActor, setSelectedActor] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [inspectAction, setInspectAction] = useState<any | null>(null);

  const filtered = initialActions.filter((act) => {
    if (searchTerm) {
      const matchReason = act.reason.toLowerCase().includes(searchTerm.toLowerCase());
      const matchComment = act.comments?.message.toLowerCase().includes(searchTerm.toLowerCase()) || false;
      const matchCommenter = act.comments?.commenter_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
      if (!matchReason && !matchComment && !matchCommenter) return false;
    }

    if (selectedActor !== 'all' && act.actor_type !== selectedActor) return false;
    if (selectedAction !== 'all' && act.action !== selectedAction) return false;

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-charcoal-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search reason, message, or user..."
              className="w-full pl-9 pr-3 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 placeholder-charcoal-500 focus:outline-none focus:border-charcoal-600"
            />
          </div>

          <div>
            <select
              value={selectedActor}
              onChange={(e) => setSelectedActor(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Actors (AI & Admins)</option>
              <option value="ai">AI Autonomous</option>
              <option value="super_admin">Super Administrator</option>
              <option value="moderator">Moderator</option>
              <option value="system">System Engine</option>
            </select>
          </div>

          <div>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-300 focus:outline-none focus:border-charcoal-600"
            >
              <option value="all">All Action Types</option>
              <option value="approved">Approved</option>
              <option value="hidden">Hidden on Facebook</option>
              <option value="restored">Restored</option>
              <option value="flagged">Flagged</option>
              <option value="threat_alerted">Threat Alert Triggered</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-charcoal-500 pt-1 border-t border-charcoal-850">
          Showing <span className="font-mono text-charcoal-200">{filtered.length}</span> recorded actions
        </div>
      </div>

      {/* History Table */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-charcoal-500">
            No moderation actions found in history records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-charcoal-950 border-b border-charcoal-800 text-charcoal-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-4">Action & Outcome</th>
                  <th className="py-2.5 px-4">Target Comment</th>
                  <th className="py-2.5 px-3">Facebook Page</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Reason / Justification</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-4 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-800">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-charcoal-850/50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-charcoal-200 uppercase tracking-wide">
                          {item.action}
                        </span>
                        {item.outcome === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs truncate text-charcoal-300">
                      {item.comments?.message || <span className="text-charcoal-600 italic">Deleted</span>}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap text-charcoal-400">
                      {item.comments?.facebook_pages?.name || 'Page'}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono capitalize bg-charcoal-850 border border-charcoal-800 text-charcoal-300">
                        {item.actor_type}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-charcoal-400 max-w-sm truncate">
                      {item.reason}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-charcoal-500">
                      {new Date(item.created_at).toLocaleString()}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {getFacebookApiResponse(item.api_response) != null ? (
                        <button
                          onClick={() => setInspectAction(item)}
                          className="px-2 py-1 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-300 border border-charcoal-700 text-[11px] font-mono"
                        >
                          API Result
                        </button>
                      ) : (
                        <span className="text-charcoal-600 font-mono text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payload Modal */}
      {inspectAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-charcoal-800 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-charcoal-100">
                Meta API Moderation Response Payload
              </h3>
              <button
                onClick={() => setInspectAction(null)}
                className="text-charcoal-400 hover:text-charcoal-200 text-xs"
              >
                Close
              </button>
            </div>
            <pre className="p-4 rounded bg-charcoal-950 border border-charcoal-800 text-charcoal-300 font-mono text-xs overflow-x-auto max-h-72">
              {JSON.stringify(getFacebookApiResponse(inspectAction.api_response), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
