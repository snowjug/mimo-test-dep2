import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { WarningOctagon, Clock, ArrowClockwise, House, HandHeart } from '@phosphor-icons/react';
import { FestiveBackdrop, Toran, ZariBorder } from '../festive/NavaratriDecor';
import { isFestivalActive } from '../../config/festivalConfig';

interface SystemErrorScreenProps {
    isActive: boolean;
    jobData: {
        userName: string;
        fileName: string;
        pages: number;
    } | null;
    onReset: () => void;
    onRetry: () => void;
    errorMsg?: string;
    showRefundBanner?: boolean;
    kioskId?: string;
}

const AUTO_RESET_SECONDS = 15;

export const SystemErrorScreen: React.FC<SystemErrorScreenProps> = ({
    isActive,
    jobData,
    onReset,
    onRetry,
    errorMsg,
    showRefundBanner,
    kioskId,
}) => {
    const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
    const firstName = jobData?.userName?.split(' ')[0] || 'there';
    const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);

    useEffect(() => {
        if (!isActive) {
            setCountdown(AUTO_RESET_SECONDS);
            return;
        }
        setCountdown(AUTO_RESET_SECONDS);
        let remaining = AUTO_RESET_SECONDS;
        const interval = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                clearInterval(interval);
                onReset();
                return;
            }
            setCountdown(remaining);
        }, 1000);
        return () => clearInterval(interval);
    }, [isActive, onReset]);

    return (
        <div
            className={`screen ${isActive ? 'visible' : ''} flex h-full flex-col items-center justify-between overflow-hidden px-20 text-center ${
                isFestiveMode ? 'bg-parchment-100 pb-10 pt-[104px]' : 'bg-[#FAFAF8] py-8'
            }`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            {!isFestiveMode && (
                <div
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]"
                    style={{ background: 'radial-gradient(closest-side, rgba(243,91,91,0.08), transparent)' }}
                />
            )}
            {isFestiveMode && (
                <>
                    <FestiveBackdrop />
                    <Toran compact />
                    <ZariBorder />
                </>
            )}

            {/* Badge */}
            <motion.div
                initial={isActive ? { opacity: 0, y: -14, scale: 0.9 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
                className={`relative z-10 flex items-center gap-2.5 rounded-full px-6 py-2 shadow-lg ${
                    isFestiveMode
                        ? 'bg-gradient-to-br from-mahogany-600 to-mahogany-800 border border-gold-600/40'
                        : 'bg-gradient-to-br from-danger-600 to-[#ff8a3d]'
                }`}
            >
                <WarningOctagon size={20} weight="fill" className="text-white" />
                <span className="text-[14px] font-extrabold uppercase tracking-[0.15em] text-white">Print Error</span>
            </motion.div>

            {/* Main content */}
            <div className="relative z-10 flex w-full max-w-[1000px] flex-1 flex-col justify-center gap-4 text-left">
                <div className="flex items-baseline gap-2">
                    <span className={`text-[32px] font-black uppercase tracking-wide ${isFestiveMode ? 'text-mahogany-600/70' : 'text-[#8C8072]'}`}>
                        Hey
                    </span>
                    <span
                        className={`text-[32px] font-black uppercase tracking-wide ${
                            isFestiveMode ? 'text-gold-600 underline decoration-gold-600/60 underline-offset-8' : 'text-[#1A1714]'
                        }`}
                    >
                        {firstName},
                    </span>
                </div>

                <div
                    className={`relative overflow-hidden rounded-[24px] border px-9 py-6 backdrop-blur-xl ${
                        isFestiveMode
                            ? 'border-gold-600/40 bg-gradient-to-br from-white to-parchment-200 shadow-[0_20px_50px_rgba(74,45,20,0.12)]'
                            : 'border-danger-500/25 bg-white/90 shadow-[0_20px_50px_rgba(243,91,91,0.06)]'
                    }`}
                >
                    <p className={`text-[22px] font-medium leading-snug ${isFestiveMode ? 'text-mahogany-800' : 'text-[#1A1714]'}`}>
                        {errorMsg || 'We apologize for the inconvenience. Something went wrong while printing your document.'}
                    </p>
                    {!showRefundBanner && (
                        <p className={`mt-2 text-[19px] font-extrabold ${isFestiveMode ? 'text-gold-600' : 'text-danger-600'}`}>
                            Please try again.
                        </p>
                    )}
                </div>

                {showRefundBanner && (
                    <div
                        className={`flex items-center gap-5 rounded-3xl border px-7 py-4 ${
                            isFestiveMode
                                ? 'border-gold-600/30 bg-gradient-to-br from-white to-parchment-100'
                                : 'border-success-500/30 bg-gradient-to-br from-success-500/10 to-white shadow-sm'
                        }`}
                    >
                        <span
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                                isFestiveMode ? 'bg-success-500/15 text-success-600' : 'bg-success-500/15 text-success-600'
                            }`}
                        >
                            <HandHeart size={22} weight="fill" />
                        </span>
                        <div className="flex flex-col gap-0.5 text-left">
                            <strong className={`text-[19px] font-extrabold text-success-600`}>
                                Refund in Progress
                            </strong>
                            <span className={`text-[15px] ${isFestiveMode ? 'text-mahogany-800/70' : 'text-[#5C544B]'}`}>
                                If you were charged, your payment will be refunded within 5–7 business days.
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom */}
            <div className="relative z-10 flex flex-col items-center gap-4 pb-1">
                <div className={`flex items-center gap-2 text-[15px] font-medium ${isFestiveMode ? 'text-mahogany-600/80' : 'text-[#5C544B]'}`}>
                    <Clock size={17} />
                    Returning home in{' '}
                    <strong className={isFestiveMode ? 'text-gold-600' : 'text-gold-700'}>{countdown}s</strong>
                </div>
                <div className="flex items-center gap-6">
                    {!showRefundBanner && (
                        <button
                            onClick={onRetry}
                            className={`flex items-center gap-2.5 rounded-full px-9 py-3.5 text-[17px] font-extrabold shadow-lg transition-transform active:scale-95 ${
                                isFestiveMode
                                    ? 'bg-gradient-to-br from-mahogany-700 to-mahogany-800 text-white'
                                    : 'bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600 text-white shadow-[0_8px_20px_rgba(200,134,10,0.35)] ring-1 ring-gold-300/70'
                            }`}
                        >
                            <ArrowClockwise size={19} weight="bold" />
                            Try Again
                        </button>
                    )}
                    <button
                        onClick={onReset}
                        className={`flex items-center gap-2.5 rounded-full border px-8 py-3.5 text-[17px] font-extrabold transition-transform active:scale-95 ${
                            isFestiveMode
                                ? 'border-gold-600/30 bg-white text-mahogany-800'
                                : 'border-gold-600/30 bg-white text-[#1A1714] shadow-sm active:bg-gold-50/80'
                        }`}
                    >
                        <House size={19} weight="bold" />
                        Back to Home
                    </button>
                </div>
            </div>
        </div>
    );
};
