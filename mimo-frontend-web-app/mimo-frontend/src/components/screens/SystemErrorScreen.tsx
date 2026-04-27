import React from 'react';

interface SystemErrorScreenProps {
    isActive: boolean;
    jobData: {
        userName: string;
        fileName: string;
        pages: number;
    } | null;
    onReset: () => void;
    onRetry: () => void;
}

export const SystemErrorScreen: React.FC<SystemErrorScreenProps> = ({ isActive, jobData, onReset, onRetry }) => {
    const firstName = jobData?.userName?.split(' ')[0] || 'there';

    return (
        <div 
            className={`screen err-screen ${isActive ? 'visible' : ''}`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >

            <div className="err-pop-badge-container err-a1">
                <div className="err-pop-badge">
                    <svg className="err-pop-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M32 6L4 58h56L32 6Z" fill="rgba(255,255,255,0.1)" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
                        <rect x="29" y="24" width="6" height="15" rx="3" fill="#fff" />
                        <circle cx="32" cy="48" r="4" fill="#fff" />
                    </svg>
                    <span className="err-pop-text">PRINT ERROR</span>
                </div>
            </div>

            {/* ── MAIN CONTENT ── */}
            <div className="err-top err-a2">
                <div className="err-greeting-row">
                    <span className="err-hey-label">HEY&nbsp;</span>
                    <span className="err-hey-name">{firstName.toUpperCase()},</span>
                </div>
                
                <div className="err-glass-card">
                    <div className="err-card-border" />
                    <div className="err-apology-content">
                        <p className="err-apology-main">We apologize for the inconvenience. Something went wrong while printing your document.</p>
                        <p className="err-retry-line">PLEASE TRY AGAIN.</p>
                    </div>
                </div>
            </div>


            {/* ── WARM AMBIENT GLOW beneath marquee ── */}
            <div className="err-glow" />

            {/* ── BOTTOM SECTION ── */}
            <div className="err-bottom err-a3">
                <div className="err-buttons">
                    <button
                        className="err-btn-white"
                        onClick={onRetry}
                        onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
                        onPointerUp={e => (e.currentTarget.style.transform = '')}
                        onPointerLeave={e => (e.currentTarget.style.transform = '')}
                    >
                        <span className="material-symbols-outlined err-spin">refresh</span>
                        Try Again
                    </button>
                    <button
                        className="err-btn-glass"
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


                .err-card-border {
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 8px;
                    background: linear-gradient(to bottom, #ff9d00, #ff5e00);
                    opacity: 0.8;
                }

                .err-apology-content {
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


                /* ── WARM GLOW beneath marquee ── */
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

                @keyframes amber-pulse {
                    0%, 100% { border-color: rgba(255, 180, 60, 0.85); }
                    50%       { border-color: rgba(255, 210, 100, 1); }
                }

                /* ── BOTTOM ── */
                .err-bottom {
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 40px;
                    margin-bottom: 40px;
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

                /* White solid pill */
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

                /* Glass ghost pill */
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
