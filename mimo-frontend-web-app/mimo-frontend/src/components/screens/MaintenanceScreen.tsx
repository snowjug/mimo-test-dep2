import React, { useState, useRef } from 'react';

interface MaintenanceScreenProps {
    isActive: boolean;
    onReset: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ isActive, onReset }) => {
    const [adminCounter, setAdminCounter] = useState(0);
    const resetTimerRef = useRef<number | null>(null);

    // Hidden Admin Reset: 5 taps on the screen resets the machine
    const handleAdminTap = () => {
        setAdminCounter(prev => {
            const next = prev + 1;
            if (next >= 6) { // Increased to 6 for the whole-screen tap
                onReset();
                return 0;
            }
            return next;
        });

        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = window.setTimeout(() => {
            setAdminCounter(0);
            resetTimerRef.current = null;
        }, 2000);
    };

    const [ripples, setRipples] = useState<{ id: number; x: number; y: number; scale: number }[]>([]);
    const rippleIdRef = useRef(0);

    const handleScreenTouch = (e: React.PointerEvent) => {
        const id = rippleIdRef.current++;
        const x = e.clientX;
        const y = e.clientY;
        const powerScale = 1 + (adminCounter * 0.2);
        
        setRipples(prev => [...prev, { id, x, y, scale: powerScale }]);
        
        // Cleanup ripple after animation
        setTimeout(() => {
            setRipples(prev => prev.filter(r => r.id !== id));
        }, 800);

        handleAdminTap();
    };

    return (
        <div 
            className={`screen maint-screen ${isActive ? 'visible' : ''}`}
            onPointerDown={handleScreenTouch}
            style={{ touchAction: 'none', display: isActive ? 'flex' : 'none' }}
        >
            {/* ── Ripple Container ── */}
            {ripples.map(r => (
                <div 
                    key={r.id}
                    className="maint-touch-ripple"
                    style={{ 
                        left: r.x, 
                        top: r.y, 
                        transform: `translate(-50%, -50%) scale(${r.scale})` 
                    }} 
                />
            ))}
            {/* ── BACKGROUND LIGHT LEAK ── */}
            <div className="maint-light-leak" />
            
            {/* ── MAIN CONTENT ── */}
            <div className="maint-content">
                <div className="maint-status-group">
                    <div className="maint-glass-line">
                        <div className="maint-scanner-point" />
                    </div>
                    
                    <div className="maint-headline-container">
                        <span className="material-symbols-outlined maint-warning-icon">report_problem</span>
                        <h1 className="maint-main-headline">
                            TEMPORARILY<br />OUT OF SERVICE
                        </h1>
                    </div>

                    <div className="maint-glass-line">
                        <div className="maint-scanner-point" style={{ animationDirection: 'reverse', animationDelay: '-2s' }} />
                    </div>
                </div>
            </div>



            <style>{`
                .maint-screen {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    background: transparent;
                    overflow: hidden;
                }

                /* ── CINEMATIC LIGHTING (Static for efficiency) ── */
                .maint-light-leak {
                    position: absolute;
                    top: -20%;
                    left: -20%;
                    width: 140%;
                    height: 140%;
                    background: radial-gradient(circle at center, rgba(255, 183, 77, 0.05) 0%, transparent 60%);
                    filter: blur(100px);
                    pointer-events: none;
                }

                .maint-content {
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    animation: maint-reveal 1.8s cubic-bezier(0.16, 1, 0.3, 1) both;
                }

                @keyframes maint-reveal {
                    0% { opacity: 0; transform: translateY(20px) scale(0.98); filter: blur(20px); }
                    100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
                }

                /* ── REFINED TYPOGRAPHY ── */
                .maint-content {
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    animation: maint-reveal 1.8s cubic-bezier(0.16, 1, 0.3, 1) both;
                    width: 100%;
                }

                .maint-headline-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 40px;
                    margin: 60px 0;
                }

                .maint-warning-icon {
                    font-size: 150px;
                    color: #FFB74D;
                    text-shadow: 0 0 50px rgba(255, 183, 77, 0.4);
                }

                .maint-main-headline {
                    font-size: 92px;
                    font-weight: 900;
                    letter-spacing: 0.15em;
                    color: #ffffff;
                    text-transform: uppercase;
                    margin: 0;
                    line-height: 1.1;
                    text-shadow: 0 0 30px rgba(255, 255, 255, 0.25), 0 10px 40px rgba(0,0,0,0.6);
                    filter: drop-shadow(0 20px 50px rgba(0,0,0,0.5));
                    text-align: center;
                }

                .maint-status-group {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                    width: 1000px;
                    max-width: 95%;
                }

                /* ── STATUS LINE ── */
                .maint-glass-line {
                    position: relative;
                    width: 100%;
                    height: 2px;
                    background: linear-gradient(90deg, transparent, rgba(255, 183, 77, 0.2), transparent);
                    overflow: hidden;
                    border-radius: 4px;
                }

                .maint-scanner-point {
                    position: absolute;
                    top: 0;
                    left: 20%;
                    width: 600px;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255, 183, 77, 0.4), transparent);
                    filter: drop-shadow(0 0 15px #FFB74D);
                    opacity: 0.5;
                }

                /* ── TOUCH FEEDBACK ── */
                .maint-screen {
                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                }

                .maint-touch-ripple {
                    position: fixed;
                    width: 15px;
                    height: 15px;
                    border-radius: 50%;
                    background: rgba(255, 183, 77, 0.4);
                    box-shadow: 0 0 40px #FFB74D, 0 0 80px rgba(255, 183, 77, 0.3);
                    pointer-events: none;
                    z-index: 99;
                    transform: translate(-50%, -50%) scale(0);
                    animation: ripple-out 0.8s cubic-bezier(0.1, 0.5, 0.2, 1) forwards;
                }

                @keyframes ripple-out {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.8; }
                    100% { transform: translate(-50%, -50%) scale(25); opacity: 0; }
                }

                /* ── PRESS FEEDBACK ── */
                .maint-screen:active .maint-main-headline {
                    transform: scale(0.99);
                    filter: brightness(1.1);
                    transition: transform 0.1s;
                }
            `}</style>
        </div>
    );
};
