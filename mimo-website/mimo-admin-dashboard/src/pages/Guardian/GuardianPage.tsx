import React, { useState } from 'react';
import { Activity, Cpu, Settings } from 'lucide-react';
import { guardian } from '../../services/guardian.service';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { GuardianSummaryCards } from './components/GuardianSummaryCards';
import { GuardianKioskTable } from './components/GuardianKioskTable';
import { GuardianKioskDetailModal } from './components/GuardianKioskDetail';
import { KiosksPage } from '../Kiosks/KiosksPage';
import { ConfigurationPage } from '../Configuration/ConfigurationPage';

type GuardianSubTab = 'health' | 'network' | 'configuration';

const SUB_TABS: { id: GuardianSubTab; label: string; icon: React.ElementType }[] = [
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'network', label: 'Network', icon: Cpu },
  { id: 'configuration', label: 'Configuration', icon: Settings },
];

/**
 * MIMO Edge Guardian — kiosk health, network and configuration, grouped under one nav entry.
 *
 * Only the Health sub-tab is Guardian's own surface, and it stays strictly observational: it calls
 * GET /admin/guardian/health only (via services/guardian.service.ts, the shared authenticated `api`
 * client every admin page uses), issues no kiosk command, no restart, no paper refill, no
 * provisioning or revocation call, and writes nothing anywhere. A failed Guardian fetch only
 * affects this sub-tab: it cannot touch printing.
 *
 * The Network and Configuration sub-tabs are the pre-existing KiosksPage/ConfigurationPage
 * components, unchanged, nested here only for navigation. They keep calling their own existing
 * write-capable admin routes (kiosk restart, paper/toner restock, screensaver + threshold saves) —
 * that control-plane logic is NOT part of Guardian's own read-only code path, which stays the way
 * CLAUDE.md requires it: observe-only, no automatic repair or control actions.
 */
export const GuardianPage: React.FC = () => {
  const [subTab, setSubTab] = useState<GuardianSubTab>('health');
  const q = useLiveQuery(() => guardian.summary(), [], { intervalMs: 45000, live: subTab === 'health' });
  const [detailKioskId, setDetailKioskId] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="hidden lg:block text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Edge Guardian</h1>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Kiosk health, network and configuration.</p>
        </div>
        {subTab === 'health' && <LiveIndicator updatedAt={q.updatedAt} live fetching={q.fetching} onRefresh={q.refresh} />}
      </div>

      <div className="flex items-center gap-1.5 border-b border-[var(--border)]">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 -mb-px cursor-pointer transition-colors ${
              subTab === id
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {subTab === 'health' && (
        <>
          {q.error && <ErrorBanner message={q.error} onRetry={q.refresh} />}

          <GuardianSummaryCards kiosks={q.data?.kiosks ?? []} loading={q.loading} />

          {q.data && (
            <>
              <p className="text-[11px] text-[var(--text-3)]">
                Showing {q.data.kiosks.length} kiosk{q.data.kiosks.length === 1 ? '' : 's'} that {q.data.kiosks.length === 1 ? 'has' : 'have'} reported Guardian telemetry.
                This is not necessarily the full provisioned fleet, and is separate from the printing system's own kiosk online/offline status.
              </p>
              <GuardianKioskTable kiosks={q.data.kiosks} onViewDetails={setDetailKioskId} />
            </>
          )}

          {q.loading && !q.data && (
            <div className="space-y-2">
              <div className="skeleton h-10 w-48" />
              <div className="skeleton h-64" />
            </div>
          )}

          {detailKioskId && (
            <GuardianKioskDetailModal kioskId={detailKioskId} onClose={() => setDetailKioskId(null)} />
          )}
        </>
      )}

      {subTab === 'network' && <KiosksPage />}
      {subTab === 'configuration' && <ConfigurationPage />}
    </div>
  );
};
