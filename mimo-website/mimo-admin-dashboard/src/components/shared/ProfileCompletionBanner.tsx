import React, { useState } from 'react';
import { X, UserCircle } from 'lucide-react';
import { StaffProfile, profileCompletionPct } from '../../services/profile.service';

/** Non-blocking nudge: never gates any feature, just a dismissible reminder. Dismissing hides it for
 * the rest of this browser session (sessionStorage) -- it reappears next session if still incomplete,
 * but never nags repeatedly within one. Hidden entirely once the profile is 100% complete. */
export const ProfileCompletionBanner: React.FC<{ profile: StaffProfile; onComplete: () => void }> = ({ profile, onComplete }) => {
  const key = `mimo_profile_banner_dismissed_${profile.id || profile.role || 'me'}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
  });
  const pct = profileCompletionPct(profile);

  if (dismissed || pct >= 100) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-2xl animate-fadeIn sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="flex items-start gap-3">
        <UserCircle className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-1)]">Your profile is {pct}% complete</p>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-3)]">Add a photo, date of birth, or your documents whenever you get a chance.</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={onComplete} className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-[11.5px] font-bold text-white cursor-pointer">
              Complete profile
            </button>
            <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-[11.5px] font-bold text-[var(--text-3)] cursor-pointer">
              Later
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 rounded-lg p-1 text-[var(--text-3)] hover:bg-[var(--surface-2)] cursor-pointer">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
