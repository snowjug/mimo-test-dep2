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
    <button
      type="button"
      className="press flex items-center gap-1 rounded-full bg-blue-50/80 px-2 py-1 text-[11px] font-bold tabular-nums text-brand transition-colors active:bg-blue-100"
      onClick={(e) => { e.stopPropagation(); navigate("/user-profile?tab=mimo-coins"); }}
      aria-label={`${mimoCoinsBalance} MIMO coins`}
    >
      <Gift className="size-3.5 text-brand" strokeWidth={2.25} />
      <span>{mimoCoinsBalance}</span>
    </button>
  );
}
