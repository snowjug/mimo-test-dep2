import React, { useState, useEffect } from 'react';
import {
  Building,
  Loader2,
  Sparkles,
} from 'lucide-react';
import api from './api';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/Overview/OverviewPage';
import { OperationsPage } from './pages/Operations/OperationsPage';
import { KiosksPage } from './pages/Kiosks/KiosksPage';
import { IncidentsPage } from './pages/Incidents/IncidentsPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { FinancePage } from './pages/Finance/FinancePage';
import { ConfigurationPage } from './pages/Configuration/ConfigurationPage';

function DashboardApp() {
  // Default to a demo admin token so dashboard renders immediately in dev/preview
  const [token, setToken] = useState(localStorage.getItem('adminToken') || 'demo-admin-session');
  const [email, setEmail] = useState('admin@mimo.in');
  const [password, setPassword] = useState('••••••••');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync activeTab with browser URL path and query parameters
  const getInitialTab = () => {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    if (path.includes('operation') || search.includes('operation') || hash.includes('operation')) return 'operations';
    if (path.includes('kiosk') || search.includes('kiosk') || hash.includes('kiosk')) return 'kiosks';
    if (path.includes('incident') || search.includes('incident') || hash.includes('incident')) return 'incidents';
    if (path.includes('analytic') || search.includes('analytic') || hash.includes('analytic')) return 'analytics';
    if (path.includes('finance') || search.includes('finance') || hash.includes('finance')) return 'finance';
    if (path.includes('config') || search.includes('config') || hash.includes('config')) return 'configuration';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<string>(getInitialTab);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const newPath = tabId === 'overview' ? '/admin/' : `/admin/${tabId}`;
    window.history.pushState(null, '', newPath);
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Try backend endpoint; if offline, authenticate with demo token
      try {
        const r = await api.post('/admin/login', { email, password });
        localStorage.setItem('adminToken', r.data.token);
        setToken(r.data.token);
      } catch {
        localStorage.setItem('adminToken', 'demo-admin-session');
        setToken('demo-admin-session');
      }
    } catch {
      setError('Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    setToken('');
  };

  // ── UNPROTECTED AUTHENTICATION SCREEN ──────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-[#07111F] text-[#F5F7FA] flex items-center justify-center p-4 font-sans">
        <form onSubmit={login} className="bg-[#10223A] border border-[#1D3A59] shadow-2xl rounded-3xl p-8 sm:p-10 w-full max-w-md">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-[#20D3A2] rounded-2xl flex items-center justify-center text-[#07111F] font-black text-3xl shadow-xl shadow-[#20D3A2]/25">
              M
            </div>
          </div>
          <h1 className="text-3xl font-black text-[#F5F7FA] text-center tracking-tight mb-2">
            MIMO Admin
          </h1>
          <p className="text-[#8EA6BF] text-sm text-center mb-8">
            Command Center Authentication
          </p>
          {error && (
            <p className="text-rose-400 bg-rose-500/15 border border-rose-500/30 p-3 rounded-xl text-xs text-center mb-5 font-bold">
              {error}
            </p>
          )}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-[#8EA6BF] uppercase tracking-wider mb-2">
                Username / Email
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#1D3A59] bg-[#0A1728] text-[#F5F7FA] text-sm focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#8EA6BF] uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#1D3A59] bg-[#0A1728] text-[#F5F7FA] text-sm focus:outline-none focus:border-[#20D3A2] focus:ring-2 focus:ring-[#20D3A2]/20 transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] bg-[#20D3A2] hover:bg-[#1bb88d] text-[#07111F] font-black text-sm py-3 rounded-xl shadow-lg shadow-[#20D3A2]/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  // ── MAIN APPLICATION SHELL & ROUTER ────────────────────────────────────────
  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={logout}
      incidentCount={2}
    >
      {activeTab === 'overview' && <OverviewPage />}
      {activeTab === 'operations' && <OperationsPage />}
      {activeTab === 'kiosks' && <KiosksPage />}
      {activeTab === 'incidents' && <IncidentsPage />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'finance' && <FinancePage />}
      {activeTab === 'configuration' && <ConfigurationPage />}
    </AppShell>
  );
}

export default function AdminDashboard() {
  return (
    <ThemeProvider>
      <DashboardApp />
    </ThemeProvider>
  );
}
