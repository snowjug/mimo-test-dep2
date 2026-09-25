import React, { useState } from 'react';
import {
  Layers,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Building2,
} from 'lucide-react';

export interface FinanceLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const FinanceLoginPage: React.FC<FinanceLoginPageProps> = ({
  onLogin,
  loading,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen w-full bg-[#F8F6F0] flex items-center justify-center p-4 sm:p-6 select-none font-sans antialiased">
      <div className="w-full max-w-[440px] bg-white rounded-3xl border border-[#EDE9FE] shadow-[0_12px_40px_rgba(109,53,232,0.08)] p-8 sm:p-10 transition-all">
        {/* Brand Icon Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#6D35E8] to-[#9065FD] flex items-center justify-center text-white shadow-lg shadow-purple-500/25 mb-4 shrink-0">
            <Layers className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-[#19162D] tracking-tight leading-tight">
            MIMO Finance
          </h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            Financial Management & Ledger Portal
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Finance ID / Email */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Finance ID / Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="finance@mimo.ac.in"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-[#FAF9FD] text-[#19162D] text-sm font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#6D35E8] focus:bg-white focus:ring-2 focus:ring-purple-500/10 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 bg-[#FAF9FD] text-[#19162D] text-sm font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#6D35E8] focus:bg-white focus:ring-2 focus:ring-purple-500/10 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me & Portal Badge */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-[#6D35E8] border-slate-300 focus:ring-[#6D35E8] cursor-pointer accent-[#6D35E8]"
              />
              <span className="text-xs font-semibold text-slate-600">Remember session</span>
            </label>
            <div className="flex items-center gap-1 text-xs font-bold text-[#6D35E8]">
              <Building2 className="w-3.5 h-3.5" />
              <span>Finance Portal</span>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#6D35E8] hover:bg-[#5b29c9] text-white font-extrabold text-sm rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/35 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Enter Finance Portal</span>
              )}
            </button>
          </div>
        </form>

        {/* Security Footer */}
        <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>256-Bit Encrypted Financial Session</span>
        </div>
      </div>
    </div>
  );
};
