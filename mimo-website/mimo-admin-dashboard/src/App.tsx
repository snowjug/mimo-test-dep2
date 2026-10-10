import React, { useState, useEffect, lazy, Suspense } from 'react';
import api from './api';
import { ThemeProvider } from './context/ThemeContext';
import { RangeProvider } from './context/RangeContext';
import { AppShell } from './components/layout/AppShell';

// Admin and Finance are separate portals, so each (and each admin page) ships as its own chunk.
const OverviewPage = lazy(() => import('./pages/Overview/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const OperationsPage = lazy(() => import('./pages/Operations/OperationsPage').then((m) => ({ default: m.OperationsPage })));
const KiosksPage = lazy(() => import('./pages/Kiosks/KiosksPage').then((m) => ({ default: m.KiosksPage })));
const IncidentsPage = lazy(() => import('./pages/Incidents/IncidentsPage').then((m) => ({ default: m.IncidentsPage })));
const AnalyticsPage = lazy(() => import('./pages/Analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const UsersPage = lazy(() => import('./pages/Users/UsersPage').then((m) => ({ default: m.UsersPage })));
const CouponsPage = lazy(() => import('./pages/Coupons/CouponsPage').then((m) => ({ default: m.CouponsPage })));
const FinancePage = lazy(() => import('./pages/Finance/FinancePage').then((m) => ({ default: m.FinancePage })));
const ConfigurationPage = lazy(() => import('./pages/Configuration/ConfigurationPage').then((m) => ({ default: m.ConfigurationPage })));
const FinanceApp = lazy(() => import('./pages/Finance/FinanceApp').then((m) => ({ default: m.FinanceApp })));
const TechnicalApp = lazy(() => import('./pages/Technical/TechnicalApp').then((m) => ({ default: m.TechnicalApp })));
const HrApp = lazy(() => import('./pages/Hr/HrApp').then((m) => ({ default: m.HrApp })));
const MarketingApp = lazy(() => import('./pages/Marketing/MarketingApp').then((m) => ({ default: m.MarketingApp })));
const AdminCompanyPage = lazy(() => import('./pages/Company/AdminCompanyPage').then((m) => ({ default: m.AdminCompanyPage })));
const MimoGangPage = lazy(() => import('./pages/Gang/MimoGangPage').then((m) => ({ default: m.MimoGangPage })));

const PageSkeleton = () => (
  <div aria-busy="true" aria-label="Loading" className="space-y-3">
    <div className="skeleton h-24" />
    <div className="skeleton h-40" />
    <div className="skeleton h-40" />
  </div>
);

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
    if (path.includes('coupon')) return 'coupons';
    if (path.includes('analytic')) return 'analytics';
    if (path.includes('finance')) return 'finance';
    if (path.includes('config') || path.includes('setting')) return 'configuration';
    if (path.includes('company')) return 'company';
    if (path.includes('mimo-gang')) return 'mimo-gang';
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

  // ── MAIN APPLICATION SHELL (8 PAGES) ─────────────────────────────────
  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={logout}
      onResetMetrics={handleResetMetrics}
      isResetting={isResetting}
    >
      <Suspense fallback={<PageSkeleton />}>
      {activeTab === 'overview' && <OverviewPage />}
      {activeTab === 'operations' && <OperationsPage />}
      {activeTab === 'kiosks' && <KiosksPage />}
      {activeTab === 'incidents' && <IncidentsPage onNavigate={handleTabChange} />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'users' && <UsersPage />}
      {activeTab === 'coupons' && <CouponsPage />}
      {activeTab === 'finance' && <FinancePage />}
      {activeTab === 'configuration' && <ConfigurationPage />}
      {activeTab === 'company' && <AdminCompanyPage />}
      {activeTab === 'mimo-gang' && <MimoGangPage />}
      </Suspense>
    </AppShell>
  );
}


export default function RootApp() {
  const [isFinanceRoute, setIsFinanceRoute] = useState(() => {
    return window.location.pathname.toLowerCase().startsWith('/finance');
  });
  const [isTechnicalRoute, setIsTechnicalRoute] = useState(() => {
    return window.location.pathname.toLowerCase().startsWith('/technical');
  });
  const [isHrRoute, setIsHrRoute] = useState(() => {
    return window.location.pathname.toLowerCase().startsWith('/hr');
  });
  const [isMarketingRoute, setIsMarketingRoute] = useState(() => {
    return window.location.pathname.toLowerCase().startsWith('/marketing');
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsFinanceRoute(window.location.pathname.toLowerCase().startsWith('/finance'));
      setIsTechnicalRoute(window.location.pathname.toLowerCase().startsWith('/technical'));
      setIsHrRoute(window.location.pathname.toLowerCase().startsWith('/hr'));
      setIsMarketingRoute(window.location.pathname.toLowerCase().startsWith('/marketing'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  if (isFinanceRoute) {
    return (
      <ThemeProvider>
        <RangeProvider>
          <Suspense fallback={null}>
            <FinanceApp />
          </Suspense>
        </RangeProvider>
      </ThemeProvider>
    );
  }

  if (isTechnicalRoute) {
    return (
      <ThemeProvider>
        <RangeProvider>
          <Suspense fallback={null}>
            <TechnicalApp />
          </Suspense>
        </RangeProvider>
      </ThemeProvider>
    );
  }

  if (isHrRoute) {
    return (
      <ThemeProvider>
        <RangeProvider>
          <Suspense fallback={null}>
            <HrApp />
          </Suspense>
        </RangeProvider>
      </ThemeProvider>
    );
  }

  if (isMarketingRoute) {
    return (
      <ThemeProvider>
        <RangeProvider>
          <Suspense fallback={null}>
            <MarketingApp />
          </Suspense>
        </RangeProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <RangeProvider>
        <DashboardApp />
      </RangeProvider>
    </ThemeProvider>
  );
}
