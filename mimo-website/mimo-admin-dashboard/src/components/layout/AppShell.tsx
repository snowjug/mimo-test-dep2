import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNavigation } from './MobileNavigation';

interface AppShellProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onLogout?: () => void;
  incidentCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  incidentCount = 2,
  children,
}) => {
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#07111F] text-[#F5F7FA] font-sans antialiased flex flex-col md:flex-row">
      {/* Desktop Left Fixed & Collapsible Sidebar (250px expanded / 76px collapsed) */}
      <aside
        className={`hidden md:block shrink-0 h-screen bg-[#0A1728] border-r border-[#1D3A59] shadow-2xl z-30 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-[76px]' : 'w-[250px]'
        }`}
      >
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          onLogout={onLogout}
          incidentCount={incidentCount}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />
      </aside>

      {/* Main Content Viewport & Header */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden bg-[#07111F]">
        {/* Fixed Top Bar (pinned, does not scroll with main content) */}
        <div className="shrink-0 z-20">
          <TopBar
            onSearch={(q) => setGlobalSearchQuery(q)}
            onLogout={onLogout}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          />
        </div>

        {/* Independently Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-40 md:pb-16">
          <div className="w-full max-w-[1560px] mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileNavigation
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLogout={onLogout}
      />
    </div>
  );
};
