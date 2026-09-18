import { useState, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
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

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const targetPath = tabId === 'overview' ? '/admin/' : `/admin/${tabId}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab: tabId }, '', targetPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleResetFilters = () => {
    setSearchQuery('');
  };

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
      onResetFilters={handleResetFilters}
      onSearchChange={setSearchQuery}
      incidentCount={2}
    >
      {renderActivePage()}
    </AppShell>
  );
}

export default App;
