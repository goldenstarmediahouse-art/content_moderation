'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus, Shield, CheckCircle, AlertTriangle, Lock } from 'lucide-react';
import { Database } from '@/types/database';
import { CurrentAdmin } from '@/lib/auth/session';

interface AdminsViewProps {
  initialAdmins: Database['public']['Tables']['admin_users']['Row'][];
  currentAdmin: CurrentAdmin;
}

export function AdminsView({ initialAdmins, currentAdmin }: AdminsViewProps) {
  const router = useRouter();
  const [admins, setAdmins] = useState(initialAdmins);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleCreateModerator(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_moderator',
          email,
          password,
          full_name: fullName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create moderator account');
      }

      setSuccessMsg(`Moderator account created for ${email}.`);
      setShowCreateModal(false);
      setEmail('');
      setPassword('');
      setFullName('');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(targetAdminId: string, currentStatus: boolean) {
    if (targetAdminId === currentAdmin.id) {
      alert('You cannot deactivate your own Super Admin account.');
      return;
    }

    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_status',
          targetAdminId,
          is_active: !currentStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAdmins((prev) =>
        prev.map((a) => (a.id === targetAdminId ? { ...a, is_active: !currentStatus } : a))
      );
      router.refresh();
    } catch (err: any) {
      alert(`Error toggling account status: ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-4 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-charcoal-200">
            Church Administrator Directory ({admins.length})
          </h2>
          <p className="text-xs text-charcoal-400 mt-0.5">
            Strict two-administrator role architecture (One Super Admin, One Moderator).
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 text-xs font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Provision Moderator Account</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-charcoal-950 border-b border-charcoal-800 text-charcoal-400 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Administrator</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Created</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-800">
            {admins.map((adminUser) => {
              const isSelf = adminUser.id === currentAdmin.id;

              return (
                <tr key={adminUser.id} className="hover:bg-charcoal-850/40 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-charcoal-100">
                      {adminUser.full_name || 'Administrator'}
                    </div>
                    {isSelf && (
                      <span className="text-[10px] text-emerald-400 uppercase font-mono font-bold">
                        (Current Active Session)
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 font-mono text-charcoal-300">
                    {adminUser.email}
                  </td>

                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border ${
                        adminUser.role === 'super_admin'
                          ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                          : 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                      }`}
                    >
                      {adminUser.role === 'super_admin' ? 'Super Admin' : 'Moderator'}
                    </span>
                  </td>

                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                        adminUser.is_active
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                          : 'bg-red-950/60 text-red-300 border-red-800/60'
                      }`}
                    >
                      {adminUser.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>

                  <td className="py-3.5 px-3 font-mono text-[11px] text-charcoal-500 whitespace-nowrap">
                    {new Date(adminUser.created_at).toLocaleDateString()}
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {!isSelf && adminUser.role === 'moderator' ? (
                      <button
                        onClick={() => handleToggleStatus(adminUser.id, adminUser.is_active)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          adminUser.is_active
                            ? 'bg-red-950/50 hover:bg-red-900 text-red-300 border-red-800/60'
                            : 'bg-emerald-950/50 hover:bg-emerald-900 text-emerald-300 border-emerald-800/60'
                        }`}
                      >
                        {adminUser.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-charcoal-600 font-mono">Protected</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Provision Moderator Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="border-b border-charcoal-800 pb-3">
              <h3 className="text-sm font-semibold text-charcoal-100">
                Provision Moderator Account
              </h3>
              <p className="text-xs text-charcoal-400 mt-0.5">
                Creates a verified login credential in Supabase Auth and registers the account in the administrator directory.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateModerator} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Tendai Moyo"
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="moderator@church.org"
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-charcoal-300 font-medium">Temporary Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-charcoal-100 focus:outline-none focus:border-charcoal-600"
                />
              </div>

              <div className="p-3 rounded bg-charcoal-950 border border-charcoal-800 text-[11px] text-charcoal-400">
                Assigned Role: <span className="font-semibold text-charcoal-200">Moderator</span>. Moderators can review, approve, and flag comments but cannot modify system-wide settings or integration credentials.
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-charcoal-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded text-charcoal-400 hover:text-charcoal-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 font-medium disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
