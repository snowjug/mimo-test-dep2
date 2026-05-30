import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { MimoCoinsDisplay } from "./mimo-coins-display";
import api from "../api";

export function MimoHeader() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem("mimo_user_name") || "Admin User");

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await api.get("/mimo/user");
        if (res.data.name) {
          setName(res.data.name);
          localStorage.setItem("mimo_user_name", res.data.name);
        }
      } catch (err) {
        console.error("Error fetching user in header", err);
      }
    };
    fetchUser();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mimo_user_name' && e.newValue) {
        setName(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <>
      <div className="flex items-end justify-between border-b-[5px] border-[#194059] mb-2 sm:mb-8 pt-4 pb-0">
        <div className="flex items-end gap-2 cursor-pointer group overflow-hidden" onClick={() => navigate("/upload")}>
          <h1 
            className="text-4xl sm:text-5xl font-black text-[#194059] select-none m-0 translate-y-[3px] sm:translate-y-[4px]"
            style={{ fontFamily: "'Lovelo', sans-serif", lineHeight: "0.8" }}
          >
            MIMO
          </h1>
        </div>
      <div className="flex items-center gap-1 sm:gap-3 pb-1">
        <MimoCoinsDisplay />
        <div 
          className="flex items-center gap-1 sm:gap-3 cursor-pointer p-1 sm:p-2 hover:bg-slate-200/50 rounded-xl transition-colors" 
            onClick={() => navigate("/user-profile")}
          >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-gray-700">{name}</p>
            <p className="text-xs text-gray-500">View Profile</p>
          </div>
          <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
            <AvatarFallback className="bg-[#194059] text-white font-bold">
              {name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
            </AvatarFallback>
          </Avatar>
        </div>
        </div>
      </div>
    </>
  );
}
