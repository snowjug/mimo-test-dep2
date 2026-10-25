import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';
import { guardian } from '../../../services/guardian.service';
import { errorMessage } from '../../../hooks/useLiveQuery';
import type { GuardianCheck, GuardianKioskDetail as GuardianKioskDetailData, GuardianPlane } from '../../../types/guardian.types';
import { GuardianFreshnessBadge, GuardianOverallBadge, GuardianCheckStateBadge, GuardianSeverityBadge } from './GuardianStatusBadge';
import { LoadingSkeleton } from '../../../components/ui/shared';
import { ErrorBanner } from '../../../components/insights/InsightBits';
import { dateTime, clockTime } from '../../../lib/format';
import { rootCauseSentence } from '../guardianRootCauseText';

interface Props {
  kioskId: string;
  onClose: () => void;
}

const PLANE_LABEL: Record<GuardianPlane, string> = {
  connectivity: 'Connectivity',
  services: 'Services',
  management: 'Management',
  resources: 'Resources',
};
const PLANE_ORDER: GuardianPlane[] = ['connectivity', 'services', 'management', 'resources'];

// Display-only formatting of a check id (e.g. "endpoint.dns" -> "Endpoint.DNS") -- never changes the
// underlying id itself (still used for the React key and anywhere else exactness matters).
const CHECK_ID_ACRONYMS: Record<string, string> = { dns: 'DNS', ipv4: 'IPv4', tls: 'TLS', cups: 'CUPS' };
const titleCaseWord = (word: string): string => {
  const lower = word.toLowerCase();
  return CHECK_ID_ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
};
const checkDisplayName = (id: string): string =>
  id.split('.').map((segment) => segment.split('_').map(titleCaseWord).join(' ')).join('.');

const CheckRow: React.FC<{ check: GuardianCheck }> = ({ check }) => (
  <div className="p-3 rounded-xl border border-[var(--border)]">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <span className="font-mono text-base font-bold text-[var(--text-1)]">{checkDisplayName(check.id)}</span>
      <div className="flex items-center gap-1.5">
        {check.required && <span className="text-sm font-semibold text-[var(--text-3)]">required</span>}
        <GuardianCheckStateBadge state={check.state} />
      </div>
    </div>
    <div className="mt-1.5 flex items-center gap-3 text-sm text-[var(--text-3)]">
      <span>Observed {clockTime(check.observedAt)}</span>
      {check.durationMs !== null && <span>· {check.durationMs}ms</span>}
      <span>· streak {check.streak}</span>
    </div>
    {check.evidence.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-1">
        {check.evidence.map((code) => (
          <span key={code} className="px-1.5 py-0.5 rounded-md text-xs font-mono bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">{code}</span>
        ))}
      </div>
    )}
    {/* Untrusted plain text, rendered as text only -- never dangerouslySetInnerHTML. */}
    {check.detail && <p className="mt-2 text-sm text-[var(--text-2)] whitespace-pre-wrap break-words">{check.detail}</p>}
  </div>
);

