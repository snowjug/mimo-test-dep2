import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MimoCoinsDisplay } from "./mimo-coins-display";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { CircleHelp } from "lucide-react";
import { Wordmark } from "./mimo/ui";
import api from "../api";

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

const HOW_IT_WORKS = [
  { title: "Upload", body: "Add a PDF, Word, PowerPoint, Excel, text file or photo." },
  { title: "Choose options", body: "Pick the machine, colour, sides, pages and copies." },
  { title: "Pay", body: "You get a 4-digit print code as soon as payment clears." },
  { title: "Print at the kiosk", body: "Type the code on the MIMO keypad and collect your pages." },
];

/** Bottom sheet explaining the four-step flow. */
export function HelpSheet() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="How MIMO works"
          className="press flex size-10 items-center justify-center rounded-full text-ink-2 active:bg-surface-2"
        >
          <CircleHelp className="size-[22px]" strokeWidth={1.75} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How MIMO works</DialogTitle>
          <DialogDescription>Four steps from your phone to paper.</DialogDescription>
        </DialogHeader>
        <ol className="mt-1 space-y-4">
          {HOW_IT_WORKS.map((step, i) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold tabular-nums text-brand-text">
                {i + 1}
              </span>
              <div>
                <p className="text-[16px] font-semibold text-ink">{step.title}</p>
                <p className="text-[15px] leading-snug text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
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

/** Home header: wordmark, help, coins and profile. */
export function MimoHeader() {
  const navigate = useNavigate();
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
    <header className="sticky top-0 z-30 -mx-4 bg-canvas/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-14 items-center justify-between">
        <button type="button" onClick={() => navigate("/upload")} aria-label="MIMO home" className="press -ml-1 px-1 py-2">
          <Wordmark />
        </button>
        <div className="flex items-center gap-1.5">
          <HelpSheet />
          <MimoCoinsDisplay />
          <ProfileButton name={name} />
        </div>
      </div>
    </header>
  );
}
