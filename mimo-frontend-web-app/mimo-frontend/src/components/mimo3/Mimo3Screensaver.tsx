import React, { useState, useEffect } from 'react';
import lineArtHanuman from '../../assets/hanuman-lineart.png';
import { SacredMandala, TempleZariBorder } from './Mimo3Motifs';

interface Mimo3ScreensaverProps {
  isActive: boolean;
  onTap: () => void;
  kioskId?: string | null;
}

export const Mimo3Screensaver: React.FC<Mimo3ScreensaverProps> = ({ isActive, onTap, kioskId = 'SV-003' }) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }).toUpperCase()
      );
      setDateStr(
        now.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isActive) return null;

  return (
    <div
      onClick={onTap}
      role="button"
      tabIndex={0}
      aria-label="Kiosk Idle Screensaver. Touch anywhere to start."
      className="fixed inset-0 z-[999] flex h-full w-full select-none flex-col items-center justify-between overflow-hidden bg-gradient-to-br from-[#FFFFFF] via-[#F8FAFC] to-[#F1F5F9] text-[#0F172A] transition-opacity duration-700 cursor-pointer"
    >
      {/* Top Zari border */}
      <TempleZariBorder className="opacity-90" />

      {/* Background Sacred Geometric Mandala Watermark */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <SacredMandala size={820} opacity={0.06} className="animate-[spin_180s_linear_infinite]" />
      </div>

      {/* Header bar */}
      <header className="relative z-10 flex w-full items-center justify-between px-14 pt-8">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FDE68A] bg-gradient-to-br from-[#FFFDF7] to-[#FEF3C7] shadow-[0_2px_10px_rgba(245,158,11,0.18)]">
            <span className="text-[18px] font-bold text-[#EA580C]">ॐ</span>
          </div>
          <div>
            <div className="text-[20px] font-extrabold tracking-wider text-[#0F172A]">
              MIMO <span className="text-[#D97706]">3.0</span>
            </div>
            <div className="text-[11px] font-semibold tracking-widest text-[#64748B] uppercase">
              Appliance {kioskId || 'SV-003'}
            </div>
          </div>
        </div>

        {/* Live Clock in High-Contrast Typography */}
        <div className="text-right">
          <div className="text-[28px] font-black tracking-tight text-[#0F172A]">
            {timeStr}
          </div>
          <div className="text-[13px] font-semibold text-[#64748B]">{dateStr}</div>
        </div>
      </header>

      {/* Center Artwork Hero: Golden Line-Art Hanuman Ji Shrine */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center py-2">
        {/* Sacred Devanagari Salutation */}
        <div className="mb-3 text-center">
          <p className="font-serif text-[28px] font-bold tracking-widest text-[#EA580C]">
            ॥ श्री हनुमते नमः ॥
          </p>
          <p className="mt-0.5 text-[12px] font-bold tracking-[0.25em] text-[#B45309] uppercase">
            Strength • Devotion • Reliability
          </p>
        </div>

        {/* Hanuman Ji Line-Art Shrine Box */}
        <div className="relative flex items-center justify-center">
          {/* Subtle warm halo */}
          <div
            className="pointer-events-none absolute h-[460px] w-[340px] rounded-full blur-[60px]"
            style={{
              background: 'radial-gradient(circle, rgba(254,243,199,0.9) 0%, rgba(253,230,138,0.4) 45%, transparent 75%)',
            }}
          />

          <div className="relative rounded-[28px] border-2 border-[#E6C687] bg-[#0A0704] p-3 shadow-[0_16px_40px_rgba(217,119,6,0.18)]">
            <img
              src={lineArtHanuman}
              alt="Bhagwan Hanuman Ji Golden Line-Art"
              className="h-[400px] w-auto max-w-[320px] rounded-[20px] object-contain drop-shadow-[0_0_25px_rgba(245,158,11,0.6)]"
            />
          </div>
        </div>

        {/* Pulsing Touch to Wake Prompt in Clean White Floating Pill */}
        <div className="mt-4 flex items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-7 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.06)] backdrop-blur-md">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#EA580C] opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#EA580C]" />
          </span>
          <span className="text-[16px] font-bold tracking-wider text-[#0F172A] uppercase">
            Touch Screen To Start
          </span>
        </div>
      </main>

      {/* Footer bar */}
      <footer className="relative z-10 flex w-full items-center justify-between px-14 pb-6 pt-2 text-[12px] font-semibold text-[#64748B]">
        <div>MIMO Smart Printing Kiosk • Ready for Service</div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Self-Service Station • Tap Anywhere</span>
        </div>
      </footer>
    </div>
  );
};
