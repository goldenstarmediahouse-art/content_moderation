'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div
      className="relative isolate min-h-screen bg-charcoal-950 flex flex-col justify-center items-center px-4 select-none"
    >
      <img
        src="/IMG_4190.JPG"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 z-0 h-full w-full object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-charcoal-950/70"
      />
      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <img
            src="/golden%20star%20logo.png"
            alt="Golden Star Media House"
            className="mx-auto h-auto w-64"
          />
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
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2 bg-charcoal-950 border border-charcoal-800 rounded text-xs text-charcoal-100 placeholder-charcoal-600 focus:outline-none focus:border-charcoal-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-2.5 text-charcoal-500 hover:text-charcoal-300 focus:outline-none focus:text-charcoal-300"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
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
