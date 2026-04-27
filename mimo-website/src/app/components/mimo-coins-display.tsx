import { useState, useEffect } from "react";
import { Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export function MimoCoinsDisplay() {
  const navigate = useNavigate();
  const [mimoCoinsBalance, setMimoCoinsBalance] = useState(0);

  useEffect(() => {
    const fetchCoins = async () => {
      try {
        const res = await api.get("/mimo/coins");
        setMimoCoinsBalance(res.data.balance || 0);
        localStorage.setItem("mimoCoinsInfo", JSON.stringify(res.data));
      } catch (err) {
        console.error("Error fetching coins in header", err);
        // Fallback to localStorage if offline/error
        const savedCoins = localStorage.getItem("mimoCoinsInfo");
        if (savedCoins) {
          setMimoCoinsBalance(JSON.parse(savedCoins).balance || 0);
        }
      }
    };

    fetchCoins();
    
    // Listen for storage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mimoCoinsInfo' && e.newValue) {
        setMimoCoinsBalance(JSON.parse(e.newValue).balance || 0);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <>
      {/* Desktop version */}
      <div 
        className="hidden sm:flex items-center gap-2 mr-4 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-full cursor-pointer transition-colors"
        onClick={(e) => { e.stopPropagation(); navigate("/user-profile?tab=mimo-coins"); }}
      >
        <Gift className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-semibold text-purple-900">{mimoCoinsBalance} Coins</span>
      </div>

      {/* Mobile version (with count) */}
      <div 
        className="flex sm:hidden flex-shrink-0 items-center justify-center px-2 h-8 mr-1 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-full cursor-pointer transition-colors gap-1"
        onClick={(e) => { e.stopPropagation(); navigate("/user-profile?tab=mimo-coins"); }}
      >
        <Gift className="w-3 h-3 text-purple-600" />
        <span className="text-xs font-bold text-purple-900">{mimoCoinsBalance}</span>
      </div>
    </>
  );
}
