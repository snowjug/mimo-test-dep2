import { useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router";
import {
  Upload,
  Settings,
  User,
  LogOut,
  Printer,
  Menu,
  Gift
} from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";

export function DashboardLayout() {

  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mimoCoinsBalance, setMimoCoinsBalance] = useState(0);
  const [userName, setUserName] = useState(() => localStorage.getItem("mimo_user_name") || "Admin User");


  useEffect(() => {
    // Scroll to top on route change
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    // Relaxed authentication check for demo
    // const isAuthenticated = localStorage.getItem("isAuthenticated");
    // if (!isAuthenticated) {
    //   navigate("/login");
    // }

    // Refresh Mimo Coins balance
    const savedCoins = localStorage.getItem("mimoCoinsInfo");
    if (savedCoins) {
      setMimoCoinsBalance(JSON.parse(savedCoins).balance || 0);
    }

    // Set user name
    const savedName = localStorage.getItem("mimo_user_name");
    if (savedName) {
      setUserName(savedName);
    }

    // Listen for storage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mimoCoinsInfo' && e.newValue) {
        setMimoCoinsBalance(JSON.parse(e.newValue).balance || 0);
      }
      if (e.key === 'mimo_user_name' && e.newValue) {
        setUserName(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    navigate("/login");
  };

  const navItems = [
    { path: "/", icon: Upload, label: "Upload File" },
    { path: "/settings", icon: Settings, label: "Settings" },
    { path: "/user-profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 transition-all duration-300 z-50 ${sidebarOpen ? "w-64" : "w-64 -translate-x-full lg:translate-x-0"
        }`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => navigate("/upload")}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                <Printer className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-xl">MIMO</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-700 hover:bg-gray-100"
                    }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-gray-200">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-6 py-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <div className="text-right mr-2 hidden sm:block">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-gray-500">user@mimo.com</p>
              </div>



              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition" onClick={() => navigate("/user-profile")}>
                <User className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
          </div>
        </header>

        <main className="p-3 sm:p-6 pb-20 sm:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}