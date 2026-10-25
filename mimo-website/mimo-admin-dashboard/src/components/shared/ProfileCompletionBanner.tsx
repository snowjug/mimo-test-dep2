import React, { useState } from 'react';
import { X, UserCircle } from 'lucide-react';
import { StaffProfile, profileCompletionPct } from '../../services/profile.service';

/** Non-blocking nudge: never gates any feature, just a dismissible reminder. Dismissing hides it for
 * the rest of this browser session (sessionStorage) -- it reappears next session if still incomplete,
 * but never nags repeatedly within one. Hidden entirely once the profile is 100% complete. */
export const ProfileCompletionBanner: React.FC<{ profile: StaffProfile; onComplete: () => void }> = ({ profile, onComplete }) => {
  const key = `mimo_profile_banner_dismissed_${profile.id || profile.role || 'me'}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1' || sessionStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const pct = profileCompletionPct(profile);

  if (dismissed || pct >= 100) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, '1');
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 shadow-2xl animate-fadeIn">
      <div className="flex items-start gap-3">
        <UserCircle className="mt-0.5 size-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Your profile is {pct}% complete</p>
          <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">Add a photo, date of birth, or your documents whenever you get a chance.</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={onComplete}
              className="rounded-full bg-[#093765] dark:bg-indigo-600 hover:bg-[#062A4E] dark:hover:bg-indigo-700 px-3 py-1.5 text-[11.5px] font-bold text-white cursor-pointer transition-colors shadow-2xs"
            >
              Complete profile
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-3 py-1.5 text-[11.5px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss banner"
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
