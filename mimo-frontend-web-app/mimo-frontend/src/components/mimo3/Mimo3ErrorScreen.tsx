import React, { useEffect, useState } from 'react';
import { WarningOctagon, Clock, ArrowClockwise, House, HandHeart } from '@phosphor-icons/react';
import { SacredMandala, TempleZariBorder } from './Mimo3Motifs';

interface Mimo3ErrorScreenProps {
  isActive: boolean;
  onReset: () => void;
  onRetry: () => void;
  errorMsg?: string;
  showRefundBanner?: boolean;
  jobData: {
    userName: string;
    fileName: string;
  } | null;
  kioskId?: string | null;
}

const AUTO_RESET_SECONDS = 15;

export const Mimo3ErrorScreen: React.FC<Mimo3ErrorScreenProps> = ({
  isActive,
  onReset,
  onRetry,
  errorMsg,
  showRefundBanner = false,
  jobData,
  kioskId = 'SV-003',
}) => {
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);
  const firstName = jobData?.userName?.split(' ')[0] || 'Customer';

  useEffect(() => {
    if (!isActive) {
      setCountdown(AUTO_RESET_SECONDS);
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-200 bg-red-50 shadow-sm">
            <WarningOctagon size={28} weight="bold" className="text-red-500" />
          </div>
          <div>
            <div className="text-[20px] font-black tracking-wide text-[#0F172A]">Print Notification</div>
            <div className="text-[12px] font-bold tracking-widest text-red-500 uppercase">
              Station {kioskId || 'SV-003'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-5 py-2 text-[14px] font-semibold text-[#64748B] shadow-sm">
          <Clock size={16} />
          <span>Returning home in <strong className="text-[#EA580C]">{countdown}s</strong></span>
        </div>
      </header>

      {/* Center Card */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-20">
        <div className="relative flex w-full max-w-[800px] flex-col items-start rounded-[36px] border border-red-200 bg-white p-10 shadow-[0_24px_64px_rgba(239,68,68,0.06)] backdrop-blur-xl">
          <div className="flex items-baseline gap-2">
            <span className="text-[26px] font-black tracking-wide text-[#64748B] uppercase">
              Hello
            </span>
            <span className="text-[26px] font-black tracking-wide text-[#0F172A] underline decoration-[#F59E0B]/60 underline-offset-8">
              {firstName},
            </span>
          </div>

          <div className="mt-5 w-full rounded-[22px] border border-red-100 bg-[#FEF2F2] p-6 shadow-inner">
            <p className="text-[19px] font-bold leading-relaxed text-[#991B1B]">
              {errorMsg || 'We were unable to complete your print job at this time.'}
            </p>
          </div>

          {/* Guarded Automatic Refund Reassurance */}
          {showRefundBanner && (
            <div className="mt-5 flex w-full items-start gap-4 rounded-[22px] border border-emerald-200 bg-[#ECFDF5] p-5 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <HandHeart size={24} weight="bold" />
              </div>
              <div>
                <h4 className="text-[17px] font-black text-emerald-900">
                  Automatic Refund Guaranteed
                </h4>
                <p className="mt-1 text-[14px] font-semibold leading-relaxed text-emerald-800">
                  Because the physical printer could not produce your pages, your payment will be refunded to your original payment source within 2-4 hours. You do not need to do anything.
                </p>
              </div>
            </div>
          )}

          {/* Action Button Row */}
          <div className="mt-8 flex w-full gap-4">
            <button
              onClick={onRetry}
              id="error-retry-btn"
              className="flex h-[76px] flex-1 items-center justify-center gap-3 rounded-[24px] border-2 border-[#F59E0B] bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#FB923C] text-white shadow-[0_8px_24px_rgba(234,88,12,0.3)] transition-all active:scale-[0.98] cursor-pointer"
            >
              <ArrowClockwise size={26} weight="bold" />
              <span className="text-[19px] font-black tracking-wide">
                RE-ENTER CODE
              </span>
            </button>

            <button
              onClick={onReset}
              id="error-home-btn"
              className="flex h-[76px] flex-1 items-center justify-center gap-3 rounded-[24px] border border-[#E2E8F0] bg-[#FAFAF9] text-[#0F172A] shadow-sm transition-all hover:bg-white active:scale-[0.98] cursor-pointer"
            >
              <House size={26} weight="bold" />
              <span className="text-[19px] font-black tracking-wide">
                RETURN TO HOME
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="relative z-10 flex w-full items-center justify-between px-14 pb-6 pt-2 text-[13px] font-semibold text-[#64748B]">
        <div>
          MIMO Customer Care Desk: 1800-MIMO-HELP (Toll-Free, 24/7)
        </div>
        <div>MIMO 3.0 Instant Failure Protection Active</div>
      </footer>
    </div>
  );
};
