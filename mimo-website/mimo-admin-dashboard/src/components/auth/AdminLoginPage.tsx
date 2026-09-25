import React, { useState } from 'react';
import {
  Building,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

export interface AdminLoginPageProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({
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
      <div className="w-full max-w-[420px] bg-white rounded-3xl border border-[#EDE9FE] shadow-[0_12px_40px_rgba(124,58,237,0.07)] p-8 sm:p-10 transition-all">
        {/* Brand Icon Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#7C3AED] to-[#A78BFA] flex items-center justify-center text-white shadow-lg shadow-purple-500/25 mb-4 shrink-0">
            <Building className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-[#0F172A] tracking-tight leading-tight">
            Welcome Back
          </h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            Sign in to MIMO Command Center
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
          {/* Email / Username */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Username / Email
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
                placeholder="admin@mimo.in"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-[#FAF9FD] text-[#0F172A] text-sm font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#7C3AED] focus:bg-white focus:ring-2 focus:ring-purple-500/10 transition-all"
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
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 bg-[#FAF9FD] text-[#0F172A] text-sm font-semibold placeholder:text-slate-400 focus:outline-none focus:border-[#7C3AED] focus:bg-white focus:ring-2 focus:ring-purple-500/10 transition-all"
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

          {/* Remember Me */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-[#7C3AED] border-slate-300 focus:ring-[#7C3AED] cursor-pointer accent-[#7C3AED]"
              />
              <span className="text-xs font-semibold text-slate-600">Remember session</span>
            </label>
            <span className="text-xs font-bold text-[#7C3AED] hover:underline cursor-pointer">
              Admin Access
            </span>
          </div>

          {/* Sign In Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-sm rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/35 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In to Command Center</span>
              )}
            </button>
          </div>
        </form>

        {/* Security Footer */}
        <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>256-Bit Encrypted Admin Session</span>
        </div>
      </div>
    </div>
  );
};
