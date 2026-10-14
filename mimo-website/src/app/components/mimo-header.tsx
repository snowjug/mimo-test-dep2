import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MimoCoinsDisplay } from "./mimo-coins-display";
import { CircleHelp, MapPin } from "lucide-react";
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
      className="press flex size-10 items-center justify-center rounded-full bg-brand text-[14px] font-semibold text-on-brand"
    >
      {initialsOf(name)}
    </button>
  );
}

/** Home header: wordmark, tutorial, location, coins and profile. */
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
    <header className="sticky top-0 z-30 -mx-4 bg-canvas/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:mx-[calc(50%-50vw)] lg:border-b lg:border-hairline lg:px-8">
      <div className="flex h-14 items-center lg:mx-auto lg:max-w-[768px]">
        <button type="button" onClick={() => navigate("/upload")} aria-label="MIMO home" className="press -ml-1 shrink-0 px-1 py-2">
          <Wordmark />
        </button>
        <div className="flex min-w-0 flex-1 justify-center px-1">
          <button
            type="button"
            onClick={() => {
              navigate("/upload");
              startTour();
            }}
            aria-label="Show the how-to-print tutorial"
            className="press flex min-w-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-ink-2 active:bg-surface-3"
          >
            <CircleHelp className="size-[14px] shrink-0" strokeWidth={2} />
            <span className="truncate">How to print</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate("/find-machine")}
            aria-label="Find a kiosk location"
            className="press flex items-center gap-1.5 rounded-full bg-surface-2 hover:bg-surface-3 active:bg-surface-3 px-2.5 py-1.5 text-[13px] font-semibold text-ink transition-colors"
          >
            <MapPin className="size-3.5 text-brand-text shrink-0" strokeWidth={2.2} />
            <span>REVA</span>
          </button>
          <MimoCoinsDisplay />
          <ProfileButton name={name} />
        </div>
      </div>
    </header>
  );
}
