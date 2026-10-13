import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MimoCoinsDisplay } from "./mimo-coins-display";
import { CircleHelp, MapPin, Gift } from "lucide-react";
import { Wordmark } from "./mimo/ui";
import api from "../api";
import { useTour } from "../utils/tour-context";

export function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2) || "M"
  );
}

export function ProfileButton({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/user-profile")}
      aria-label="Your profile"
      className="press flex size-9 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white shadow-sm"
    >
      {initialsOf(name)}
    </button>
  );
}

/** Home header: wordmark, how-to, location, coins and profile. */
export function MimoHeader() {
  const navigate = useNavigate();
  const { start: startTour } = useTour();
  const [name, setName] = useState(() => localStorage.getItem("mimo_user_name") || "");

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
      if (e.key === "mimo_user_name" && e.newValue) {
        setName(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <header className="sticky top-0 z-30 -mx-4 bg-canvas/95 px-3 py-2.5 backdrop-blur-md border-b border-hairline/60">
      <div className="flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Left: Wordmark & How to print */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => navigate("/upload")} aria-label="MIMO home" className="press shrink-0">
            <Wordmark className="text-[22px] sm:text-[24px]" />
          </button>

          <button
            type="button"
            onClick={() => { navigate("/upload"); startTour(); }}
            aria-label="Show the how-to-print tutorial"
            className="press flex items-center gap-1 rounded-full bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold text-brand transition-colors active:bg-blue-100"
          >
            <CircleHelp className="size-3.5 shrink-0" strokeWidth={2.25} />
            <span className="whitespace-nowrap">How to print</span>
          </button>
        </div>

        {/* Right: Location, Coins, Profile */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/find-machine")}
            aria-label="Find a kiosk"
            className="press flex items-center gap-0.5 rounded-full px-1.5 py-1 text-[11px] sm:text-[12px] font-semibold text-ink hover:bg-surface-2 active:bg-surface-3"
          >
            <MapPin className="size-3.5 text-brand" strokeWidth={2.25} />
            <span className="max-w-[50px] sm:max-w-[65px] truncate">REVA</span>
            <span className="text-[10px] text-ink-3">▾</span>
          </button>

          <MimoCoinsDisplay />

          <ProfileButton name={name} />
        </div>
      </div>
    </header>
  );
}
