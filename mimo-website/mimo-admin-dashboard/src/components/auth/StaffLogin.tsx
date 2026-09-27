import React, { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

export interface StaffLoginProps {
  variant: 'admin' | 'finance';
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

/*
 * Sign-in shared by the separate Admin and Finance portals. Same system, two identities:
 *   admin    a dark graphite console, navy light from below, "MIMO Admin"
 *   finance  a light ledger with ruled lines drawing in, green identity, "MIMO Finance"
 * Motion is a one-time staggered entrance (.staff-in); reduced motion collapses it in index.css.
 */
const COPY = {
  admin: { portal: 'Admin', subtitle: 'Kiosks, print operations and customers.', placeholder: 'admin@mimo.in' },
  finance: { portal: 'Finance', subtitle: 'Payments, refunds, pricing and settlements.', placeholder: 'finance@mimo.ac.in' },
};

export const StaffLogin: React.FC<StaffLoginProps> = ({ variant, onLogin, loading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [caps, setCaps] = useState(false);
  const dark = variant === 'admin';
  const c = COPY[variant];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  const input = dark
    ? 'h-[52px] w-full rounded-[14px] border border-white/12 bg-white/[0.06] px-4 text-[16px] text-white placeholder:text-slate-400 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20'
    : 'h-[52px] w-full rounded-[14px] border border-slate-300 bg-white px-4 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100';
  const label = `px-1 text-[14px] font-medium ${dark ? 'text-slate-300' : 'text-slate-600'}`;

  return (
    <div className={`min-h-[100dvh] font-sans antialiased ${dark ? 'bg-slate-950' : 'bg-slate-100'}`}>
      <div
        className={`relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] ${
          dark ? 'bg-[#0f1013] text-white' : 'bg-slate-50 text-slate-900'
        }`}
      >
        {/* Identity plane */}
        {dark ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(59,116,186,0.28),transparent_70%)]" />
        ) : (
          <div aria-hidden className="pointer-events-none absolute inset-x-5 bottom-[84px] flex flex-col gap-[22px]">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="ledger-rule block h-px origin-left bg-emerald-700/10" style={{ animationDelay: `${120 + i * 70}ms` }} />
            ))}
          </div>
        )}

        <div className="relative flex items-center justify-between">
          <p className={`select-none text-[26px] leading-none ${dark ? 'text-white' : 'text-indigo-700'}`} style={{ fontFamily: "'Lovelo', sans-serif", fontWeight: 900 }}>
            MIMO
          </p>
          <span
            className={`staff-in rounded-full px-3 py-1 text-[13px] font-semibold ${
              dark ? 'bg-white/10 text-slate-200' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {c.portal}
          </span>
        </div>

        <div className="relative mt-14">
          <h1 className="staff-in text-[34px] font-semibold leading-[1.08] tracking-[-0.035em]" style={{ animationDelay: '60ms' }}>
            Sign in
          </h1>
          <p className={`staff-in mt-2 text-[16px] ${dark ? 'text-slate-400' : 'text-slate-600'}`} style={{ animationDelay: '110ms' }}>
            {c.subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="staff-in relative mt-8 flex flex-col gap-4" style={{ animationDelay: '170ms' }}>
          {error && (
            <div role="alert" className={`flex items-start gap-2.5 rounded-[14px] px-4 py-3 text-[14px] ${dark ? 'bg-rose-500/15 text-rose-200' : 'bg-rose-50 text-rose-700'}`}>
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="staff-email" className={label}>Email</label>
            <input
              id="staff-email"
              type="text"
              inputMode="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={c.placeholder}
              className={input}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="staff-password" className={label}>Password</label>
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
                className={`${input} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className={`absolute inset-y-0 right-1 flex w-14 items-center justify-center text-[13px] font-semibold ${dark ? 'text-indigo-300' : 'text-indigo-700'}`}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {caps && <p className={`px-1 text-[13px] ${dark ? 'text-amber-300' : 'text-amber-700'}`}>Caps Lock is on.</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`mt-2 flex h-[52px] w-full items-center justify-center rounded-[14px] text-[16px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
              dark ? 'bg-white text-slate-950' : 'bg-indigo-700 text-white'
            }`}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : 'Sign in'}
          </button>
        </form>

        <p className="relative mt-auto pt-10 text-center text-[13px] text-slate-500">
          Staff access only. Sessions are verified by the MIMO API.
        </p>
      </div>
    </div>
  );
};
