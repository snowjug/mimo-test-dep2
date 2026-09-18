import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNavigation } from './MobileNavigation';

interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  onResetFilters?: () => void;
  onSearchChange?: (q: string) => void;
  incidentCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  onResetFilters,
  onSearchChange,
  incidentCount = 2,
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#07111F] text-[#F5F7FA] font-sans">
      {/* Desktop Left Sidebar (Fixed / Collapsible) */}
      <aside
        className={`hidden md:block shrink-0 transition-all duration-300 ${
          isCollapsed ? 'w-[76px]' : 'w-[250px]'
        } h-screen border-r border-[#1D3A59] bg-[#0A1728] z-20`}
      >
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          onLogout={onLogout}
          incidentCount={incidentCount}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden bg-[#07111F]">
        {/* Fixed / Sticky Top Bar */}
        <header className="shrink-0 z-10">
          <TopBar
            onSearch={onSearchChange}
            onReset={onResetFilters}
            onLogout={onLogout}
            isSidebarCollapsed={isCollapsed}
            onToggleSidebar={toggleCollapse}
          />
        </header>

        {/* The ONLY vertical scroll container */}
        <main
          id="main-scroll-area"
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 pb-32 md:pb-16 transition-all"
        >
          <div className="max-w-[1600px] mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation
        activeTab={activeTab}
        onTabChange={onTabChange}
        incidentCount={incidentCount}
        onLogout={onLogout}
      />
    </div>
  );
};
