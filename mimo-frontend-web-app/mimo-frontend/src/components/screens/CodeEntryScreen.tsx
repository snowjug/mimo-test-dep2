import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Backspace, Check, CircleNotch } from '@phosphor-icons/react';
import { isFestivalActive } from '../../config/festivalConfig';
import { ArchFrame, Diya, FestiveBackdrop, Mandala, OrnamentDivider, Toran, ZariBorder } from '../festive/NavaratriDecor';

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
  const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
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
    const festiveKey =
      'h-[84px] rounded-2xl border border-gold-600/40 bg-gradient-to-b from-white to-parchment-100 font-serif text-[42px] font-semibold leading-none text-mahogany-700 [font-variant-numeric:lining-nums] shadow-[inset_0_0_0_3px_#fffdf7,inset_0_0_0_4px_rgba(201,151,62,0.22),0_4px_12px_rgba(122,18,48,0.08)] transition-transform active:scale-95 active:from-parchment-200';
    const ready = code.length === 4;

    return (
      <div
        className={`screen ${isActive ? 'visible' : ''} flex h-full overflow-hidden bg-parchment-100`}
        style={{ display: isActive ? 'flex' : 'none' }}
      >
        <FestiveBackdrop />

        <div className="pointer-events-none absolute left-[1030px] top-[444px] z-0 -translate-x-1/2 -translate-y-1/2 opacity-[0.11]">
          <Mandala size={600} />
        </div>

        <Toran compact />

        <button
          onClick={onBack}
          aria-label="Go back to home"
          className="absolute left-10 top-[104px] z-20 flex h-14 w-14 items-center justify-center rounded-full border border-gold-600/45 bg-white text-mahogany-700 shadow-[0_6px_16px_rgba(122,18,48,0.12)] transition-transform active:scale-95"
        >
          <ArrowLeft size={24} weight="bold" />
        </button>

        <div className="absolute inset-x-0 bottom-[18px] top-[96px] z-10 flex items-center justify-center gap-[88px]">
          {/* LEFT: jharokha arch with the code slots */}
          <motion.div
            initial={isActive ? { opacity: 0, y: 20 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative h-[560px] w-[540px]"
          >
            <ArchFrame width={540} height={560} />
            <div className="absolute inset-0 flex flex-col items-center px-12 pt-[140px] text-center">
              <p lang="hi" className="font-deva text-[24px] leading-[1.3] text-mahogany-600">
                अपना मिमो कोड दर्ज करें
              </p>
              <h2 className="mt-1 whitespace-nowrap font-serif text-[44px] font-semibold leading-[1.1] text-mahogany-800">
                Enter your Mimo code
              </h2>
              <p className="mt-2 text-[17px] font-medium text-ink-warm/60">Each digit lights a diya</p>

              <div className="mt-5">
                <OrnamentDivider width={56} />
              </div>

              <motion.div
                animate={isShaking ? { x: [0, -14, 14, -10, 10, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-8 flex gap-4"
              >
                {[0, 1, 2, 3].map((i) => {
                  const filled = i < code.length;
                  const active = i === code.length && !isShaking;
                  return (
                    <div
                      key={i}
                      className={`flex h-[96px] w-[84px] items-end justify-center rounded-2xl border-2 bg-white/80 pb-3 transition-colors duration-200 ${
                        isShaking
                          ? 'border-danger-500/70 bg-danger-500/10'
                          : filled
                          ? 'border-gold-500 bg-gradient-to-b from-gold-200/40 to-white shadow-[0_0_24px_rgba(251,191,36,0.35)]'
                          : active
                          ? 'border-mahogany-600/55'
                          : 'border-gold-600/25'
                      }`}
                    >
                      {filled ? (
                        <Diya size={52} />
                      ) : active ? (
                        <span
                          className="mb-4 h-10 w-[3px] rounded-full bg-mahogany-600"
                          style={{ animation: 'navaratri-caret 1.1s ease-in-out infinite' }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </motion.div>
            </div>
          </motion.div>

          {/* RIGHT: keypad on a carved panel */}
          <div className="relative rounded-[32px] border border-gold-600/35 bg-white/55 p-6 shadow-[0_24px_60px_rgba(122,18,48,0.10)] backdrop-blur-sm">
            {['left-3 top-3', 'right-3 top-3', 'left-3 bottom-3', 'right-3 bottom-3'].map((pos) => (
              <span key={pos} className={`absolute ${pos} h-2 w-2 rotate-45 bg-gold-500/70`} />
            ))}
            <div className="grid w-[420px] grid-cols-3 gap-3.5">
              {KEYS.map((num) => (
                <button key={num} id={`key-${num}`} onClick={() => handleNumClick(num)} className={festiveKey}>
                  {num}
                </button>
              ))}

              <button
                id="key-del"
                onClick={() => handleNumClick('del')}
                aria-label="Delete last digit"
                className={`${festiveKey} flex items-center justify-center text-mahogany-600`}
              >
                <Backspace size={30} weight="bold" />
              </button>

              <button id="key-0" onClick={() => handleNumClick('0')} className={festiveKey}>
                0
              </button>

              <button
                id="key-submit"
                onClick={handleSubmit}
                disabled={!ready || loading}
                aria-label="Submit code"
                className={`flex h-[84px] items-center justify-center rounded-2xl border transition-all active:scale-95 ${
                  ready
                    ? 'border-gold-500 bg-gradient-to-br from-mahogany-600 to-mahogany-800 text-parchment-50 shadow-[0_10px_24px_rgba(122,18,48,0.35)] ring-1 ring-gold-400/60'
                    : 'border-gold-600/30 bg-white/70 text-mahogany-700/35'
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
                      <CircleNotch size={30} weight="bold" />
                    </motion.span>
                  ) : (
                    <motion.span key="check" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <Check size={30} weight="bold" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>

        <ZariBorder />
      </div>
    );
  }

  const keyBase = isFestiveMode
    ? 'bg-white text-mahogany-800 border border-gold-600/25 shadow-sm active:bg-parchment-200'
    : 'bg-ink-800 text-white border border-white/5 active:bg-ink-700';

  return (
    <div
      className={`screen ${isActive ? 'visible' : ''} flex h-full ${isFestiveMode ? 'bg-parchment-100' : 'bg-ink-950'}`}
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
        className={`absolute left-8 top-8 z-20 flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
          isFestiveMode ? 'bg-white text-mahogany-700 shadow-sm active:bg-parchment-200' : 'bg-white/5 text-white/70 active:bg-white/10'
        }`}
      >
        <ArrowLeft size={24} weight="bold" />
      </button>

      <div className="relative z-10 flex w-full items-center justify-between gap-16 px-24">
        {/* LEFT: instruction + code slots */}
        <div className="flex flex-1 flex-col gap-12">
          <h2
            className={`text-[46px] font-extrabold leading-[1.1] ${
              isFestiveMode ? 'text-mahogany-800' : 'text-white'
            }`}
          >
            Enter Your Mimo
            <br />
            Code Here
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
                  className={`flex h-[84px] w-[84px] items-center justify-center rounded-2xl border-2 text-[32px] font-bold transition-all duration-200 ${
                    isShaking
                      ? 'border-danger-500/70 bg-danger-500/10 text-danger-500'
                      : filled
                      ? isFestiveMode
                        ? 'border-gold-600 bg-gold-600/10 text-mahogany-800'
                        : 'border-gold-500 bg-gold-500/10 text-gold-300'
                      : active
                      ? isFestiveMode
                        ? 'border-mahogany-600/40 text-mahogany-800'
                        : 'border-white/30 text-white'
                      : isFestiveMode
                      ? 'border-mahogany-600/15 text-mahogany-800'
                      : 'border-white/10 text-white'
                  }`}
                >
                  {filled ? '•' : ''}
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* RIGHT: keypad */}
        <div className="grid w-[420px] grid-cols-3 gap-4">
          {KEYS.map((num) => (
            <button
              key={num}
              id={`key-${num}`}
              onClick={() => handleNumClick(num)}
              className={`h-[92px] rounded-2xl text-[30px] font-bold transition-transform active:scale-95 ${keyBase}`}
            >
              {num}
            </button>
          ))}

          <button
            id="key-del"
            onClick={() => handleNumClick('del')}
            className={`flex h-[92px] items-center justify-center rounded-2xl transition-transform active:scale-95 ${
              isFestiveMode
                ? 'bg-white text-danger-600 border border-danger-500/20 shadow-sm'
                : 'bg-ink-800 text-danger-500 border border-danger-500/15'
            }`}
          >
            <Backspace size={28} weight="bold" />
          </button>

          <button
            id="key-0"
            onClick={() => handleNumClick('0')}
            className={`h-[92px] rounded-2xl text-[30px] font-bold transition-transform active:scale-95 ${keyBase}`}
          >
            0
          </button>

          <button
            id="key-submit"
            onClick={handleSubmit}
            disabled={code.length !== 4 || loading}
            className={`flex h-[92px] items-center justify-center rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-30 ${
              code.length === 4
                ? isFestiveMode
                  ? 'bg-gradient-to-br from-mahogany-700 to-mahogany-800 text-white shadow-lg'
                  : 'bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950 shadow-lg'
                : isFestiveMode
                ? 'bg-white text-mahogany-800 border border-gold-600/20'
                : 'bg-ink-800 text-white border border-white/5'
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
  );
};
