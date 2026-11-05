import React, { useState } from 'react';
import { Activity, Cpu, Settings } from 'lucide-react';
import { guardian } from '../../services/guardian.service';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { LiveIndicator } from '../../components/ui/LiveIndicator';
import { ErrorBanner } from '../../components/insights/InsightBits';
import { GuardianSummaryCards } from './components/GuardianSummaryCards';
import { GuardianKioskTable } from './components/GuardianKioskTable';
import { GuardianKioskDetailModal } from './components/GuardianKioskDetail';
import { CustomerWebsiteStatusButton } from './components/CustomerWebsiteStatusButton';
import { CustomerWebsiteDiagnosticModal } from './components/CustomerWebsiteDiagnosticModal';
import { GuardianOutageControl } from './components/GuardianOutageControl';
import { KioskOutageStatusButton } from './components/KioskOutageStatusButton';
import { KiosksPage } from '../Kiosks/KiosksPage';
import { ConfigurationPage } from '../Configuration/ConfigurationPage';
import type { KioskOutageStatus } from '../../types/guardian.types';

type GuardianSubTab = 'health' | 'network' | 'configuration';

const SUB_TABS: { id: GuardianSubTab; label: string; icon: React.ElementType }[] = [
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'network', label: 'Network', icon: Cpu },
  { id: 'configuration', label: 'Configuration', icon: Settings },
];

/**
 * MIMO Edge Guardian — kiosk health, network and configuration, grouped under one nav entry.
 */
export const GuardianPage: React.FC = () => {
  const [subTab, setSubTab] = useState<GuardianSubTab>('health');
  const q = useLiveQuery(() => guardian.summary(), [], { live: subTab === 'health' });
  const webQ = useLiveQuery(() => guardian.websiteHealth(), [], { live: true });
  const [detailKioskId, setDetailKioskId] = useState<string | null>(null);
  const [showWebsiteModal, setShowWebsiteModal] = useState(false);
  const [outages, setOutages] = useState<KioskOutageStatus | null>(null);

  return (
    <div className="space-y-6 animate-fadeIn font-sans select-none">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="hidden lg:block text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-1)]">Edge Guardian</h1>
          <p className="text-xs sm:text-sm text-[var(--text-2)] mt-1">Kiosk health, network, outage alerts and configuration.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <KioskOutageStatusButton
            outages={outages}
            onClick={() => setSubTab('health')}
          />
          <CustomerWebsiteStatusButton
            health={webQ.data ?? null}
            loading={webQ.loading}
            onClick={() => setShowWebsiteModal(true)}
          />
          {subTab === 'health' && <LiveIndicator updatedAt={q.updatedAt} live fetching={q.fetching} onRefresh={q.refresh} />}
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-b border-[var(--border)]">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 -mb-px cursor-pointer transition-colors ${subTab === id
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

          {/* Outage and Maintenance Popups Control Panel */}
          <GuardianOutageControl onStatusChange={setOutages} />

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

      {showWebsiteModal && (
        <CustomerWebsiteDiagnosticModal
          health={webQ.data ?? null}
          onClose={() => setShowWebsiteModal(false)}
          onRefresh={webQ.refresh}
        />
      )}

      {subTab === 'network' && <KiosksPage />}
      {subTab === 'configuration' && <ConfigurationPage />}
    </div>
  );
};
