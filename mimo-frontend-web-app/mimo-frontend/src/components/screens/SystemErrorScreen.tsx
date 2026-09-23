import React, { useEffect, useState } from 'react';
import { CV001BellsDecor } from './CV001BellsDecor';
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
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    onReset();
                    return AUTO_RESET_SECONDS;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [isActive, onReset]);

    return (
        <div 
            className={`screen err-screen ${isActive ? 'visible' : ''} ${isFestiveMode ? 'festive-err-screen' : ''}`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            {/* Botanical background & ambient glow only for non-festive mode */}
            {!isFestiveMode && (
                <>
                    <div className="kiosk-bg" />
                    <div className="ambient-glow glow-1" />
                    <div className="ambient-glow glow-2" />
                </>
            )}

            {/* Symmetrical Golden Brass Bells for Festive Mode */}
            {isFestiveMode && <CV001BellsDecor />}

            {/* ── TOP BADGE: PRINT ERROR ── */}
            <div className="err-pop-badge-container err-a1">
                <div className={`err-pop-badge ${isFestiveMode ? 'festive-pop-badge' : ''}`}>
                    <svg className="err-pop-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M32 6L4 58h56L32 6Z" fill={isFestiveMode ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)"} stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
                        <rect x="29" y="24" width="6" height="15" rx="3" fill="#fff" />
                        <circle cx="32" cy="48" r="4" fill="#fff" />
                    </svg>
                    <span className="err-pop-text">PRINT ERROR</span>
                </div>
            </div>

            {/* ── MAIN CONTENT ── */}
            <div className="err-top err-a2">
                <div className="err-greeting-row">
                    <span className={`err-hey-label ${isFestiveMode ? 'festive-hey-label' : ''}`}>HEY&nbsp;</span>
                    <span className={`err-hey-name ${isFestiveMode ? 'festive-hey-name' : ''}`}>{firstName.toUpperCase()},</span>
                </div>
                
                <div className={`err-glass-card ${isFestiveMode ? 'festive-glass-card' : ''}`}>
                    <div className={`err-card-border ${isFestiveMode ? 'festive-card-border' : ''}`} />
                    
                    {/* Festive Decorative Corner Accents (Jaali / Mandala inspired) */}
                    {isFestiveMode && (
                        <svg
                            className="festive-card-decor"
                            viewBox="0 0 1000 240"
                            preserveAspectRatio="none"
                            style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                pointerEvents: 'none',
                                zIndex: 1,
                            }}
                        >
                            <defs>
                                <linearGradient id="errPlaqueGold" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#FFF9C4" />
                                    <stop offset="30%" stopColor="#F5D061" />
                                    <stop offset="70%" stopColor="#D4973E" />
                                    <stop offset="100%" stopColor="#8E5D24" />
                                </linearGradient>
                            </defs>
                            {/* Inner delicate gold frame */}
                            <rect x="14" y="14" width="972" height="212" rx="20" fill="none" stroke="url(#errPlaqueGold)" strokeWidth="1" opacity="0.4" strokeDasharray="3 4" />
                            {/* Top-Right Corner Traditional Floral Flourish */}
                            <g transform="translate(970, 24) scale(-1, 1)" stroke="url(#errPlaqueGold)" fill="none">
                                <path d="M 0 20 L 0 6 Q 0 0 6 0 L 20 0" strokeWidth="1.5" opacity="0.6" />
                                <circle cx="5" cy="5" r="2" fill="url(#errPlaqueGold)" opacity="0.7" />
                            </g>
                            {/* Bottom-Right Corner Traditional Floral Flourish */}
                            <g transform="translate(970, 216) scale(-1, -1)" stroke="url(#errPlaqueGold)" fill="none">
                                <path d="M 0 20 L 0 6 Q 0 0 6 0 L 20 0" strokeWidth="1.5" opacity="0.6" />
                                <circle cx="5" cy="5" r="2" fill="url(#errPlaqueGold)" opacity="0.7" />
                            </g>
                        </svg>
                    )}

                    <div className="err-apology-content">
                        <p className={`err-apology-main ${isFestiveMode ? 'festive-apology-main' : ''}`}>
                            {errorMsg || 'We apologize for the inconvenience. Something went wrong while printing your document.'}
                        </p>
                        {!showRefundBanner && (
                            <p className={`err-retry-line ${isFestiveMode ? 'festive-retry-line' : ''}`}>PLEASE TRY AGAIN.</p>
                        )}
                    </div>
                </div>

                {/* ── Refund Banner ── */}
                {showRefundBanner && (
                    <div className={`err-refund-banner err-a2 ${isFestiveMode ? 'festive-refund-banner' : ''}`}>
                        <div className="err-refund-icon">💚</div>
                        <div className="err-refund-text">
                            <strong className={isFestiveMode ? 'festive-refund-title' : ''}>Refund in Progress</strong>
                            <span className={isFestiveMode ? 'festive-refund-desc' : ''}>If you were charged, your payment will be refunded within 5–7 business days.</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── AMBIENT GLOW beneath marquee ── */}
            <div className={`err-glow ${isFestiveMode ? 'festive-err-glow' : ''}`} />

            {/* ── BOTTOM SECTION ── */}
            <div className="err-bottom err-a3">
                <div className={`err-auto-return ${isFestiveMode ? 'festive-auto-return' : ''}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '22px', opacity: isFestiveMode ? 0.85 : 0.7 }}>schedule</span>
                    Returning to home in <strong style={{ color: isFestiveMode ? '#A86F2B' : (kioskId === 'CV-001' ? '#00e5ff' : '#FFD97D') }}>{countdown}s</strong>
                </div>
                <div className="err-buttons">
                    {!showRefundBanner && (
                        <button
                            className={isFestiveMode ? 'err-btn-festive-primary' : 'err-btn-white'}
                            onClick={onRetry}
                            onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
                            onPointerUp={e => (e.currentTarget.style.transform = '')}
                            onPointerLeave={e => (e.currentTarget.style.transform = '')}
                        >
                            <span className="material-symbols-outlined err-spin">refresh</span>
                            Try Again
                        </button>
                    )}
                    <button
                        className={
                            isFestiveMode
                                ? (showRefundBanner ? 'err-btn-festive-primary' : 'err-btn-festive-secondary')
                                : (showRefundBanner ? 'err-btn-white' : 'err-btn-glass')
                        }
                        onClick={onReset}
                        onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
                        onPointerUp={e => (e.currentTarget.style.transform = '')}
                        onPointerLeave={e => (e.currentTarget.style.transform = '')}
                    >
                        <span className="material-symbols-outlined">home</span>
                        Back to Home
                    </button>
                </div>
            </div>

            <style>{`
                .err-screen {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-between;
                    text-align: center;
                    overflow: hidden;
                    background: transparent;
                    padding: 42px 80px 40px;
                }

                .festive-err-screen {
                    background: transparent !important;
                }

                /* ── TOP ── */
                .err-top {
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    padding-left: 50px;
                    text-align: left;
                    gap: 20px;
                    margin-top: -35px;
                }

                .err-greeting-row {
                    display: flex;
                    align-items: baseline;
                }

                .err-hey-label, .err-hey-name {
                    font-size: 56px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    color: #fff;
                    text-transform: uppercase;
                    line-height: 1;
                }

                /* Festive Greeting Typography */
                .festive-hey-label {
                    color: #7C5A34 !important;
                    text-shadow: none !important;
                }

                .festive-hey-name {
                    color: #A86F2B !important;
                    text-decoration: underline;
                    text-decoration-color: #b47b37;
                    text-underline-offset: 6px;
                    text-shadow: none !important;
                }

                /* GLASS CARD */
                .err-glass-card {
                    position: relative;
                    max-width: 1000px;
                    background: rgba(255, 255, 255, 0.04);
                    backdrop-filter: blur(25px);
                    -webkit-backdrop-filter: blur(25px);
                    border-radius: 28px;
                    overflow: hidden;
                    box-shadow: 0 20px 80px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06);
                    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease;
                }

                /* Festive Glass Card */
                .festive-glass-card {
                    background: linear-gradient(145deg, rgba(255, 253, 247, 0.96) 0%, rgba(250, 242, 228, 0.92) 100%) !important;
                    border: 1.5px solid rgba(196, 139, 54, 0.45) !important;
                    box-shadow: 0 20px 50px rgba(74, 45, 20, 0.12), 0 4px 14px rgba(74, 45, 20, 0.06), inset 0 1px 1.5px rgba(255,255,255,0.95), inset 0 0 20px rgba(212, 151, 62, 0.07) !important;
                }

                .err-card-border {
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 8px;
                    background: linear-gradient(to bottom, #ff9d00, #ff5e00);
                    opacity: 0.8;
                }

                .festive-card-border {
                    background: linear-gradient(to bottom, #7B241C, #D4973E) !important;
                    opacity: 1 !important;
                }

                .err-apology-content {
                    position: relative;
                    z-index: 2;
                    padding: 36px 48px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .err-apology-main {
                    font-size: 42px;
                    font-weight: 500;
                    letter-spacing: -0.01em;
                    color: rgba(255, 255, 255, 0.9);
                    text-transform: none;
                    margin: 0;
                    line-height: 1.4;
                }

                .festive-apology-main {
                    color: #3C2113 !important;
                    font-weight: 600 !important;
                    font-size: 38px !important;
                    text-shadow: none !important;
                }

                .err-retry-line {
                    font-size: 42px;
                    font-weight: 800;
                    letter-spacing: 0.02em;
                    color: #fff;
                    text-transform: none;
                    margin: 0;
                    line-height: 1;
                    opacity: 1;
                }

                .festive-retry-line {
                    color: #A86F2B !important;
                    font-weight: 800 !important;
                    font-size: 36px !important;
                    text-shadow: none !important;
                }

                /* ── Refund Banner ── */
                .err-refund-banner {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    padding: 24px 40px;
                    background: linear-gradient(135deg, rgba(0, 200, 140, 0.18), rgba(0, 242, 180, 0.10));
                    border: 1.5px solid rgba(0, 230, 160, 0.45);
                    border-radius: 24px;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    box-shadow: 0 0 40px rgba(0, 200, 140, 0.18), inset 0 1px 0 rgba(255,255,255,0.08);
                    max-width: 900px;
                    animation: refund-glow-pulse 3s ease-in-out infinite;
                }

                .festive-refund-banner {
                    background: linear-gradient(135deg, rgba(255, 253, 247, 0.98), rgba(246, 241, 230, 0.95)) !important;
                    border: 1.5px solid rgba(168, 111, 43, 0.45) !important;
                    box-shadow: 0 12px 36px rgba(74, 45, 20, 0.10), inset 0 1px 0 rgba(255,255,255,0.9) !important;
                    animation: none !important;
                }

                @keyframes refund-glow-pulse {
                    0%, 100% { box-shadow: 0 0 30px rgba(0, 200, 140, 0.15), inset 0 1px 0 rgba(255,255,255,0.08); }
                    50%       { box-shadow: 0 0 60px rgba(0, 200, 140, 0.32), inset 0 1px 0 rgba(255,255,255,0.08); }
                }

                .err-refund-icon {
                    font-size: 48px;
                    flex-shrink: 0;
                    filter: drop-shadow(0 0 10px rgba(0, 230, 160, 0.6));
                }

                .festive-refund-banner .err-refund-icon {
                    filter: drop-shadow(0 2px 8px rgba(46, 125, 50, 0.35)) !important;
                }

                .err-refund-text {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    text-align: left;
                }

                .err-refund-text strong {
                    font-size: 32px;
                    font-weight: 800;
                    color: #00e6a0;
                    letter-spacing: 0.01em;
                }

                .festive-refund-title {
                    color: #2E7D32 !important;
                    text-shadow: none !important;
                }

                .err-refund-text span {
                    font-size: 26px;
                    font-weight: 400;
                    color: rgba(255, 255, 255, 0.75);
                    line-height: 1.4;
                }

                .festive-refund-desc {
                    color: #5A3D28 !important;
                    font-weight: 500 !important;
                    text-shadow: none !important;
                }

                /* ── POP BADGE ── */
                .err-pop-badge-container {
                    margin-top: 18px;
                    z-index: 5;
                    pointer-events: none;
                }

                .err-pop-badge {
                    display: flex;
                    align-items: center;
                    gap: 22px;
                    padding: 16px 40px;
                    background: linear-gradient(135deg, rgba(255, 77, 77, 0.95), rgba(255, 120, 60, 0.95));
                    border-radius: 100px;
                    box-shadow: 0 20px 60px rgba(255, 77, 77, 0.35), 0 0 0 6px rgba(255, 255, 255, 0.1);
                    animation: pop-in 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
                }

                .festive-pop-badge {
                    background: linear-gradient(135deg, #7B241C 0%, #B71C1C 50%, #8B261D 100%) !important;
                    border: 2px solid rgba(212, 151, 62, 0.65) !important;
                    box-shadow: 0 14px 40px rgba(123, 36, 28, 0.35), 0 0 0 4px rgba(212, 151, 62, 0.2) !important;
                }

                .err-pop-icon {
                    width: 36px;
                    height: 36px;
                    filter: drop-shadow(0 0 12px rgba(255,255,255,0.4));
                }

                .err-pop-text {
                    font-size: 32px;
                    font-weight: 950;
                    letter-spacing: 0.1em;
                    color: #fff;
                    text-transform: uppercase;
                    line-height: 1;
                }

                /* ── AMBIENT GLOW ── */
                .err-glow {
                    position: absolute;
                    top: calc(50% + 60px);
                    left: 50%;
                    transform: translateX(-50%);
                    width: 700px;
                    height: 180px;
                    background: radial-gradient(ellipse at center, rgba(255, 160, 50, 0.1) 0%, transparent 70%);
                    pointer-events: none;
                    z-index: 5;
                    opacity: 0.8;
                }

                .festive-err-glow {
                    background: radial-gradient(ellipse at center, rgba(180, 123, 55, 0.12) 0%, transparent 70%) !important;
                }

                /* ── BOTTOM ── */
                .err-bottom {
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 24px;
                    margin-bottom: 40px;
                }

                .err-auto-return {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 22px;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.55);
                    letter-spacing: 0.01em;
                }

                .festive-auto-return {
                    color: #7C5A34 !important;
                    font-weight: 600 !important;
                }

                /* ── Entry animations ── */
                .err-a1 { animation: err-reveal 0.9s cubic-bezier(0.16,1,0.3,1) both 0.1s; }
                .err-a2 { animation: err-reveal 0.9s cubic-bezier(0.16,1,0.3,1) both 0.4s; }
                .err-a3 { animation: err-reveal 0.9s cubic-bezier(0.16,1,0.3,1) both 0.7s; }

                @keyframes err-reveal {
                    0%   { opacity: 0; transform: translateY(24px); filter: blur(6px); }
                    100% { opacity: 1; transform: translateY(0);    filter: blur(0); }
                }

                /* ── Buttons ── */
                .err-buttons {
                    display: flex;
                    align-items: center;
                    gap: 90px;
                }

                /* White solid pill (Standard mode) */
                .err-btn-white {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 26px 85px;
                    border-radius: 50px;
                    border: none;
                    background: #ffffff;
                    color: #0e3a6e;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 26px;
                    font-weight: 800;
                    letter-spacing: 0.01em;
                    cursor: pointer;
                    box-shadow: 0 12px 50px rgba(0,0,0,0.25);
                    transition: transform 0.1s cubic-bezier(0.16, 1, 0.3, 1);
                    touch-action: manipulation;
                }

                /* Glass ghost pill (Standard mode) */
                .err-btn-glass {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 26px 70px;
                    border-radius: 50px;
                    border: 2px solid rgba(255,255,255,0.28);
                    background: rgba(255,255,255,0.09);
                    color: #ffffff;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 26px;
                    font-weight: 700;
                    letter-spacing: 0.01em;
                    cursor: pointer;
                    backdrop-filter: blur(30px);
                    -webkit-backdrop-filter: blur(30px);
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 20px rgba(0,0,0,0.15);
                    transition: transform 0.1s cubic-bezier(0.16, 1, 0.3, 1);
                    touch-action: manipulation;
                }

                /* Festive Primary Button (Rich Gold / Mahogany Gradient) */
                .err-btn-festive-primary {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 24px 75px;
                    border-radius: 50px;
                    border: none;
                    background: linear-gradient(135deg, #4b2d1d, #b47b37);
                    color: #fff8e9;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 24px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    cursor: pointer;
                    box-shadow: 0 16px 45px rgba(180, 123, 55, 0.35), inset 0 1px 2px rgba(255,255,255,0.3);
                    transition: transform 0.1s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
                    touch-action: manipulation;
                }

                /* Festive Secondary Button (Warm Antique Parchment / Gold Outline) */
                .err-btn-festive-secondary {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 24px 65px;
                    border-radius: 50px;
                    border: 2px solid rgba(168, 111, 43, 0.45);
                    background: rgba(255, 253, 248, 0.95);
                    color: #3C2113;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 24px;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    cursor: pointer;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    box-shadow: 0 8px 24px rgba(74, 45, 20, 0.1), inset 0 1px 2px rgba(255,255,255,0.9);
                    transition: transform 0.1s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
                    touch-action: manipulation;
                }

                .err-spin {
                    animation: err-icon-spin 2s linear infinite;
                }

                @keyframes err-icon-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};
