import React from 'react';
import { Printer, ArrowRight } from 'lucide-react';

interface Mimo3MainScreenProps {
  isActive: boolean;
  onNext: () => void;
  kioskId?: string | null;
  onOmTap?: () => void;
  onOpenScreensaver?: () => void;
  isOnline?: boolean;
}

export const Mimo3MainScreen: React.FC<Mimo3MainScreenProps> = ({
  isActive,
  onNext,
  kioskId = 'SV-003',
  onOmTap,
  onOpenScreensaver,
  isOnline = true,
}) => {
  if (!isActive) return null;

  const displayKioskId = kioskId || 'SV-003';
  const isMonochromeOnly = displayKioskId === 'CV-001';
  const capabilities = isMonochromeOnly
    ? 'B&W printing'
    : 'B&W printing · Colour printing';

  return (
    <div className="relative flex h-full w-full select-none flex-col justify-between overflow-hidden bg-[#FAFAFA] font-sans text-neutral-900">
      {/* =========================================================================
          HEADER: QUIET, RESTRAINED, PROFESSIONAL
          ========================================================================= */}
      <header className="flex h-16 w-full items-center justify-between border-b border-neutral-200/80 bg-white px-8 md:px-12">
        {/* Left: Branding & Appliance ID */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOmTap}
            title="MIMO Kiosk System"
            className="flex items-center gap-2 text-left transition-opacity hover:opacity-80 active:opacity-60 cursor-pointer"
          >
            <span className="text-[17px] font-bold tracking-tight text-neutral-900">
              MIMO <span className="font-medium text-neutral-400">3.0</span>
            </span>
          </button>

          <span className="text-neutral-300">/</span>

          <span className="text-[14px] font-medium text-neutral-500">
            {displayKioskId}
          </span>
        </div>

        {/* Right: Truthful System Status & Screensaver Action */}
        <div className="flex items-center gap-4">
          {/* Truthful Connection Status */}
          <div className="flex items-center gap-2 text-[13px] font-medium text-neutral-600">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>{isOnline ? 'Ready' : 'Offline'}</span>
          </div>

          {/* Secondary Screensaver Trigger */}
          {onOpenScreensaver && (
            <>
              <span className="h-4 w-px bg-neutral-200" />
              <button
                onClick={onOpenScreensaver}
                id="header-screensaver-btn"
                className="text-[13px] font-medium text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer"
              >
                Screensaver
              </button>
            </>
          )}
        </div>
      </header>

      {/* =========================================================================
          MAIN WELCOME AREA: CENTERED, BALANCED, QUIET CONFIDENCE
          ========================================================================= */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="flex w-full max-w-[480px] flex-col items-center text-center">
          {/* Subtle Appliance Icon Badge */}
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-200/80 bg-white shadow-xs">
            <Printer className="h-6 w-6 text-neutral-700" strokeWidth={1.75} />
          </div>

          {/* Eyebrow */}
          <div className="mb-3 text-[12px] font-semibold tracking-widest text-neutral-500 uppercase">
            Welcome to MIMO
          </div>

          {/* Primary Heading */}
          <h1 className="text-[36px] font-bold tracking-tight text-neutral-900 sm:text-[40px]">
            Print your documents.
          </h1>

          {/* Concise Single Instruction */}
          <p className="mt-3 text-[16px] text-neutral-600 leading-relaxed max-w-[380px]">
            Enter your four-digit print code to collect your documents.
          </p>

          {/* Exceptional Primary CTA Button */}
          <div className="mt-8 w-full max-w-[320px]">
            <button
              onClick={onNext}
              id="kiosk-start-btn"
              className="group flex h-[58px] w-full items-center justify-center gap-3 rounded-xl bg-[#EA580C] px-6 text-white shadow-xs transition-all duration-150 hover:bg-[#D97706] active:scale-[0.98] active:bg-[#C2410C] cursor-pointer"
            >
              <Printer className="h-5 w-5 text-white/90" strokeWidth={2} />
              <span className="text-[16px] font-semibold tracking-wide">
                Start Printing
              </span>
              <ArrowRight
                className="h-5 w-5 text-white/80 transition-transform duration-150 group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </button>
          </div>

          {/* Real Supported Capabilities */}
          <div className="mt-5 text-[13px] font-medium text-neutral-500">
            {capabilities}
          </div>
        </div>
      </main>

      {/* =========================================================================
          FOOTER: ACCURATE, UNCLUTTERED, ESSENTIAL INFORMATION
          ========================================================================= */}
      <footer className="flex h-14 w-full items-center justify-between border-t border-neutral-200/80 bg-white px-8 md:px-12 text-[12px] text-neutral-400">
        <div>MIMO Print Technologies</div>

        <div>Appliance {displayKioskId} · Touch screen to begin</div>
      </footer>
    </div>
  );
};
