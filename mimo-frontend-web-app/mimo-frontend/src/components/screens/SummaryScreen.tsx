import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ArrowDown, WarningCircle } from '@phosphor-icons/react';
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
    printCode?: string;
}

const BACKEND_URL = 'https://api-upqxuj7evq-uc.a.run.app';
const DEMO_CODES = ['0000', '9999'];
const AUTO_RESET_MS = 10000;
// While the customer is choosing what went wrong they need longer than the normal 10s.
const REPORT_RESET_MS = 30000;
const ISSUES: { id: string; label: string }[] = [
    { id: 'blank', label: 'Blank pages' },
    { id: 'missing', label: 'Pages missing' },
    { id: 'faint', label: 'Too faint or streaky' },
    { id: 'other', label: 'Something else' },
];
type ReportState = 'ask' | 'choose' | 'sending' | 'sent' | 'failed';

export const SummaryScreen: React.FC<SummaryScreenProps> = ({ isActive, onReset, jobData, kioskId, printCode }) => {
    const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
    const timeoutRef = useRef<number | null>(null);
    const [renderKey, setRenderKey] = useState(0);
    const [report, setReport] = useState<ReportState>('ask');

    const armReset = (ms: number) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = null;
            onReset();
        }, ms);
    };

    const sendReport = async (issue: string) => {
        setReport('sending');
        armReset(REPORT_RESET_MS);
        if (!printCode || DEMO_CODES.includes(printCode)) {
            setReport('sent');
            armReset(AUTO_RESET_MS);
            return;
        }
        try {
            const res = await fetch(`${BACKEND_URL}/kiosk/report-problem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printCode, kioskId, issue }),
            });
            setReport(res.ok ? 'sent' : 'failed');
        } catch {
            setReport('failed');
        }
        armReset(AUTO_RESET_MS);
    };

    useEffect(() => {
        let keyTimer: number | null = null;
        if (isActive) {
            keyTimer = window.setTimeout(() => {
                setReport('ask');
                setRenderKey(prev => prev + 1);
            }, 0);
            timeoutRef.current = window.setTimeout(() => {
                onReset();
                timeoutRef.current = null;
            }, AUTO_RESET_MS);
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
                isFestiveMode ? 'bg-parchment-100' : 'bg-[#FAFAF8]'
            }`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]"
                style={{
                    background: isFestiveMode
                        ? 'radial-gradient(closest-side, rgba(201,151,62,0.16), transparent)'
                        : 'radial-gradient(closest-side, rgba(217,165,68,0.12), transparent)',
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
                <h1 className={`text-[46px] font-black tracking-tight ${isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'}`}>
                    <span className={isFestiveMode ? 'text-gold-600' : 'text-gold-600'}>
                        {jobData?.userName?.split(' ')[0] || 'DEMO'}
                    </span>
                    , your documents are ready.
                </h1>
            </motion.div>

            {/* Collection slot illustration */}
            <div
                className={`relative z-10 my-6 flex items-center justify-center ${
                    report === 'choose' || report === 'sending' ? 'hidden' : ''
                }`}
            >
                <div className="relative h-[220px] w-[330px]">
                    {/* Slot bezel */}
                    <div
                        className={`absolute inset-x-0 top-0 h-[150px] overflow-hidden rounded-2xl border ${
                            isFestiveMode
                                ? 'border-gold-600/30 bg-white'
                                : 'border-gold-600/30 bg-white shadow-[inset_0_4px_14px_rgba(0,0,0,0.06),0_10px_30px_rgba(74,45,20,0.08)]'
                        }`}
                    >
                        {/* Void */}
                        <div
                            className={`absolute inset-x-0 top-0 h-[100px] ${
                                isFestiveMode
                                    ? 'bg-gradient-to-b from-black/70 to-black/25'
                                    : 'bg-gradient-to-b from-[#E2DDD5] to-[#F5F2EC]'
                            }`}
                        />

                        {/* Sliding paper */}
                        <div
                            className="absolute left-1/2 top-2 w-[150px] -translate-x-1/2 rounded-md bg-white px-5 py-6 shadow-xl border border-gold-600/15"
                            style={{ animation: isActive ? 'kiosk-paper-dispense 6s ease-in-out infinite' : 'none' }}
                        >
                            <span
                                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${
                                    isFestiveMode ? 'bg-gold-500/15 text-gold-600' : 'bg-gold-500/15 text-gold-600'
                                }`}
                            >
                                <Check size={18} weight="bold" />
                            </span>
                            <div className="mb-2 h-2 w-[90%] rounded-full bg-slate-200" />
                            <div className="mb-2 h-2 w-[70%] rounded-full bg-slate-200" />
                            <div className="h-2 w-[55%] rounded-full bg-slate-200" />
                        </div>
                    </div>

                    {/* Base shelf */}
                    <div
                        className={`absolute inset-x-3 top-[142px] h-3 rounded-full ${
                            isFestiveMode ? 'bg-gold-600/25' : 'bg-gold-600/30'
                        }`}
                    />

                    {isFestiveMode && <DandiyaSticks />}
                </div>
            </div>

            {/* Bottom cue + button */}
            <div className="relative z-10 flex flex-col items-center gap-7">
                <div
                    className={`flex items-center gap-4 text-[19px] font-extrabold uppercase tracking-[0.1em] ${
                        isFestiveMode ? 'text-mahogany-700' : 'text-[#1A1714]'
                    }`}
                >
                    <ArrowDown size={22} weight="bold" className="animate-bounce text-gold-600" />
                    Please collect your documents from below
                    <ArrowDown size={22} weight="bold" className="animate-bounce text-gold-600" />
                </div>

                {report === 'ask' && (
                    <div className="flex flex-col items-center gap-4">
                        <p className={`text-[17px] font-bold ${isFestiveMode ? 'text-mahogany-700' : 'text-[#5C544B]'}`}>
                            Did your pages print correctly?
                        </p>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onReset}
                                className={`flex items-center gap-3 rounded-full px-12 py-5 text-[19px] font-black uppercase tracking-[0.2em] shadow-xl transition-transform active:scale-95 ${
                                    isFestiveMode
                                        ? 'bg-gradient-to-br from-mahogany-700 to-mahogany-800 text-white'
                                        : 'bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 text-white shadow-[0_8px_24px_rgba(200,134,10,0.35)] ring-1 ring-gold-300/70'
                                }`}
                            >
                                Yes, done
                                <Check size={24} weight="bold" />
                            </button>
                            <button
                                onClick={() => {
                                    setReport('choose');
                                    armReset(REPORT_RESET_MS);
                                }}
                                className={`flex items-center gap-2 rounded-full border-2 px-8 py-5 text-[16px] font-extrabold uppercase tracking-[0.12em] transition-transform active:scale-95 ${
                                    isFestiveMode
                                        ? 'border-mahogany-700/40 text-mahogany-800'
                                        : 'border-gold-600/35 bg-white text-[#1A1714] shadow-sm active:bg-gold-50/80'
                                }`}
                            >
                                <WarningCircle size={22} weight="bold" />
                                Report a problem
                            </button>
                        </div>
                    </div>
                )}

                {(report === 'choose' || report === 'sending') && (
                    <div className="flex flex-col items-center gap-4">
                        <p className={`text-[17px] font-bold ${isFestiveMode ? 'text-mahogany-700' : 'text-[#5C544B]'}`}>
                            What went wrong?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {ISSUES.map((issue) => (
                                <button
                                    key={issue.id}
                                    disabled={report === 'sending'}
                                    onClick={() => sendReport(issue.id)}
                                    className={`min-w-[250px] rounded-2xl border-2 px-6 py-4 text-[17px] font-extrabold transition-transform active:scale-95 disabled:opacity-50 ${
                                        isFestiveMode
                                            ? 'border-mahogany-700/30 bg-white/70 text-mahogany-800'
                                            : 'border-gold-600/30 bg-white text-[#1A1714] shadow-sm hover:border-gold-500 active:bg-gold-50/80'
                                    }`}
                                >
                                    {issue.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={onReset}
                            className={`text-[15px] font-bold underline underline-offset-4 ${isFestiveMode ? 'text-mahogany-700/70' : 'text-[#8C8072]'}`}
                        >
                            Never mind, everything is fine
                        </button>
                    </div>
                )}

                {(report === 'sent' || report === 'failed') && (
                    <div className="flex max-w-[640px] flex-col items-center gap-4 text-center">
                        <p className={`text-[20px] font-extrabold ${isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'}`}>
                            {report === 'sent'
                                ? 'Thank you. The MIMO team has been told. Please keep the pages, the team may ask to see them.'
                                : `We could not send your report. Please tell the staff your code ${printCode ?? ''}.`}
                        </p>
                        <button
                            onClick={onReset}
                            className={`flex items-center gap-3 rounded-full px-12 py-4 text-[17px] font-black uppercase tracking-[0.2em] shadow-xl transition-transform active:scale-95 ${
                                isFestiveMode
                                    ? 'bg-gradient-to-br from-mahogany-700 to-mahogany-800 text-white'
                                    : 'bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 text-white shadow-[0_8px_24px_rgba(200,134,10,0.35)] ring-1 ring-gold-300/70'
                            }`}
                        >
                            Done
                            <Check size={22} weight="bold" />
                        </button>
                    </div>
                )}

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
