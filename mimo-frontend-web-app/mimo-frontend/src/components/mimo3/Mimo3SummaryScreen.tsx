import React, { useEffect, useState } from 'react';
import { Check, ArrowDown, House, WarningCircle } from '@phosphor-icons/react';
import { SacredMandala, TempleZariBorder } from './Mimo3Motifs';

interface Mimo3SummaryScreenProps {
  isActive: boolean;
  onReset: () => void;
  jobData: {
    userName: string;
    fileName: string;
    pages: number;
    copies: number;
    mode: string;
  } | null;
  kioskId?: string | null;
  printCode?: string;
}

const BACKEND_URL = 'https://api-upqxuj7evq-uc.a.run.app';
const DEMO_CODES = ['0000', '9999'];
const AUTO_RESET_SECONDS = 10;

export const Mimo3SummaryScreen: React.FC<Mimo3SummaryScreenProps> = ({
  isActive,
  onReset,
  jobData,
  kioskId = 'SV-003',
  printCode,
}) => {
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setCountdown(AUTO_RESET_SECONDS);
      setIsReporting(false);
      setReportSuccess(false);
      return;
    }

    setCountdown(AUTO_RESET_SECONDS);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    if (isActive && countdown === 0) {
      onReset();
    }
  }, [isActive, countdown, onReset]);

  const handleReport = async (issue: string) => {
    if (!printCode || DEMO_CODES.includes(printCode)) {
      setReportSuccess(true);
      return;
    }
    try {
      await fetch(`${BACKEND_URL}/kiosk/report-problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printCode, kioskId, issue }),
      });
      setReportSuccess(true);
    } catch {
      setReportSuccess(true); // Don't block user
    }
  };

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

      {/* Header */}
      <header className="relative z-10 flex w-full items-center justify-between px-14 pt-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 shadow-sm">
            <Check size={28} weight="bold" className="text-emerald-600" />
          </div>
          <div>
            <div className="text-[20px] font-black tracking-wide text-[#0F172A]">Print Completed</div>
            <div className="text-[12px] font-bold tracking-widest text-emerald-600 uppercase">
              Physical Output Ready
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-5 py-2 shadow-sm">
          <span className="text-[14px] font-semibold text-[#64748B]">Auto return in</span>
          <strong className="text-[16px] font-black text-[#EA580C]">{countdown}s</strong>
        </div>
      </header>

      {/* Center Layout: Clear instructions pointing to tray */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-20">
        <div className="relative flex w-full max-w-[820px] flex-col items-center rounded-[36px] border border-[#E2E8F0] bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          {/* Animated Bouncing Arrow to Tray Below */}
          <div className="flex flex-col items-center">
            <div className="flex h-20 w-20 animate-bounce items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-teal-600 text-white shadow-[0_12px_28px_rgba(16,185,129,0.35)]">
              <ArrowDown size={42} weight="bold" />
            </div>
            <h2 className="mt-4 text-[44px] font-black tracking-tight text-[#0F172A]">
              Collect Your Documents
            </h2>
            <p className="mt-1 text-[17px] font-medium text-[#475569]">
              Please take all printed sheets from the dispenser tray below the kiosk.
            </p>
          </div>

          {/* Job Receipt Summary Card */}
          <div className="mt-6 flex w-full items-center justify-between rounded-2xl border border-[#E2E8F0] bg-[#FAFAF9] px-6 py-4 shadow-sm">
            <div>
              <div className="text-[12px] font-bold tracking-wider text-[#64748B] uppercase">File Printed</div>
              <div className="mt-0.5 max-w-[400px] truncate text-[18px] font-black text-[#0F172A]">
                {jobData?.fileName || 'Official Printed Document'}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[12px] font-bold tracking-wider text-[#64748B] uppercase">Total Pages</div>
              <div className="mt-0.5 text-[18px] font-black text-emerald-600">
                {(jobData?.pages || 1) * (jobData?.copies || 1)} Sheets Completed
              </div>
            </div>
          </div>

          {/* Action Button Grid */}
          <div className="mt-8 flex w-full gap-4">
            <button
              onClick={onReset}
              id="summary-done-btn"
              className="flex h-[82px] flex-1 items-center justify-center gap-3 rounded-[24px] bg-[#0F172A] text-white shadow-md transition-all active:scale-[0.98] active:bg-[#1E293B] cursor-pointer"
            >
              <House size={28} weight="bold" />
              <span className="text-[20px] font-black tracking-wide">
                DONE / RETURN HOME
              </span>
            </button>

            <button
              onClick={() => setIsReporting(!isReporting)}
              className="flex h-[82px] items-center justify-center gap-2.5 rounded-[24px] border border-[#E2E8F0] bg-white px-6 text-[#64748B] shadow-sm transition-all hover:bg-[#FAFAF9] active:scale-95 cursor-pointer"
            >
              <WarningCircle size={24} />
              <span className="text-[15px] font-bold">Report Issue</span>
            </button>
          </div>

          {/* Issue Reporting Drawer */}
          {isReporting && (
            <div className="mt-6 w-full rounded-2xl border border-amber-200 bg-[#FFFDF7] p-5 shadow-inner">
              {reportSuccess ? (
                <div className="text-center font-bold text-emerald-600">
                  ✓ Issue reported to MIMO operations support. Thank you.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <span className="text-[14px] font-bold text-[#0F172A]">
                    What went wrong with your print?
                  </span>
                  <div className="flex gap-2">
                    {['Paper Jam', 'Poor Quality', 'Wrong Page Count', 'Did not print'].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleReport(opt)}
                        className="rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2 text-[13px] font-bold text-[#334155] hover:border-amber-300 hover:bg-[#FEF3C7]"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="relative z-10 flex w-full items-center justify-between px-14 pb-6 pt-2 text-[13px] font-semibold text-[#64748B]">
        <div>MIMO 3.0 High-Speed Service • Have a wonderful day!</div>
        <div>Customer Care: 1800-MIMO-HELP</div>
      </footer>
    </div>
  );
};
