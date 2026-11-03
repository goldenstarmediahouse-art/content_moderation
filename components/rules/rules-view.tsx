'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sliders, CheckCircle, AlertTriangle, Edit2, Shield } from 'lucide-react';
import { Database, ModerationRuleSeverity, RuleAction } from '@/types/database';
import { RuleActionBadge, SeverityBadge } from '@/components/ui/badge';
import { CurrentAdmin } from '@/lib/auth/session';

interface RulesViewProps {
  initialRules: Database['public']['Tables']['moderation_rules']['Row'][];
  admin: CurrentAdmin;
}

export function RulesView({ initialRules, admin }: RulesViewProps) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [editingRule, setEditingRule] = useState<Database['public']['Tables']['moderation_rules']['Row'] | null>(null);
  const [severity, setSeverity] = useState<ModerationRuleSeverity>('medium');
  const [action, setAction] = useState<RuleAction>('flag');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isSuperAdmin = admin.role === 'super_admin';

  function openEdit(rule: Database['public']['Tables']['moderation_rules']['Row']) {
    setEditingRule(rule);
    setSeverity(rule.severity);
    setAction(rule.action);
    setDescription(rule.description);
    setSuccessMsg(null);
  }

  async function handleToggleRule(ruleId: string, currentEnabled: boolean) {
    if (!isSuperAdmin) return;

    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId,
          is_enabled: !currentEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_enabled: !currentEnabled } : r))
      );
      router.refresh();
    } catch (err: any) {
      alert(`Error toggling rule: ${err.message}`);
    }
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule || !isSuperAdmin) return;

    if (action === 'hide') {
      const confirmed = window.confirm(
        'WARNING: Setting this rule action to "hide" will recommend automatic comment suppression on Facebook when page auto-hide is active. Are you sure you wish to proceed?'
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: editingRule.id,
          severity,
          action,
          description,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? { ...r, severity, action, description }
            : r
        )
      );

      setSuccessMsg(`Rule "${editingRule.name}" updated successfully.`);
      setEditingRule(null);
      router.refresh();
    } catch (err: any) {
      alert(`Error saving rule: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
            Active Moderation Policy Rules ({rules.length})
          </h2>
          <p className="text-xs text-charcoal-400 mt-0.5">
            Rules governing AI classification, severity escalation, and automated policy responses.
          </p>
        </div>
        {!isSuperAdmin && (
          <span className="text-xs text-charcoal-500 italic">
            Read-only mode (Super Admin privileges required to edit)
          </span>
        )}
      </div>

      {successMsg && (
        <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-charcoal-950 border-b border-charcoal-800 text-charcoal-400 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Rule Name & Category</th>
              <th className="py-3 px-4">Policy Description</th>
              <th className="py-3 px-3">Severity</th>
              <th className="py-3 px-3">Configured Action</th>
              <th className="py-3 px-3">Status</th>
              {isSuperAdmin && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-800">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-charcoal-850/40 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-charcoal-100">{rule.name}</div>
                  <div className="text-[11px] font-mono text-charcoal-500 uppercase">
                    {rule.category}
                  </div>
                </td>
                <td className="py-3.5 px-4 text-charcoal-300 max-w-md leading-relaxed">
                  {rule.description}
                </td>
                <td className="py-3.5 px-3 whitespace-nowrap">
                  <SeverityBadge severity={rule.severity} />
                </td>
                <td className="py-3.5 px-3 whitespace-nowrap">
                  <RuleActionBadge action={rule.action} />
                </td>
                <td className="py-3.5 px-3 whitespace-nowrap">
                  <button
                    disabled={!isSuperAdmin}
                    onClick={() => handleToggleRule(rule.id, rule.is_enabled)}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${
                      rule.is_enabled
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                        : 'bg-charcoal-800 text-charcoal-500 border-charcoal-700'
                    } disabled:cursor-default`}
                  >
                    {rule.is_enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                {isSuperAdmin && (
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(rule)}
                      className="px-2.5 py-1 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-200 border border-charcoal-700 transition-colors"
                    >
                      Edit Rule
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-charcoal-800 pb-3">
              <h3 className="text-sm font-semibold text-charcoal-100">
                Edit Moderation Rule: {editingRule.name}
              </h3>
              <p className="text-xs text-charcoal-400 mt-0.5 font-mono">
                Category: {editingRule.category}
              </p>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Policy Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-charcoal-300 font-medium">Severity Level</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as ModerationRuleSeverity)}
                    className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-charcoal-300 font-medium">Action</label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as RuleAction)}
                    className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                  >
                    <option value="allow">Allow</option>
                    <option value="flag">Flag</option>
                    <option value="human_review">Human Review</option>
                    <option value="alert">Alert Administrator</option>
                    <option value="hide">Hide (Requires Confirmation)</option>
                  </select>
                </div>
              </div>

              {action === 'hide' && (
                <div className="p-3 rounded bg-red-950/30 border border-red-800/60 text-red-300 text-[11px] flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Setting action to "Hide" will instruct the background engine to attempt automatic suppression on Facebook when auto-hide is enabled for the target Page.
                  </span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-charcoal-800">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-3 py-1.5 rounded text-charcoal-400 hover:text-charcoal-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Policy Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
