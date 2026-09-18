import { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import type { AppTheme } from './components/layout/TopBar';
import { OverviewPage } from './pages/Overview/OverviewPage';
import { OperationsPage } from './pages/Operations/OperationsPage';
import { KiosksPage } from './pages/Kiosks/KiosksPage';
import { IncidentsPage } from './pages/Incidents/IncidentsPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { FinancePage } from './pages/Finance/FinancePage';
import { ConfigurationPage } from './pages/Configuration/ConfigurationPage';

export function App() {
  const getTabFromUrl = (): string => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/operations')) return 'operations';
    if (path.includes('/kiosks')) return 'kiosks';
    if (path.includes('/incidents')) return 'incidents';
    if (path.includes('/analytics')) return 'analytics';
    if (path.includes('/finance')) return 'finance';
    if (path.includes('/configuration')) return 'configuration';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<string>(getTabFromUrl);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('mimo_theme') as AppTheme;
    if (saved === 'dark') return 'dark';
    return 'light';
  });

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const targetPath = tabId === 'overview' ? '/' : `/${tabId}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab: tabId }, '', targetPath);
    }
  };

  const toggleTheme = () => {
    setCurrentTheme((prev) => {
      const next: AppTheme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('mimo_theme', next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.body.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [currentTheme]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewPage
            onNavigateTab={handleTabChange}
            searchQuery={searchQuery}
          />
        );
      case 'operations':
        return (
          <OperationsPage
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'kiosks':
        return (
          <KiosksPage
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'incidents':
        return (
          <IncidentsPage
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'analytics':
        return (
          <AnalyticsPage
            searchQuery={searchQuery}
          />
        );
      case 'finance':
        return (
          <FinancePage
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'configuration':
        return (
          <ConfigurationPage
            searchQuery={searchQuery}
          />
        );
      default:
        return (
          <OverviewPage
            onNavigateTab={handleTabChange}
            searchQuery={searchQuery}
          />
        );
    }
  };

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      currentTheme={currentTheme}
      onToggleTheme={toggleTheme}
      onSearchChange={setSearchQuery}
      incidentCount={2}
    >
      {renderActivePage()}
    </AppShell>
  );
}

export default App;
