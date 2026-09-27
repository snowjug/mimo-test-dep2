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
      className="press flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 pl-2.5 pr-3 text-[14px] font-semibold tabular-nums text-ink active:bg-surface-3"
      onClick={(e) => { e.stopPropagation(); navigate("/user-profile?tab=mimo-coins"); }}
      aria-label={`${mimoCoinsBalance} MIMO coins`}
    >
      <Gift className="size-4 text-brand-text" strokeWidth={2} />
      {mimoCoinsBalance}
    </button>
  );
}
