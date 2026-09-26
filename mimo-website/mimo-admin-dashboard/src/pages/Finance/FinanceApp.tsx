import React, { useState, useEffect } from 'react';
import api from '../../api';
import { useRange } from '../../context/RangeContext';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { insights } from '../../services/insights.service';
import { FinanceLayout } from './layout/FinanceLayout';
import { FinanceTab } from './layout/FinanceSidebar';
import { FinanceOverviewPage } from './pages/FinanceOverviewPage';
import { FinanceTransactionsPage } from './pages/FinanceTransactionsPage';
import { FinanceAnalyticsPage } from './pages/FinanceAnalyticsPage';
import { FinanceRefundsPage } from './pages/FinanceRefundsPage';
import { FinancePricingPage } from './pages/FinancePricingPage';
import { FinanceWalletPage } from './pages/FinanceWalletPage';
import { FinanceSettlementsPage } from './pages/FinanceSettlementsPage';
import { FinanceLoginPage } from '../../components/auth/FinanceLoginPage';
import type { AdminUsersResponse } from '../../types/user.types';

const TAB_PATHS: [string, FinanceTab][] = [
  ['/finance/transaction', 'transactions'],
  ['/finance/analytic', 'analytics'],
  ['/finance/refund', 'refunds'],
  ['/finance/pricing', 'pricing'],
  ['/finance/wallet', 'wallet'],
  ['/finance/settlement', 'settlements'],
];
const tabFromPath = (): FinanceTab => {
  const path = window.location.pathname.toLowerCase();
  return TAB_PATHS.find(([p]) => path.includes(p))?.[1] ?? 'overview';
};

/**
 * Finance portal shell: login, navigation and ONE set of live, date-filtered queries shared by all pages.
 * Nothing here is invented: numbers come from /admin/analytics, /admin/transactions, /admin/refund-requests
 * and /admin/users (wallet page only); empty periods show zeros and failures show an error banner.
 */
export const FinanceApp: React.FC = () => {
  const [token, setToken] = useState<string>(() => localStorage.getItem('financeToken') || '');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<FinanceTab>(tabFromPath);
  const [globalSearch, setGlobalSearch] = useState('');
  const { range, current, live } = useRange();

  const handleTabChange = (tab: FinanceTab) => {
    setActiveTab(tab);
    window.history.pushState(null, '', tab === 'overview' ? '/finance' : `/finance/${tab}`);
  };

  useEffect(() => {
    const onPop = () => setActiveTab(tabFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Queries only run once signed in; they re-run when the date range changes and poll while the range includes today.
  const signedIn = !!token;
  const analytics = useLiveQuery(() => (signedIn ? insights.analytics(current()) : Promise.resolve(null)), [range, signedIn], { live: live && signedIn });
  const transactions = useLiveQuery(() => (signedIn ? insights.transactions(current(), { limit: 1000 }) : Promise.resolve(null)), [range, signedIn], { live: live && signedIn });
  const refunds = useLiveQuery(
    () => (signedIn ? api.get<{ requests: any[] }>('/admin/refund-requests').then((r) => r.data.requests) : Promise.resolve(null)),
    [signedIn],
    { live: signedIn, intervalMs: 30000 }
  );
  // Heavy (scans users, orders and jobs), so only while the Wallet page is open and refreshed manually.
  const wantUsers = signedIn && activeTab === 'wallet';
  const users = useLiveQuery(() => (wantUsers ? api.get<AdminUsersResponse>('/admin/users').then((r) => r.data) : Promise.resolve(null)), [wantUsers], { live: false });

  const refreshAll = () => { analytics.refresh(); transactions.refresh(); refunds.refresh(); if (wantUsers) users.refresh(); };
  const isRefreshing = analytics.fetching || transactions.fetching || refunds.fetching;
  const pendingRefunds = (refunds.data || []).filter((r) => r.status === 'pending').length;

  const handleLogin = async (loginEmail: string, loginPassword: string) => {
    setAuthError('');
    setIsAuthLoading(true);
    try {
      // Credentials are verified by the backend only; there is no client-side fallback session.
      const r = await api.post('/admin/login', { email: loginEmail, password: loginPassword });
      if (!r.data?.token) throw new Error('Login response had no token');
      localStorage.setItem('financeToken', r.data.token);
      setToken(r.data.token);
    } catch {
      setAuthError('Invalid credentials. Please enter valid Finance Portal access details.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('financeToken');
    setToken('');
  };

  if (!token) {
    return <FinanceLoginPage onLogin={handleLogin} loading={isAuthLoading} error={authError} />;
  }

  return (
    <FinanceLayout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={handleLogout}
      onRefresh={refreshAll}
      isRefreshing={isRefreshing}
      searchQuery={globalSearch}
      onSearchChange={setGlobalSearch}
      pendingRefundsCount={pendingRefunds}
    >
      {activeTab === 'overview' && (
        <FinanceOverviewPage
          analytics={analytics.data}
          transactions={transactions.data?.transactions ?? []}
          refundRequests={refunds.data ?? []}
          loading={analytics.loading}
          error={analytics.error}
          updatedAt={analytics.updatedAt}
          onRefresh={refreshAll}
          onNavigateToTab={(tab) => handleTabChange(tab as FinanceTab)}
        />
      )}
      {activeTab === 'transactions' && (
        <FinanceTransactionsPage
          transactions={transactions.data?.transactions ?? []}
          total={transactions.data?.total ?? 0}
          truncated={!!transactions.data?.truncated}
          globalSearch={globalSearch}
          loading={transactions.loading}
          error={transactions.error}
          onRefresh={transactions.refresh}
        />
      )}
      {activeTab === 'analytics' && (
        <FinanceAnalyticsPage analytics={analytics.data} loading={analytics.loading} error={analytics.error} onRefresh={analytics.refresh} />
      )}
      {activeTab === 'refunds' && (
        <FinanceRefundsPage refundRequests={refunds.data ?? []} loading={refunds.loading} error={refunds.error} onRefresh={refreshAll} />
      )}
      {activeTab === 'pricing' && <FinancePricingPage loading={false} onRefresh={refreshAll} />}
      {activeTab === 'wallet' && (
        <FinanceWalletPage users={users.data?.users ?? []} loading={users.loading} error={users.error} onRefresh={users.refresh} />
      )}
      {activeTab === 'settlements' && (
        <FinanceSettlementsPage analytics={analytics.data} transactions={transactions.data?.transactions ?? []} loading={analytics.loading} error={analytics.error} />
      )}
    </FinanceLayout>
  );
};
