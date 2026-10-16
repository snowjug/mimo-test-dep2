import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CircleNotch, Printer } from '@phosphor-icons/react';
import { SacredMandala, TempleZariBorder, DiyaLamp } from './Mimo3Motifs';

interface Mimo3PrintingScreenProps {
  isActive: boolean;
  pages?: number;
  copies?: number;
  printCode?: string;
  colorMode?: 'color' | 'bw';
  kioskId?: string | null;
  statusTitle?: string;
  statusSub?: string;
  onComplete: () => void;
  onError?: (errorMsg?: string) => void;
}

const BACKEND_URL = 'https://api-upqxuj7evq-uc.a.run.app';
const isDemoCode = (c?: string) => c === '0000' || c === '9999';

export const Mimo3PrintingScreen: React.FC<Mimo3PrintingScreenProps> = ({
  isActive,
  pages = 1,
  copies = 1,
  printCode,
  colorMode = 'bw',
  kioskId = 'SV-003',
  statusTitle,
  onComplete,
  onError,
}) => {
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Initiating secure print spooler…');
  const [, setStage] = useState<'warmup' | 'spooling' | 'printing' | 'completed'>('warmup');

  const pollTimerRef = useRef<number | null>(null);
  const isCompletingRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Safe print timeout (10 minutes)
  const timeoutMs = 600000;

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const finishJob = useCallback(() => {
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;
    clearTimers();
    setProgress(100);
    setStage('completed');
    setStatusMsg('Document verified and printed successfully! ✅');
    setTimeout(() => {
      onComplete();
    }, 600);
  }, [clearTimers, onComplete]);

  // Demo Simulation runner (for 0000 and 9999)
  useEffect(() => {
    if (!isActive || !isDemoCode(printCode)) return;

    let current = 0;
    setStatusMsg('Simulating hardware print execution (Demo Mode)…');
    setStage('spooling');

    const interval = setInterval(() => {
      current += 5;
      if (current >= 100) {
        clearInterval(interval);
        finishJob();
      } else {
        setProgress(current);
        if (current > 30 && current < 70) {
          setStage('printing');
          setStatusMsg(`Printing sheet 1 of ${pages * copies}…`);
        } else if (current >= 70) {
          setStatusMsg('Completing final page ejection…');
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [isActive, printCode, pages, copies, finishJob]);

  // Real backend polling (with safe 1200ms adaptive interval instead of 200ms)
  useEffect(() => {
    if (!isActive || isDemoCode(printCode) || !printCode) return;

    isCompletingRef.current = false;
    startTimeRef.current = Date.now();
    setProgress(10);
    setStatusMsg('Warming up printer & rasterizing document…');
    setStage('warmup');

    const pollStatus = async () => {
      if (Date.now() - startTimeRef.current >= timeoutMs) {
        clearTimers();
        if (onError) onError('Print timed out. Your job was not completed. Please contact support.');
        return;
      }

      try {
        const res = await fetch(
          `${BACKEND_URL}/kiosk/job-status?printCode=${encodeURIComponent(printCode)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error('Status poll failed');
        const data = await res.json();

        if (data.status === 'completed' || data.isPrinted === true) {
          finishJob();
          return;
        }

        if (data.status === 'failed') {
          clearTimers();
          if (onError) onError(data.printerStatus || 'Printer reported a hardware error during execution.');
          return;
        }

        if (data.status === 'printing') {
          setStage('printing');
          const completed = data.sheetsCompleted || 1;
          const total = data.totalSheets || (pages * copies) || 1;
          setStatusMsg(data.printerStatus || `Printing in progress (${completed}/${total} sheets)…`);
          const ratio = Math.min(85, Math.max(15, Math.round((completed / total) * 80) + 10));
          setProgress(ratio);
        } else if (data.status === 'paid') {
          setStage('spooling');
          setStatusMsg('Spooling job to printer…');
          setProgress(15);
        }

        pollTimerRef.current = window.setTimeout(pollStatus, 1200);
      } catch {
        pollTimerRef.current = window.setTimeout(pollStatus, 2000);
      }
    };

    pollTimerRef.current = window.setTimeout(pollStatus, 1000);

    return () => {
      clearTimers();
    };
  }, [isActive, printCode, pages, copies, clearTimers, finishJob, onError]);

  if (!isActive) return null;

  return (
    <div
      className="relative flex h-full w-full select-none flex-col justify-between overflow-hidden bg-gradient-to-br from-[#FAFAF9] via-[#F8FAFC] to-[#F1F5F9] text-[#0F172A]"
    >
      {/* Top Zari border */}
      <TempleZariBorder className="opacity-90" />

      {/* Background Sacred Geometric Mandala Watermark */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <SacredMandala size={800} opacity={0.05} />
      </div>

      {/* Header bar */}
      <header className="relative z-10 flex w-full items-center justify-between px-14 pt-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF7] to-[#FEF3C7] shadow-sm">
            <Printer size={26} weight="bold" className="text-[#EA580C]" />
          </div>
          <div>
            <div className="text-[20px] font-black tracking-wide text-[#0F172A]">
              MIMO 3.0 Spooler Engine
            </div>
            <div className="text-[12px] font-bold tracking-widest text-[#64748B] uppercase">
              Station {kioskId || 'SV-003'} • Active Hardware Job
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-5 py-2 shadow-sm">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-[#EA580C]" />
          <span className="text-[14px] font-bold tracking-wide text-[#EA580C]">
            {progress}% Completed
          </span>
        </div>
      </header>

      {/* Center Layout: Status Card */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-20">
        <div className="relative flex w-full max-w-[820px] flex-col items-center rounded-[36px] border border-[#E2E8F0] bg-white p-10 shadow-[0_20px_50px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          {/* Diyas at top corners */}
          <div className="pointer-events-none absolute -top-5 left-10">
            <DiyaLamp size={28} />
          </div>
          <div className="pointer-events-none absolute -top-5 right-10">
            <DiyaLamp size={28} />
          </div>

          <div className="flex items-center gap-3">
            <h2 className="text-[44px] font-black tracking-tight text-[#0F172A]">
              {statusTitle || 'Printing in Progress'}
            </h2>
            <CircleNotch size={36} className="animate-spin text-[#EA580C]" />
          </div>

          <p className="mt-2 text-[17px] font-medium text-[#475569]">
            Please wait while the kiosk communicates with the thermal laser engine.
          </p>

          {/* Job Metadata Pill Strip */}
          <div className="mt-8 grid w-full grid-cols-3 gap-4">
            <div className="flex flex-col items-center rounded-2xl border border-[#E2E8F0] bg-[#FAFAF9] p-4 shadow-sm">
              <span className="text-[12px] font-bold tracking-wider text-[#64748B] uppercase">Quantity</span>
              <span className="mt-1 text-[22px] font-black text-[#0F172A]">
                {pages} {pages === 1 ? 'Page' : 'Pages'} × {copies} {copies === 1 ? 'Copy' : 'Copies'}
              </span>
            </div>

            <div className="flex flex-col items-center rounded-2xl border border-[#E2E8F0] bg-[#FAFAF9] p-4 shadow-sm">
              <span className="text-[12px] font-bold tracking-wider text-[#64748B] uppercase">Print Mode</span>
              <span
                className={`mt-1 text-[22px] font-black ${
                  colorMode === 'color' ? 'text-purple-600' : 'text-[#334155]'
                }`}
              >
                {colorMode === 'color' ? 'Colour Print' : 'Standard B&W'}
              </span>
            </div>

            <div className="flex flex-col items-center rounded-2xl border border-[#E2E8F0] bg-[#FAFAF9] p-4 shadow-sm">
              <span className="text-[12px] font-bold tracking-wider text-[#64748B] uppercase">Print Code</span>
              <span className="mt-1 text-[22px] font-black text-[#EA580C]">
                {printCode || '----'}
              </span>
            </div>
          </div>

          {/* Large High-Contrast Progress Bar */}
          <div className="mt-8 w-full">
            <div className="flex justify-between text-[14px] font-bold text-[#64748B]">
              <span>Hardware Spooling</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2.5 h-6 w-full overflow-hidden rounded-full border border-[#E2E8F0] bg-[#F1F5F9] p-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#FB923C] shadow-sm transition-all duration-300"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>

          {/* Current Status Feedback */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#FDE68A] bg-[#FFFDF7] px-6 py-3 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-[#EA580C] animate-pulse" />
            <span className="text-[16px] font-semibold text-[#B45309]">
              {statusMsg}
            </span>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="relative z-10 flex w-full items-center justify-between px-14 pb-6 pt-2 text-[13px] font-semibold text-[#64748B]">
        <div>
          Hardware safety: Do not pull paper while feeding. It will eject automatically.
        </div>
        <div>MIMO 3.0 Self-Healing Engine Active</div>
      </footer>
    </div>
  );
};