export const GuardianKioskDetailModal: React.FC<Props> = ({ kioskId, onClose }) => {
  const [data, setData] = useState<GuardianKioskDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = () => {
    const mine = ++seq.current;
    setLoading(true);
    guardian
      .kioskDetail(kioskId)
      .then((result) => {
        if (mine !== seq.current) return; // a newer request (or unmount-guard) already won
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (mine !== seq.current) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  };

  useEffect(() => {
    load();
    return () => { seq.current += 1; }; // invalidate any in-flight request once this modal unmounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kioskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const checksByPlane = new Map<GuardianPlane, GuardianCheck[]>();
  for (const plane of PLANE_ORDER) checksByPlane.set(plane, []);
  for (const check of data?.snapshot?.checks ?? []) {
    (checksByPlane.get(check.plane) ?? checksByPlane.set(check.plane, []).get(check.plane)!).push(check);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn" role="dialog" aria-modal="true" aria-label={`Guardian details for kiosk ${kioskId}`}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-5 py-4 flex items-center justify-between gap-3 z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-[var(--text-1)] font-mono truncate">{kioskId}</h3>
            <p className="text-sm text-[var(--text-3)]">Edge Guardian · read-only diagnostics</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={load} disabled={loading} aria-label="Refresh kiosk details"
              className="p-2 rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer disabled:opacity-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={onClose} aria-label="Close kiosk details"
              className="p-2 rounded-lg text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {loading && !data && (
            <div className="flex items-center justify-center py-10 text-[var(--text-3)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {error && <ErrorBanner message={error} onRetry={load} />}

          {!loading && !error && data && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><p className="text-xs font-bold text-[var(--text-3)]">Freshness</p><div className="mt-1"><GuardianFreshnessBadge freshness={data.freshness} /></div></div>
                <div><p className="text-xs font-bold text-[var(--text-3)]">Diagnosis</p><div className="mt-1"><GuardianOverallBadge overall={data.overall} /></div></div>
                <div><p className="text-xs font-bold text-[var(--text-3)]">Last accepted seq</p><p className="text-base font-semibold text-[var(--text-1)] tabular-nums">{data.lastAcceptedSeq ?? '—'}</p></div>
                <div><p className="text-xs font-bold text-[var(--text-3)]">Server received</p><p className="text-sm text-[var(--text-2)]">{dateTime(data.serverReceivedAt)}</p></div>
                <div><p className="text-xs font-bold text-[var(--text-3)]">Stream ID</p><p className="text-sm font-mono text-[var(--text-2)] truncate" title={data.streamId ?? undefined}>{data.streamId ?? '—'}</p></div>
                <div><p className="text-xs font-bold text-[var(--text-3)]">Boot ID</p><p className="text-sm font-mono text-[var(--text-2)] truncate" title={data.bootId ?? undefined}>{data.bootId ?? '—'}</p></div>
              </div>

              {!data.snapshot ? (
                <div className="py-6 text-center text-sm text-[var(--text-3)]">
                  No Guardian snapshot is available for this kiosk yet.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
                    <div><p className="text-xs font-bold text-[var(--text-3)]">Agent version</p><p className="text-sm font-mono text-[var(--text-2)]">{data.snapshot.agentVersion}</p></div>
                    <div><p className="text-xs font-bold text-[var(--text-3)]">Snapshot captured</p><p className="text-sm text-[var(--text-2)]">{dateTime(data.snapshot.observedAt)}</p></div>
                  </div>

                  {data.snapshot.diagnosis.rootCauses.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-[var(--text-2)] mb-2">Root causes</h4>
                      <div className="space-y-2">
                        {data.snapshot.diagnosis.rootCauses.map((rc) => (
                          <div key={rc.code} className="p-3 rounded-xl border border-[var(--border)]">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-mono text-base font-bold text-[var(--text-1)]">{rc.code}</span>
                              <GuardianSeverityBadge severity={rc.severity} />
                            </div>
                            {/* Phase 2.4: plain-English translation of the code above -- the code/plane/checks/
                                evidence below remain exactly as the backend sent them, for anyone who wants
                                the raw detail. */}
                            <p className="text-sm text-[var(--text-1)] mt-1.5">{rootCauseSentence(rc.code)}</p>
                            <p className="text-xs text-[var(--text-3)] mt-1">Plane: {PLANE_LABEL[rc.plane]} · Checks: {rc.checks.join(', ')}</p>
                            {rc.evidence.length > 0 && <p className="text-xs font-mono text-[var(--text-3)] mt-0.5">{rc.evidence.join(', ')}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {data.snapshot.diagnosis.cascades.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-[var(--text-2)] mb-2">Cascading diagnoses</h4>
                      <ul className="text-sm text-[var(--text-2)] space-y-1">
                        {data.snapshot.diagnosis.cascades.map((c) => (
                          <li key={c.check}><span className="font-mono">{c.check}</span> — blocked by <span className="font-mono">{c.blockedBy}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-[var(--text-2)]">Checks</h4>
                    {PLANE_ORDER.map((plane) => {
                      const checks = checksByPlane.get(plane) ?? [];
                      if (checks.length === 0) return null;
                      return (
                        <div key={plane}>
                          <p className="text-xs font-bold text-[var(--text-3)] uppercase tracking-wide mb-1.5">{PLANE_LABEL[plane]}</p>
                          <div className="space-y-2">
                            {checks.map((c) => <CheckRow key={c.id} check={c} />)}
                          </div>
                        </div>
                      );
                    })}
                    {data.snapshot.checks.length === 0 && (
                      <p className="text-sm text-[var(--text-3)]">No checks were included in this snapshot.</p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {!loading && !error && !data && (
            <LoadingSkeleton rows={4} />
          )}
        </div>
      </div>
    </div>
  );
};
