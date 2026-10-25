import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Backspace, Check, CircleNotch } from '@phosphor-icons/react';
import { isFestivalActive } from '../../config/festivalConfig';
import { Diya, FestiveBackdrop, GoldenCornerWaves, Mandala, OrnamentDivider } from '../festive/NavaratriDecor';

interface CodeEntryScreenProps {
  onSuccess: () => void;
  onBack: () => void;
  isActive: boolean;
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  hasError?: boolean;
  kioskId?: string | null;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const CodeEntryScreen: React.FC<CodeEntryScreenProps> = ({
  onSuccess,
  onBack,
  isActive,
  code,
  setCode,
  hasError,
  kioskId,
}) => {
  const isFestiveMode = kioskId === 'CV-001' || kioskId === 'SV-002' || isFestivalActive();
  const [isShaking, setIsShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (hasError) {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 500);
      return () => clearTimeout(timer);
    }
  }, [hasError]);

  const handleNumClick = (val: string) => {
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
    } catch (err: any) {
      console.error(err);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setTimeout(() => setCode(''), 600);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) {
      const timer = setTimeout(() => setIsShaking(false), 0);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  if (isFestiveMode) {
    const ready = code.length === 4;

    return (
      <div
        className={`screen ${isActive ? 'visible' : ''} relative flex h-full select-none overflow-hidden bg-[#1A0A01]`}
        style={{ display: isActive ? 'flex' : 'none' }}
      >
        <FestiveBackdrop />

        {/* Ambient warm golden illumination in top-right */}
        <div 
          className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] rounded-full blur-[120px] opacity-35"
          style={{
            background: 'radial-gradient(circle, rgba(212,165,89,0.35) 0%, rgba(160,80,20,0.18) 40%, transparent 70%)'
          }}
        />

        {/* Subtle background mandala behind the cards */}
        <div className="pointer-events-none absolute left-[1000px] top-[410px] z-0 -translate-x-1/2 -translate-y-1/2 opacity-[0.14]">
          <Mandala size={680} />
        </div>

        {/* Golden flowing wave curves in bottom corners */}
        <GoldenCornerWaves />

        {/* Back button */}
        <button
          onClick={onBack}
          aria-label="Go back to home"
          className="absolute left-10 top-10 z-20 flex h-14 w-14 items-center justify-center rounded-full border border-[#D4A559]/40 bg-[#1D0C04]/80 text-[#FFF8EE] shadow-[0_4px_16px_rgba(0,0,0,0.4),0_0_12px_rgba(212,165,89,0.15)] backdrop-blur-sm transition-transform hover:border-[#E5B878] hover:shadow-[0_0_18px_rgba(229,184,120,0.35)] active:scale-95"
        >
          <ArrowLeft size={24} weight="bold" />
        </button>

        {/* Centered Cards Container */}
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-14">
          {/* LEFT: Refined dark espresso glass panel with circular code indicators */}
          <motion.div
            initial={isActive ? { opacity: 0, y: 16 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex h-[530px] w-[530px] flex-col items-center justify-center rounded-[28px] border border-[#D4A559]/35 bg-[#180802]/80 px-10 text-center shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_30px_rgba(212,165,89,0.12),inset_0_0_30px_rgba(212,165,89,0.04)] backdrop-blur-md"
          >
            <p lang="hi" className="font-deva text-[22px] font-medium leading-[1.3] text-[#DFCBB5]">
              अपना मिमो कोड दर्ज करें
            </p>
            <h2 className="mt-1.5 whitespace-nowrap font-serif text-[42px] font-semibold leading-[1.15] text-[#FFF8EE] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
              Enter your Mimo code
            </h2>
            <p className="mt-2 text-[16px] font-normal text-[#A68868]">
              Each digit lights a diya
            </p>

            <div className="mt-5">
              <OrnamentDivider width={60} />
            </div>

            {/* 4 Circular Code Indicators */}
            <motion.div
              animate={isShaking ? { x: [0, -14, 14, -10, 10, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.5 }}
              className="mt-9 flex items-center justify-center gap-5"
            >
              {[0, 1, 2, 3].map((i) => {
                const filled = i < code.length;
                const active = i === code.length && !isShaking;
                return (
                  <div
                    key={i}
                    className={`relative flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
                      isShaking
                        ? 'border-[#F35B5B]/80 bg-[#F35B5B]/15 shadow-[0_0_16px_rgba(243,91,91,0.4)]'
                        : filled
                        ? 'border-[#E5B878] bg-[#1E0B03]/90 shadow-[0_0_22px_rgba(229,184,120,0.45)]'
                        : active
                        ? 'border-[#E5B878] bg-[#1B0A03]/85 shadow-[0_0_24px_rgba(229,184,120,0.55),inset_0_0_10px_rgba(229,184,120,0.22)] ring-1 ring-[#E5B878]/60'
                        : 'border-[#D4A559]/35 bg-[#140601]/60'
                    }`}
                  >
                    {filled ? (
                      <Diya size={44} />
                    ) : active ? (
                      <span
                        className="h-8 w-[2.5px] rounded-full bg-[#E5B878] shadow-[0_0_8px_#E5B878]"
                        style={{ animation: 'navaratri-caret 1.1s ease-in-out infinite' }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </motion.div>
          </motion.div>

          {/* RIGHT: Perfectly circular numeric keypad on carved glass panel */}
          <div className="relative flex h-[530px] w-[410px] flex-col items-center justify-center rounded-[28px] border border-[#D4A559]/35 bg-[#180802]/80 p-7 shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_30px_rgba(212,165,89,0.12),inset_0_0_30px_rgba(212,165,89,0.04)] backdrop-blur-md">
            {/* 4 Corner Diamond Rivets */}
            {['left-3.5 top-3.5', 'right-3.5 top-3.5', 'left-3.5 bottom-3.5', 'right-3.5 bottom-3.5'].map((pos) => (
              <span
                key={pos}
                className={`absolute ${pos} h-2 w-2 rotate-45 bg-[#E5B878] shadow-[0_0_6px_rgba(229,184,120,0.8)]`}
              />
            ))}

            <div className="grid grid-cols-3 gap-5 place-items-center">
              {KEYS.map((num) => (
                <button
                  key={num}
                  id={`key-${num}`}
                  onClick={() => handleNumClick(num)}
                  className="relative flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full border border-[#D4A559]/35 bg-[#220E05]/75 font-serif text-[36px] font-semibold text-[#FFF8EE] shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 hover:border-[#E5B878] hover:bg-[#2F1407] hover:shadow-[0_0_18px_rgba(229,184,120,0.4)] active:scale-95 active:bg-[#3D1A0A] active:border-[#F3C97E] active:shadow-[0_0_22px_rgba(229,184,120,0.6)] focus:outline-none"
                >
                  {num}
                </button>
              ))}

              <button
                id="key-del"
                onClick={() => handleNumClick('del')}
                aria-label="Delete last digit"
                className="relative flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full border border-[#D4A559]/35 bg-[#220E05]/75 text-[#FFF8EE] shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 hover:border-[#E5B878] hover:bg-[#2F1407] hover:shadow-[0_0_18px_rgba(229,184,120,0.4)] active:scale-95 active:bg-[#3D1A0A] active:border-[#F3C97E] active:shadow-[0_0_22px_rgba(229,184,120,0.6)] focus:outline-none"
              >
                <Backspace size={28} weight="bold" />
              </button>

              <button
                id="key-0"
                onClick={() => handleNumClick('0')}
                className="relative flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full border border-[#D4A559]/35 bg-[#220E05]/75 font-serif text-[36px] font-semibold text-[#FFF8EE] shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 hover:border-[#E5B878] hover:bg-[#2F1407] hover:shadow-[0_0_18px_rgba(229,184,120,0.4)] active:scale-95 active:bg-[#3D1A0A] active:border-[#F3C97E] active:shadow-[0_0_22px_rgba(229,184,120,0.6)] focus:outline-none"
              >
                0
              </button>

              <button
                id="key-submit"
                onClick={handleSubmit}
                disabled={!ready || loading}
                aria-label="Submit code"
                className={`relative flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full border transition-all duration-150 active:scale-95 focus:outline-none ${
                  ready
                    ? 'border-[#E5B878] bg-[#220E05]/75 text-[#FFF8EE] shadow-[0_0_24px_rgba(229,184,120,0.5),inset_0_0_10px_rgba(229,184,120,0.2)] hover:shadow-[0_0_28px_rgba(229,184,120,0.6)] cursor-pointer'
                    : 'border-[#D4A559]/25 bg-[#1B0A03]/50 text-[#FFF8EE]/30 cursor-not-allowed'
                }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {loading ? (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, rotate: 360 }}
                      exit={{ opacity: 0 }}
                      transition={{ rotate: { duration: 0.8, repeat: Infinity, ease: 'linear' } }}
                    >
                      <CircleNotch size={28} weight="bold" />
                    </motion.span>
                  ) : (
                    <motion.span key="check" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <Check size={28} weight="bold" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const keyBase = isFestiveMode
    ? 'bg-white text-mahogany-800 border border-gold-600/25 shadow-sm active:bg-parchment-200'
    : 'bg-white text-[#1A1714] border border-gold-600/25 shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:scale-95 active:bg-gold-50/80 active:border-gold-500';

  return (
    <div
      className={`screen ${isActive ? 'visible' : ''} flex h-full ${isFestiveMode ? 'bg-parchment-100' : 'bg-[#FAFAF8]'}`}
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {!isFestiveMode && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]"
          style={{ background: 'radial-gradient(closest-side, rgba(217,165,68,0.10), transparent)' }}
        />
      )}

      {/* Back button */}
      <button
        onClick={onBack}
        aria-label="Go back to home"
        className={`absolute left-8 top-8 z-20 flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95 ${
          isFestiveMode ? 'bg-white text-mahogany-700 shadow-sm active:bg-parchment-200' : 'bg-white text-[#1A1714] border border-gold-600/25 shadow-sm active:bg-gold-50/80'
        }`}
      >
        <ArrowLeft size={24} weight="bold" />
      </button>

      <div className="relative z-10 flex w-full items-center justify-between gap-16 px-24">
        {/* LEFT: instruction + code slots */}
        <div className="flex flex-1 flex-col gap-12">
          <h2
            className={`text-[48px] font-extrabold leading-[1.1] ${
              isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'
            }`}
          >
            Enter Your Mimo
            <br />
            <span className={isFestiveMode ? 'text-gold-600' : 'text-gold-600'}>Code Here</span>
          </h2>

          <motion.div
            animate={isShaking ? { x: [0, -14, 14, -10, 10, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.5 }}
            className="flex gap-5"
          >
            {[0, 1, 2, 3].map((i) => {
              const filled = i < code.length;
              const active = i === code.length && !isShaking;
              return (
                <div
                  key={i}
                  className={`flex h-[88px] w-[88px] items-center justify-center rounded-2xl border-2 text-[36px] font-bold transition-all duration-200 ${
                    isShaking
                      ? 'border-danger-500/70 bg-danger-500/10 text-danger-500'
                      : filled
                      ? isFestiveMode
                        ? 'border-gold-600 bg-gold-600/10 text-mahogany-800'
                        : 'border-gold-500 bg-gradient-to-b from-gold-100/60 to-white text-gold-700 shadow-[0_4px_16px_rgba(217,165,68,0.22)]'
                      : active
                      ? isFestiveMode
                        ? 'border-mahogany-600/40 text-mahogany-800'
                        : 'border-gold-600 bg-white ring-4 ring-gold-500/15'
                      : isFestiveMode
                      ? 'border-mahogany-600/15 text-mahogany-800'
                      : 'border-gold-600/25 bg-white/80'
                  }`}
                >
                  {filled ? '•' : ''}
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* RIGHT: keypad inside elevated card */}
        <div className="relative rounded-[32px] border border-gold-600/25 bg-white/75 p-6 shadow-[0_20px_50px_rgba(74,45,20,0.06)] backdrop-blur-md">
          <div className="grid w-[420px] grid-cols-3 gap-3.5">
            {KEYS.map((num) => (
              <button
                key={num}
                id={`key-${num}`}
                onClick={() => handleNumClick(num)}
                className={`h-[88px] rounded-2xl text-[30px] font-bold transition-transform active:scale-95 ${keyBase}`}
              >
                {num}
              </button>
            ))}

            <button
              id="key-del"
              onClick={() => handleNumClick('del')}
              className={`flex h-[88px] items-center justify-center rounded-2xl bg-white text-danger-600 border border-danger-500/25 shadow-sm transition-transform active:scale-95 active:bg-danger-50`}
            >
              <Backspace size={28} weight="bold" />
            </button>

            <button
              id="key-0"
              onClick={() => handleNumClick('0')}
              className={`h-[88px] rounded-2xl text-[30px] font-bold transition-transform active:scale-95 ${keyBase}`}
            >
              0
            </button>

            <button
              id="key-submit"
              onClick={handleSubmit}
              disabled={code.length !== 4 || loading}
              className={`flex h-[88px] items-center justify-center rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-35 ${
                code.length === 4
                  ? isFestiveMode
                    ? 'bg-gradient-to-br from-mahogany-700 to-mahogany-800 text-white shadow-lg'
                    : 'bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 text-white shadow-[0_8px_20px_rgba(200,134,10,0.35)] ring-1 ring-gold-300/70'
                  : isFestiveMode
                  ? 'bg-white text-mahogany-800 border border-gold-600/20'
                  : 'bg-white text-gold-700/40 border border-gold-600/20'
              }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {loading ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, rotate: 360 }}
                    exit={{ opacity: 0 }}
                    transition={{ rotate: { duration: 0.8, repeat: Infinity, ease: 'linear' } }}
                  >
                    <CircleNotch size={28} weight="bold" />
                  </motion.span>
                ) : (
                  <motion.span key="check" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <Check size={28} weight="bold" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
