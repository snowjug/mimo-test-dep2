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
    <div 
      className="flex items-center justify-center w-10 h-10 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-full cursor-pointer transition-all shrink-0 shadow-sm"
      onClick={(e) => { e.stopPropagation(); navigate("/user-profile?tab=mimo-coins"); }}
      title={`${mimoCoinsBalance} Mimo Coins`}
    >
      <Gift className="w-5 h-5 text-purple-600" />
    </div>
  );
}
