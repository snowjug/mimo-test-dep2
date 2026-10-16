import React from 'react';
import realisticHanuman from '../../assets/hanuman-realistic.png';
import { ArrowRight, Printer, Sparkle } from '@phosphor-icons/react';
import { SacredMandala, TempleZariBorder, DiyaLamp } from './Mimo3Motifs';

interface Mimo3MainScreenProps {
  isActive: boolean;
  onNext: () => void;
  kioskId?: string | null;
  onOmTap?: () => void;
}

export const Mimo3MainScreen: React.FC<Mimo3MainScreenProps> = ({ isActive, onNext, kioskId = 'SV-003', onOmTap }) => {
  if (!isActive) return null;

  return (
    <div
      className="relative flex h-full w-full select-none flex-col justify-between overflow-hidden bg-gradient-to-br from-[#FAFAF9] via-[#F8FAFC] to-[#F1F5F9] text-[#0F172A]"
    >
      {/* Top Zari border */}
      <TempleZariBorder className="opacity-90" />

      {/* Background Sacred Geometric Mandala Watermark */}
      <div className="pointer-events-none absolute -left-20 top-1/2 -translate-y-1/2">
        <SacredMandala size={900} opacity={0.06} />
      </div>

      {/* Header Bar */}
      <header className="relative z-10 flex w-full items-center justify-between px-14 pt-8">
        <div className="flex items-center gap-3.5">
          <div
            onClick={onOmTap}
            role="button"
            tabIndex={0}
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF7] to-[#FEF3C7] shadow-[0_2px_12px_rgba(245,158,11,0.18)] active:scale-95 transition-transform"
          >
            <span className="text-[22px] font-bold text-[#EA580C]">ॐ</span>
          </div>
          <div>
            <div className="text-[22px] font-black tracking-wider text-[#0F172A]">
              MIMO <span className="bg-gradient-to-r from-[#EA580C] to-[#D97706] bg-clip-text text-transparent">3.0</span>
            </div>
            <div className="text-[12px] font-bold tracking-widest text-[#64748B] uppercase">
              Appliance {kioskId || 'SV-003'} • High-Speed Station
            </div>
          </div>
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-5 py-2 shadow-sm backdrop-blur-md">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]" />
          <span className="text-[14px] font-semibold tracking-wide text-[#334155]">
            Kiosk &amp; Spooler Online
          </span>
        </div>
      </header>

      {/* Main Content: Split Balanced Layout (Artwork on Left, Touch Controls on Right) */}
      <main className="relative z-10 flex flex-1 items-center justify-between px-16 py-4">
        {/* LEFT: Temple Framed Realistic Hanuman Ji Artwork (Completely Uncropped on Pristine Ivory Pedestal) */}
        <div className="relative flex flex-1 items-center justify-center">
          {/* Subtle warm halo behind artwork */}
          <div
            className="pointer-events-none absolute h-[520px] w-[520px] rounded-full blur-[80px]"
            style={{
              background: 'radial-gradient(circle, rgba(254,243,199,0.85) 0%, rgba(253,230,138,0.4) 45%, transparent 75%)',
            }}
          />

          {/* Authentic Temple Jharokha Framing Box in Pure White & Antique Gold */}
          <div className="relative rounded-[32px] border-2 border-[#E6C687] bg-white p-4 shadow-[0_20px_50px_rgba(217,119,6,0.14),0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md">
            {/* Top decorative arch accent */}
            <div className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border border-[#FDE68A] bg-[#FFFDF7] px-4 py-1 text-[11px] font-bold tracking-widest text-[#D97706] uppercase shadow-sm">
              ॥ संकटमोचन ॥
            </div>

            {/* The exact supplied realistic meditative Hanuman Ji image */}
            <img
              src={realisticHanuman}
              alt="Bhagwan Hanuman Ji in Deep Meditation"
              className="h-[430px] w-auto max-w-[560px] rounded-[24px] object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
            />

            {/* Brass Diyas at base of frame */}
            <div className="pointer-events-none absolute -bottom-3 left-6">
              <DiyaLamp size={28} />
            </div>
            <div className="pointer-events-none absolute -bottom-3 right-6">
              <DiyaLamp size={28} />
            </div>
          </div>
        </div>

        {/* RIGHT: Clear, Reverent Touch Interface & Prominent Call to Action */}
        <div className="flex flex-1 flex-col items-start justify-center pl-10 pr-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FDE68A] bg-[#FFFDF7] px-4 py-1.5 shadow-sm">
            <Sparkle size={16} weight="fill" className="text-[#EA580C]" />
            <span className="font-serif text-[15px] font-semibold tracking-wider text-[#B45309]">
              ॥ ॐ नमो भगवते आञ्जनेयाय ॥
            </span>
          </div>

          <h1 className="mt-4 text-[52px] font-black leading-[1.08] tracking-tight text-[#0F172A]">
            Touch &amp; Print
            <br />
            <span className="bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#D97706] bg-clip-text text-transparent">
              In Seconds
            </span>
          </h1>

          <p className="mt-3.5 max-w-[460px] text-[18px] font-medium leading-relaxed text-[#475569]">
            Tap below, enter your 4-digit Mimo code from the mobile app or website, and pick up your documents instantly.
          </p>

          {/* PROMINENT, UNCLUTTERED TOUCH ACTION BUTTON */}
          <div className="mt-8 w-full max-w-[440px]">
            <button
              onClick={onNext}
              id="kiosk-start-btn"
              className="group relative flex h-[92px] w-full items-center justify-between rounded-[28px] border-2 border-[#F59E0B] bg-gradient-to-r from-[#EA580C] via-[#F97316] to-[#FB923C] px-8 text-white shadow-[0_12px_32px_rgba(234,88,12,0.32)] transition-all duration-150 active:scale-[0.96] active:shadow-[0_4px_16px_rgba(234,88,12,0.25)] cursor-pointer"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
                  <Printer size={32} weight="bold" className="text-white" />
                </div>
                <div className="text-left">
                  <div className="text-[24px] font-black tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
                    START PRINTING
                  </div>
                  <div className="text-[12px] font-bold tracking-widest text-[#FFFDF7] uppercase">
                    Tap to Enter Code
                  </div>
                </div>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#EA580C] shadow-md transition-transform group-active:translate-x-1">
                <ArrowRight size={24} weight="bold" />
              </div>
            </button>
          </div>

          {/* Quick Help / Assurance Info Strip in Crisp White Card */}
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-3 shadow-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FEF3C7] text-[13px] font-bold text-[#D97706]">
              ✦
            </span>
            <div className="text-[13px] font-semibold text-[#64748B]">
              Standard B&amp;W and Ultra-HD Colour supported • Automatic tray ejection
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="relative z-10 flex w-full items-center justify-between px-14 pb-6 pt-2 text-[13px] font-semibold text-[#64748B]">
        <div>
          MIMO Print Technologies Pvt. Ltd. • ISO 9001:2015 Compliant
        </div>
        <div className="flex items-center gap-6">
          <span>Toll-Free Helpline: 1800-MIMO-HELP</span>
          <span>•</span>
          <span>Security Guaranteed</span>
        </div>
      </footer>
    </div>
  );
};
