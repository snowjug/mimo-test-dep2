import React, { useState, useEffect } from 'react';
import {
  Building,
  Loader2,
} from 'lucide-react';
import api from './api';
import { ThemeProvider } from './context/ThemeContext';
import { AppShell } from './components/layout/AppShell';
import { OverviewPage } from './pages/Overview/OverviewPage';
import { OperationsPage } from './pages/Operations/OperationsPage';
import { KiosksPage } from './pages/Kiosks/KiosksPage';
import { IncidentsPage } from './pages/Incidents/IncidentsPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { UsersPage } from './pages/Users/UsersPage';
import { FinancePage } from './pages/Finance/FinancePage';
import { ConfigurationPage } from './pages/Configuration/ConfigurationPage';

import { AdminLoginPage } from './components/auth/AdminLoginPage';

function DashboardApp() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Sync activeTab with browser URL path
  const getInitialTab = () => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('operation')) return 'operations';
    if (path.includes('kiosk')) return 'kiosks';
    if (path.includes('incident')) return 'incidents';
    if (path.includes('user') || path.includes('customer')) return 'users';
    if (path.includes('analytic')) return 'analytics';
    if (path.includes('finance')) return 'finance';
    if (path.includes('config') || path.includes('setting')) return 'configuration';
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

  const handleLogin = async (email: string, pass: string) => {
    setError('');
    setLoading(true);
    try {
      const r = await api.post('/admin/login', { email, password: pass });
      localStorage.setItem('adminToken', r.data.token);
      setToken(r.data.token);
    } catch {
      setError('Invalid credentials. Please check your username/password.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    setToken('');
  };

  const handleResetMetrics = async () => {
    if (!confirm('Reset ALL telemetry and platform metrics?')) return;
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
      <AdminLoginPage
        onLogin={handleLogin}
        loading={loading}
        error={error}
      />
    );
  }

  // ── MAIN APPLICATION SHELL (7 EXACT PAGES) ─────────────────────────────────
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
      {activeTab === 'users' && <UsersPage />}
      {activeTab === 'finance' && <FinancePage />}
      {activeTab === 'configuration' && <ConfigurationPage />}
    </AppShell>
  );
}

import { FinanceApp } from './pages/Finance/FinanceApp';

export default function RootApp() {
  const [isFinanceRoute, setIsFinanceRoute] = useState(() => {
    return window.location.pathname.toLowerCase().startsWith('/finance');
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsFinanceRoute(window.location.pathname.toLowerCase().startsWith('/finance'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (isFinanceRoute) {
    return <FinanceApp />;
  }

  return (
    <ThemeProvider>
      <DashboardApp />
    </ThemeProvider>
  );
}
