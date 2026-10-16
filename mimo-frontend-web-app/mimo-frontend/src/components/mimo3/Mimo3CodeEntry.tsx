import React, { useState, useEffect } from 'react';
import { ArrowLeft, Backspace, Check, CircleNotch, ShieldCheck } from '@phosphor-icons/react';
import { SacredMandala, TempleZariBorder } from './Mimo3Motifs';

interface Mimo3CodeEntryProps {
  isActive: boolean;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  onSuccess: () => Promise<void>;
  onBack: () => void;
  hasError?: boolean;
  kioskId?: string | null;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const Mimo3CodeEntry: React.FC<Mimo3CodeEntryProps> = ({
  isActive,
  code,
  setCode,
  onSuccess,
  onBack,
  hasError,
  kioskId = 'SV-003',
}) => {
  const [isShaking, setIsShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasError) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(timer);
    }
  }, [hasError]);

  const handleNumClick = (val: string) => {
    if (loading) return;
    if (val === 'del') {
      setCode((prev) => prev.slice(0, -1));
    } else if (code.length < 4) {
      setCode((prev) => prev + val);
    }
  };

  const handleSubmit = async () => {
    if (code.length !== 4 || loading) return;
    try {
      setLoading(true);
      await onSuccess();
    } catch (err) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setTimeout(() => setCode(''), 600);
    } finally {
      setLoading(false);
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
      <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2">
        <SacredMandala size={800} opacity={0.05} />
      </div>

      {/* Header bar with Back Button */}
      <header className="relative z-10 flex w-full items-center justify-between px-14 pt-8">
        <button
          onClick={onBack}
          id="code-entry-back-btn"
          aria-label="Back to main screen"
          className="flex h-14 items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-6 text-[#0F172A] shadow-sm transition-transform active:scale-95 cursor-pointer"
        >
          <ArrowLeft size={22} weight="bold" className="text-[#EA580C]" />
          <span className="text-[16px] font-bold tracking-wide">Back</span>
        </button>

        <div className="flex items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-5 py-2 shadow-sm backdrop-blur-md">
          <ShieldCheck size={20} weight="fill" className="text-emerald-500" />
          <span className="text-[13px] font-bold tracking-wide text-[#334155]">
            Secure Verification Station {kioskId || 'SV-003'}
          </span>
        </div>
      </header>

      {/* Center Layout: Left (Code Instructions + PIN slots), Right (Tactile Keypad) */}
      <main className="relative z-10 flex flex-1 items-center justify-between px-20 py-4">
        {/* LEFT: Instructions & 4 PIN Display Slots */}
        <div className="flex flex-1 flex-col items-start pr-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FDE68A] bg-[#FFFDF7] px-4 py-1.5 shadow-sm">
            <span className="font-serif text-[15px] font-semibold tracking-wider text-[#B45309]">
              ॥ शुभ आरम्भ ॥
            </span>
          </div>

          <h2 className="mt-4 text-[50px] font-black leading-[1.1] text-[#0F172A]">
            Enter 4-Digit
            <br />
            <span className="bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#D97706] bg-clip-text text-transparent">
              Print Code
            </span>
          </h2>

          <p className="mt-3 max-w-[440px] text-[17px] font-medium leading-relaxed text-[#475569]">
            Type the 4-digit verification code sent to your phone or displayed on the MIMO website after payment.
          </p>

          {/* 4 Large Tactile PIN Slots */}
          <div
            className={`mt-8 flex gap-4 ${
              isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''
            }`}
          >
            {[0, 1, 2, 3].map((idx) => {
              const char = code[idx];
              const isCurrent = code.length === idx;
              return (
                <div
                  key={idx}
                  className={`flex h-[88px] w-[76px] items-center justify-center rounded-[22px] border-2 text-[44px] font-black transition-all duration-150 ${
                    char
                      ? 'border-[#F59E0B] bg-[#FFFDF7] text-[#0F172A] shadow-md ring-2 ring-[#F59E0B]/20'
                      : isCurrent
                      ? 'border-[#EA580C] bg-white shadow-sm ring-4 ring-[#EA580C]/15'
                      : 'border-[#E2E8F0] bg-white/80 text-transparent'
                  }`}
                >
                  {char || <span className="h-3 w-3 rounded-full bg-[#CBD5E1]" />}
                </div>
              );
            })}
          </div>

          {/* Real-time Validation Error Banner */}
          {hasError && (
            <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-[14px] font-bold text-red-600 shadow-sm animate-pulse">
              <span>✕ Invalid or expired print code. Please re-enter.</span>
            </div>
          )}

          {/* Helper hint */}
          <div className="mt-6 flex items-center gap-3 text-[14px] font-medium text-[#64748B]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FEF3C7] text-[11px] font-bold text-[#D97706]">
              i
            </span>
            <span>Test Codes: 0000 (B&amp;W demo) • 9999 (Colour demo)</span>
          </div>
        </div>

        {/* RIGHT: High-Speed Responsive Touch Keypad */}
        <div className="flex flex-1 items-center justify-center pl-8">
          <div className="w-full max-w-[420px] rounded-[36px] border border-[#E2E8F0] bg-white p-6 shadow-[0_16px_40px_rgba(0,0,0,0.06)]">
            <div className="grid grid-cols-3 gap-3.5">
              {KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => handleNumClick(k)}
                  id={`keypad-btn-${k}`}
                  className="flex h-[82px] items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FAFAF9] text-[34px] font-black text-[#0F172A] shadow-sm transition-all duration-100 hover:border-[#CBD5E1] hover:bg-white active:scale-95 active:bg-[#F1F5F9] cursor-pointer"
                >
                  {k}
                </button>
              ))}

              {/* Backspace / Delete Key */}
              <button
                onClick={() => handleNumClick('del')}
                id="keypad-btn-del"
                aria-label="Delete last digit"
                className="flex h-[82px] items-center justify-center rounded-[24px] border border-red-200 bg-red-50 text-red-600 shadow-sm transition-all duration-100 hover:bg-red-100 active:scale-95 cursor-pointer"
              >
                <Backspace size={34} weight="bold" />
              </button>

              {/* Digit 0 */}
              <button
                onClick={() => handleNumClick('0')}
                id="keypad-btn-0"
                className="flex h-[82px] items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FAFAF9] text-[34px] font-black text-[#0F172A] shadow-sm transition-all duration-100 hover:border-[#CBD5E1] hover:bg-white active:scale-95 active:bg-[#F1F5F9] cursor-pointer"
              >
                0
              </button>

              {/* Submit / Confirm Key */}
              <button
                onClick={handleSubmit}
                id="keypad-btn-submit"
                disabled={code.length !== 4 || loading}
                aria-label="Submit print code"
                className={`flex h-[82px] items-center justify-center rounded-[24px] text-[20px] font-black transition-all duration-100 cursor-pointer ${
                  code.length === 4 && !loading
                    ? 'border-2 border-[#F59E0B] bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#FB923C] text-white shadow-[0_8px_24px_rgba(234,88,12,0.35)] active:scale-95'
                    : 'border border-[#E2E8F0] bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed opacity-60'
                }`}
              >
                {loading ? (
                  <CircleNotch size={32} className="animate-spin text-white" />
                ) : (
                  <Check size={36} weight="bold" />
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="relative z-10 flex w-full items-center justify-between px-14 pb-6 pt-2 text-[13px] font-semibold text-[#64748B]">
        <div>
          MIMO Secure Automated Spooler • Real-time Hardware Encryption
        </div>
        <div>Having trouble? Call Helpline 1800-MIMO-HELP</div>
      </footer>
    </div>
  );
};
