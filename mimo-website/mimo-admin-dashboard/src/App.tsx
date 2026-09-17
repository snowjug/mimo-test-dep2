import React, { useState, useEffect } from 'react';
import {
  Building,
  Loader2,
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
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Sync activeTab with browser URL path
  const getInitialTab = () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('operation')) return 'operations';
    if (path.includes('kiosk')) return 'kiosks';
    if (path.includes('incident')) return 'incidents';
    if (path.includes('analytic')) return 'analytics';
    if (path.includes('finance')) return 'finance';
    if (path.includes('config')) return 'configuration';
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
      const r = await api.post('/admin/login', { email, password });
      localStorage.setItem('adminToken', r.data.token);
      setToken(r.data.token);
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

  const handleResetMetrics = async () => {
    if (!confirm('Reset ALL metrics?')) return;
    setIsResetting(true);
    try {
      await api.post('/admin/reset-metrics', {}, { headers: { Authorization: `Bearer ${token}` } });
      window.location.reload();
    } catch {
      alert('Failed to reset metrics.');
    } finally {
      setIsResetting(false);
    }
  };

  // ── UNPROTECTED AUTHENTICATION SCREEN ──────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center p-4 font-sans">
        <form onSubmit={login} className="bg-white border border-[#ede9fe] shadow-xl rounded-2xl p-8 w-full max-w-sm">
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 bg-[#7c3aed] rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Building className="text-white w-7 h-7" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-[#1e1b4b] text-center tracking-tight mb-1">
            Welcome Back
          </h1>
          <p className="text-gray-500 text-xs text-center mb-6">
            Sign in to MIMO Command Center
          </p>
          {error && (
            <p className="text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-xl text-xs text-center mb-4 font-semibold">
              {error}
            </p>
          )}
          <div className="space-y-3.5 mb-5">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Username / Email
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-[#1e1b4b] text-sm focus:outline-none focus:border-[#7c3aed] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 text-[#1e1b4b] text-sm focus:outline-none focus:border-[#7c3aed] focus:bg-white transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold py-3 rounded-xl shadow-lg shadow-purple-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
      onResetMetrics={handleResetMetrics}
      isResetting={isResetting}
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
