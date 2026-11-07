import React, { useState, useRef } from 'react';
import { DiwaliBackdrop, DiwaliDiya, DiwaliGoldDivider, DiwaliMandala } from '../festive/DiwaliDecor';

interface MaintenanceScreenProps {
    isActive: boolean;
    onReset: () => void;
    kioskId?: string;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ isActive, onReset, kioskId }) => {
    const isCV001 = kioskId === 'CV-001';
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

    if (isCV001) {
  if (!isActive) return null;

  return (
    <div
      className="screen visible maint-screen absolute inset-0 flex h-full w-full flex-col items-center justify-center select-none overflow-hidden bg-[#FAF4E8]"
      onPointerDown={handleScreenTouch}
      style={{ touchAction: 'none' }}
    >
      {/* Warm Cream and Gold Diwali Canvas */}
      <DiwaliBackdrop showRangoli={true} />

      {/* Subtle festive mandala watermark */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.12] select-none">
        <DiwaliMandala size={680} spin={false} />
      </div>

      {/* Touch Ripple Animations */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="maint-touch-ripple pointer-events-none absolute rounded-full border border-[#D4AF37]/60 bg-[#D4AF37]/15"
          style={{
            left: r.x,
            top: r.y,
            width: '60px',
            height: '60px',
            transform: `translate(-50%, -50%) scale(${r.scale})`,
            animation: 'maint-ripple-expand 0.8s ease-out forwards',
          }}
        />
      ))}

      {/* Main Elevated Notice Card */}
      <div className="relative z-10 flex max-w-[760px] flex-col items-center justify-center rounded-[36px] border-2 border-[#D4AF37]/50 bg-white/90 px-16 py-14 text-center shadow-[0_24px_60px_rgba(80,50,20,0.10),0_0_30px_rgba(212,175,55,0.12)] backdrop-blur-xl">
        {/* Glowing Diya above status */}
        <div className="mb-4">
          <DiwaliDiya size={48} lit={true} />
        </div>

        <p className="font-sans text-[15px] font-extrabold uppercase tracking-[0.28em] text-[#9A6D24]">
          MIMO 1.0 &bull; KIOSK STATUS
        </p>

        <h1 className="mt-3 font-serif text-[52px] font-bold leading-[1.1] tracking-tight text-[#2D1E12]">
          TEMPORARILY<br />OUT OF SERVICE
        </h1>

        <div className="my-6">
          <DiwaliGoldDivider width={180} />
        </div>

        <p className="max-w-[540px] text-[20px] font-medium leading-relaxed text-[#6E5A4B]">
          We are currently refilling paper supplies and performing scheduled maintenance.
          <br />
          <strong className="text-[#2D1E12]">Please check back shortly.</strong>
        </p>
      </div>

      <style>{`
        @keyframes maint-ripple-expand {
          0% { opacity: 0.8; transform: translate(-50%, -50%) scale(0.2); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(3.5); }
        }
      `}</style>
    </div>
  );
    }

    return (
        <div 
            className={`screen maint-screen ${isActive ? 'visible' : ''}`}
            onPointerDown={handleScreenTouch}
            style={{ touchAction: 'none', display: isActive ? 'flex' : 'none' }}
        >
            {/* Botanical background only on standard kiosk */}
            {!isCV001 && <div className="kiosk-bg" style={{ filter: 'brightness(0.85)' }} />}
            <div className="ambient-glow glow-1" />
            <div className="ambient-glow glow-2" />

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
