import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar, type AppTheme } from './TopBar';
import { MobileNavigation } from './MobileNavigation';

export interface AppShellProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentTheme: AppTheme;
  onToggleTheme: () => void;
  onSearchChange?: (q: string) => void;
  incidentCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onTabChange,
  currentTheme,
  onToggleTheme,
  onSearchChange,
  incidentCount = 2,
  children,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Lock background body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isMobileDrawerOpen]);

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setIsMobileDrawerOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => !prev);
    }
  };

  const handleTabChange = (tab: string) => {
    onTabChange(tab);
    setIsMobileDrawerOpen(false);
  };

  const isDark = currentTheme === 'dark';

  return (
    <div
      data-theme={currentTheme}
      className={`min-h-screen md:h-screen w-full md:w-screen md:overflow-hidden flex flex-col md:flex-row font-sans bg-[var(--bg-page)] text-[var(--text-primary)] transition-colors duration-200 ${
        isDark ? 'dark' : ''
      }`}
    >
      {/* Mobile Drawer Backdrop */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-in Drawer Sidebar from Left */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] bg-white dark:bg-[#0B132B] shadow-2xl md:hidden transform transition-transform duration-220 ease-out flex flex-col ${
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          incidentCount={incidentCount}
          isCollapsed={false}
          onClose={() => setIsMobileDrawerOpen(false)}
        />
      </div>

      {/* Desktop Left Sidebar (240px expanded / 72px collapsed) */}
      <aside
        className={`hidden md:block shrink-0 transition-all duration-300 ${
          isSidebarCollapsed ? 'w-[72px]' : 'w-[240px]'
        } h-screen z-20`}
      >
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          incidentCount={incidentCount}
          isCollapsed={isSidebarCollapsed}
        />
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-hidden bg-transparent">
        {/* Sticky/Fixed Top Bar */}
        <header className="shrink-0 sticky top-0 z-20">
          <TopBar
            currentTheme={currentTheme}
            onToggleTheme={onToggleTheme}
            onSearchChange={onSearchChange}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
        </header>

        {/* Vertical Scroll Area (Natural viewport scroll on mobile, contained on desktop) */}
        <main
          id="main-scroll-area"
          className="flex-1 w-full md:overflow-y-auto md:overflow-x-hidden p-4 sm:p-6 lg:p-8 pb-32 sm:pb-36 md:pb-16 lg:pb-20"
          style={{
            paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 24px))',
          }}
        >
          <div className="max-w-[1600px] mx-auto w-full pb-8 sm:pb-12">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenMoreDrawer={() => setIsMobileDrawerOpen(true)}
        isDrawerOpen={isMobileDrawerOpen}
        incidentCount={incidentCount}
      />
    </div>
  );
};
