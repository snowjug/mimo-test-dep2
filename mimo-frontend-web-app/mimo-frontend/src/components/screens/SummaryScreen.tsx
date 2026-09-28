import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ArrowDown } from '@phosphor-icons/react';
import { isFestivalActive } from '../../config/festivalConfig';
import { DiyaRow, FestiveBackdrop, Toran, ZariBorder } from '../festive/NavaratriDecor';

const DandiyaSticks: React.FC = () => (
    <svg width="130" height="130" viewBox="0 0 130 130" className="pointer-events-none absolute -right-6 top-2">
        <defs>
            <linearGradient id="dandiyaGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF3C4" />
                <stop offset="35%" stopColor="#F0C878" />
                <stop offset="70%" stopColor="#D9A544" />
                <stop offset="100%" stopColor="#8A6425" />
            </linearGradient>
        </defs>
        <ellipse cx="65" cy="98" rx="30" ry="6" fill="rgba(74,20,32,0.14)" />
        {[45, -45].map((deg) => (
            <g key={deg} transform={`rotate(${deg} 65 62)`}>
                <rect x="14" y="57" width="102" height="9" rx="4.5" fill="url(#dandiyaGold)" stroke="#7A1230" strokeWidth="0.5" />
                <rect x="30" y="57" width="4" height="9" fill="#7A1230" opacity="0.35" />
                <rect x="92" y="57" width="4" height="9" fill="#7A1230" opacity="0.35" />
                <circle cx="14" cy="61.5" r="7.5" fill="url(#dandiyaGold)" />
                <circle cx="116" cy="61.5" r="7.5" fill="url(#dandiyaGold)" />
                <path d="M14 69 L10 82 M14 69 L14 83 M14 69 L18 82" stroke="#9B1B3E" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M116 69 L112 82 M116 69 L116 83 M116 69 L120 82" stroke="#9B1B3E" strokeWidth="1.4" strokeLinecap="round" />
            </g>
        ))}
        <circle cx="65" cy="62" r="6" fill="#FFF3C4" stroke="#8A6425" strokeWidth="1" />
    </svg>
);

interface SummaryScreenProps {
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
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({ isActive, onReset, jobData, kioskId }) => {
    const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
    const timeoutRef = useRef<number | null>(null);
    const [renderKey, setRenderKey] = useState(0);

    useEffect(() => {
        let keyTimer: number | null = null;
        if (isActive) {
            keyTimer = window.setTimeout(() => {
                setRenderKey(prev => prev + 1);
            }, 0);
            timeoutRef.current = window.setTimeout(() => {
                onReset();
                timeoutRef.current = null;
            }, 10000);
        } else {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        }
        return () => {
            if (keyTimer) clearTimeout(keyTimer);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [isActive, onReset]);

    return (
        <div
            key={renderKey}
            className={`screen ${isActive ? 'visible' : ''} flex h-full flex-col items-center justify-center overflow-hidden px-20 pb-24 ${
                isFestiveMode ? 'bg-parchment-100' : 'bg-ink-950'
            }`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]"
                style={{
                    background: isFestiveMode
                        ? 'radial-gradient(closest-side, rgba(201,151,62,0.16), transparent)'
                        : 'radial-gradient(closest-side, rgba(52,211,153,0.10), transparent)',
                }}
            />

            {isFestiveMode && (
                <>
                    <FestiveBackdrop />
                    <Toran compact />
                    <ZariBorder />
                </>
            )}

            <motion.div
                initial={isActive ? { opacity: 0, y: -30 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 mb-2 mt-9 text-center"
            >
                <h1 className={`text-[46px] font-black tracking-tight ${isFestiveMode ? 'text-mahogany-800' : 'text-white'}`}>
                    <span className={isFestiveMode ? 'text-gold-600' : 'text-gold-400'}>
                        {jobData?.userName?.split(' ')[0] || 'DEMO'}
                    </span>
                    , your documents are ready.
                </h1>
            </motion.div>

            {/* Collection slot illustration */}
            <div className="relative z-10 my-6 flex items-center justify-center">
                <div className="relative h-[220px] w-[330px]">
                    {/* Slot bezel */}
                    <div
                        className={`absolute inset-x-0 top-0 h-[150px] overflow-hidden rounded-2xl border ${
                            isFestiveMode ? 'border-gold-600/30 bg-white' : 'border-white/10 bg-ink-900'
                        }`}
                        style={{ boxShadow: 'inset 0 14px 26px rgba(0,0,0,0.35)' }}
                    >
                        {/* Dark void */}
                        <div className="absolute inset-x-0 top-0 h-[100px] bg-gradient-to-b from-black/70 to-black/25" />

                        {/* Sliding paper */}
                        <div
                            className="absolute left-1/2 top-2 w-[150px] -translate-x-1/2 rounded-md bg-white px-5 py-6 shadow-xl"
                            style={{ animation: isActive ? 'kiosk-paper-dispense 6s ease-in-out infinite' : 'none' }}
                        >
                            <span
                                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${
                                    isFestiveMode ? 'bg-gold-500/15 text-gold-600' : 'bg-gold-500/15 text-gold-500'
                                }`}
                            >
                                <Check size={18} weight="bold" />
                            </span>
                            <div className="mb-2 h-2 w-[90%] rounded-full bg-slate-300" />
                            <div className="mb-2 h-2 w-[70%] rounded-full bg-slate-300" />
                            <div className="h-2 w-[55%] rounded-full bg-slate-300" />
                        </div>
                    </div>

                    {/* Base shelf */}
                    <div
                        className={`absolute inset-x-3 top-[142px] h-3 rounded-full ${
                            isFestiveMode ? 'bg-gold-600/25' : 'bg-white/10'
                        }`}
                    />

                    {isFestiveMode && <DandiyaSticks />}
                </div>
            </div>

            {/* Bottom cue + button */}
            <div className="relative z-10 flex flex-col items-center gap-7">
                <div
                    className={`flex items-center gap-4 text-[19px] font-extrabold uppercase tracking-[0.1em] ${
                        isFestiveMode ? 'text-mahogany-700' : 'text-white/85'
                    }`}
                >
                    <ArrowDown size={22} weight="bold" className="animate-bounce text-gold-500" />
                    Please collect your documents from below
                    <ArrowDown size={22} weight="bold" className="animate-bounce text-gold-500" />
                </div>

                <button
                    onClick={onReset}
                    className={`flex items-center gap-3 rounded-full px-14 py-5 text-[19px] font-black uppercase tracking-[0.2em] shadow-xl transition-transform active:scale-95 ${
                        isFestiveMode
                            ? 'bg-gradient-to-br from-mahogany-700 to-mahogany-800 text-white'
                            : 'bg-gradient-to-br from-gold-400 to-gold-600 text-ink-950'
                    }`}
                >
                    Done
                    <Check size={24} weight="bold" />
                </button>

                {isFestiveMode && <DiyaRow count={9} size={30} gap={22} />}
            </div>

            <style>{`
                @keyframes kiosk-paper-dispense {
                    0%, 5%   { transform: translate(-50%, -220px); opacity: 1; }
                    25%, 40% { transform: translate(-50%, 0px); opacity: 1; }
                    55%      { transform: translate(-50%, 60px); opacity: 1; }
                    65%      { transform: translate(-50%, 220px); opacity: 0; }
                    100%     { transform: translate(-50%, 220px); opacity: 0; }
                }
            `}</style>
        </div>
    );
};
