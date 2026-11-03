'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate.');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-charcoal-950 flex flex-col justify-center items-center px-4 select-none">
      <div className="max-w-md w-full space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded bg-charcoal-900 border border-charcoal-800 text-charcoal-200">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold uppercase tracking-wider text-charcoal-100">
            Golden Star Media House
          </h1>
          <p className="text-xs text-charcoal-400">
            Church Facebook Comment Moderation Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-charcoal-900 border border-charcoal-800 rounded-lg p-6 shadow-xl space-y-4">
          <div className="border-b border-charcoal-800 pb-3">
            <h2 className="text-sm font-semibold text-charcoal-200">
              Administrator Sign In
            </h2>
            <p className="text-xs text-charcoal-500 mt-0.5">
              Authorized church personnel only. Public registration is disabled.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded bg-status-threat-bg border border-status-threat-border text-red-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal-300">
                Administrator Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-charcoal-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@church.org"
                  className="w-full pl-9 pr-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 placeholder-charcoal-600 focus:outline-none focus:border-charcoal-600 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal-300">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-charcoal-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 placeholder-charcoal-600 focus:outline-none focus:border-charcoal-600 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2 px-4 bg-charcoal-800 hover:bg-charcoal-700 text-charcoal-100 border border-charcoal-700 rounded text-xs font-medium flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Console'}</span>
              {!loading && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </form>
        </div>

        <div className="text-center text-[11px] text-charcoal-600 font-mono">
          Strict access control enforced via Supabase Auth & RLS
        </div>
      </div>
    </div>
  );
}
