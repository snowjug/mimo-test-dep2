import React, { useState } from 'react';
import { Loader2, AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface StaffLoginProps {
  variant: 'admin' | 'finance';
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

const COPY = {
  admin: {
    portal: 'Admin',
    title: 'Sign in to Admin',
    subtitle: 'Kiosks, print operations and fleet management.',
    placeholder: 'mimo.admin',
    switchLabel: 'Need Finance Portal?',
    switchText: 'Go to Finance',
    switchHref: '/finance',
  },
  finance: {
    portal: 'Finance',
    title: 'Sign in to Finance',
    subtitle: 'Payments, refunds, pricing, settlements and P&L.',
    placeholder: 'mimo.finance',
    switchLabel: 'Need Admin Portal?',
    switchText: 'Go to Admin',
    switchHref: '/admin',
  },
};

export const StaffLogin: React.FC<StaffLoginProps> = ({ variant, onLogin, loading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [caps, setCaps] = useState(false);
  const { isDark } = useTheme();
  const c = COPY[variant];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    onLogin(email.trim(), password);
  };

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCaps(e.getModifierState?.('CapsLock') ?? false);
  };

  return (
    <div className={`min-h-[100dvh] w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 font-sans antialiased px-4 py-8 text-slate-900 dark:text-slate-100 ${isDark ? 'dark' : ''}`}>
      <div className="w-full max-w-[420px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-7 sm:p-8 shadow-sm flex flex-col">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800">
          <span
            className="text-2xl font-black tracking-tight text-[#093765] dark:text-white select-none"
            style={{ fontFamily: "'Lovelo', sans-serif" }}
          >
            MIMO
          </span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {c.portal}
          </span>
        </div>

        {/* Title */}
        <div className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {c.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {c.subtitle}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="font-medium leading-snug">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="space-y-1.5">
            <label htmlFor="staff-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Username or Email
            </label>
            <div className="relative">
              <input
                id="staff-email"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={c.placeholder}
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-[#093765] dark:focus:border-indigo-400 focus:ring-2 focus:ring-[#093765]/10 dark:focus:ring-indigo-400/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="staff-password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Password
              </label>
              {caps && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                  Caps Lock ON
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="staff-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={checkCaps}
                onKeyUp={checkCaps}
                onBlur={() => setCaps(false)}
                placeholder="••••••••••••"
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 px-3.5 pr-11 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none transition focus:border-[#093765] dark:focus:border-indigo-400 focus:ring-2 focus:ring-[#093765]/10 dark:focus:ring-indigo-400/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-1 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#093765] hover:bg-[#062A4E] text-white text-sm font-bold shadow-xs transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">{c.switchLabel}</span>
          <a
            href={c.switchHref}
            className="font-bold text-[#093765] dark:text-indigo-400 hover:underline"
          >
            {c.switchText} →
          </a>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
          Staff access only · Verified by MIMO API
        </p>
      </div>
    </div>
  );
};


