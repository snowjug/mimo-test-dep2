import React, { useEffect, useRef, useState } from 'react';

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
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({ isActive, onReset, jobData }) => {
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
            className={`screen summary-wrapper ${isActive ? 'visible' : ''}`}
            key={renderKey}
            style={{
                display: isActive ? 'flex' : 'none',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                position: 'relative',
                padding: '0 80px 100px 80px' // Added bottom padding for the button
            }}
        >
            {/* NEW Global Top Header: Conversational Success */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '20px',
                animation: isActive ? 'fadeInUp 0.8s ease-out forwards' : 'none',
                opacity: 0,
                transform: 'translateY(-40px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span className="material-symbols-outlined" style={{ color: '#34d399', fontSize: '28px' }}>check_circle</span>
                    <span style={{ fontSize: '18px', color: '#34d399', fontWeight: 800, letterSpacing: '4px', textTransform: 'uppercase' }}>
                        Success!
                    </span>
                </div>
                <div style={{ fontSize: '48px', fontWeight: 900, color: '#ffffff', letterSpacing: '-1px', textShadow: '0 10px 30px rgba(0,0,0,0.5)', textAlign: 'center' }}>
                    <span style={{ color: '#34d399', textTransform: 'uppercase' }}>{jobData?.userName?.split(' ')[0] || 'John'}</span>, your documents are ready.
                </div>
            </div>

            {/* Middle Section: Centered Animation */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
                alignItems: 'center',
                transform: 'translateY(-50px)' // Shifted slightly more upwards
            }}>

                {/* ── RIGHT: Collection Guide Animation ── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'scale(0.95)', transformOrigin: 'center' }}>
                    <div style={{
                        position: 'relative', width: '380px', height: '350px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        marginTop: '20px'
                    }}>
                        {/* 1. Slit Interior (Dark Void) */}
                        <div style={{
                            position: 'absolute', top: '55px', width: '330px', height: '90px',
                            background: 'linear-gradient(180deg, #020202 0%, #1a1a1a 100%)',
                            boxShadow: 'inset 0 10px 20px rgba(0,0,0,1)',
                            zIndex: 1,
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            {/* The white flat bottom shelf inside the slit */}
                            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: '14px', background: '#f1f5f9', borderTop: '2px solid #94a3b8' }}></div>
                            <div style={{ position: 'absolute', bottom: '14px', width: '100%', height: '15px', background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}></div>
                        </div>

                        {/* 2. Wooden Frame (using natural wood block colors from realistic reference) */}
                        {/* Top piece */}
                        <div style={{
                            position: 'absolute', top: '30px', left: '0px', width: '380px', height: '25px',
                            background: '#daba94', zIndex: 10,
                            boxShadow: '0 5px 15px rgba(0,0,0,0.6)', borderRadius: '3px 3px 0 0',
                            borderBottom: '1px solid #9a7b50'
                        }}></div>
                        {/* Bottom piece */}
                        <div style={{
                            position: 'absolute', top: '145px', left: '0px', width: '380px', height: '25px',
                            background: '#ceaa7b', zIndex: 2,
                            boxShadow: '0 15px 30px rgba(0,0,0,0.8)', borderRadius: '0 0 3px 3px',
                            borderTop: '1px solid #8e6c40'
                        }}></div>
                        {/* Left piece */}
                        <div style={{
                            position: 'absolute', top: '55px', left: '0px', width: '25px', height: '90px',
                            background: '#d1a870', zIndex: 10,
                            boxShadow: '4px 0 15px rgba(0,0,0,0.7)',
                            borderRight: '1px solid #9a7b50'
                        }}></div>
                        {/* Right piece */}
                        <div style={{
                            position: 'absolute', top: '55px', left: '355px', width: '25px', height: '90px',
                            background: '#d1a870', zIndex: 10,
                            boxShadow: '-4px 0 15px rgba(0,0,0,0.7)',
                            borderLeft: '1px solid #9a7b50'
                        }}></div>

                        {/* 3. Paper Clipping Wrapper */}
                        <div style={{
                            position: 'absolute', top: '55px', left: '0', width: '380px', height: '350px',
                            overflow: 'hidden', zIndex: 5, pointerEvents: 'none',
                        }}>
                            {/* The Animated Paper */}
                            <div style={{
                                width: '250px', height: '300px', background: '#ffffff',
                                margin: '0 auto', 
                                borderRadius: '2px', 
                                boxShadow: '0 20px 40px rgba(0,0,0,0.5)', 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px',
                                animation: isActive ? 'paperDispenseHand 6s ease-in-out infinite' : 'none',
                                transformOrigin: 'top center'
                            }}>
                                 <div style={{ width: '55px', height: '55px', borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', border: '2px solid rgba(52,211,153,0.4)', color: '#10b981' }}>
                                      <span className="material-symbols-outlined" style={{ fontSize: '36px', fontWeight: 800 }}>check</span>
                                 </div>
                                 <div style={{ width: '90%', height: '10px', background: '#cbd5e1', borderRadius: '5px', marginBottom: '18px' }}></div>
                                 <div style={{ width: '75%', height: '10px', background: '#cbd5e1', borderRadius: '5px', marginBottom: '18px' }}></div>
                                 <div style={{ width: '60%', height: '10px', background: '#cbd5e1', borderRadius: '5px' }}></div>
                                 <div style={{ width: '100%', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 10px', paddingBottom: '10px' }}>
                                     <div style={{ width: '45px', height: '45px', border: '3px dashed #94a3b8', borderRadius: '6px' }}></div>
                                     <div style={{ width: '80px', height: '8px', background: '#e2e8f0', borderRadius: '4px' }}></div>
                                 </div>
                            </div>
                        </div>

                        {/* 4. Hand Graphic */}
                        <div style={{
                            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
                            zIndex: 20, pointerEvents: 'none'
                        }}>
                            <div style={{
                                position: 'absolute', top: '0', left: '50%',
                                animation: isActive ? 'handGrabAction 6s cubic-bezier(0.4, 0, 0.2, 1) infinite' : 'none',
                                transformOrigin: 'top center'
                            }}>
                                <span className="material-symbols-outlined" style={{ 
                                    fontSize: '150px', 
                                    color: '#dea370', 
                                    /* Use the solid variation of the icon for realistic volume */
                                    fontVariationSettings: '"FILL" 1, "wght" 400',
                                    filter: 'drop-shadow(0 20px 25px rgba(0,0,0,0.7))',
                                }}>
                                    back_hand
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom-Centered Done Button & Message Area */}
            <div style={{
                position: 'absolute',
                bottom: '40px',
                left: '0',
                right: '0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px', // Decreased space between elements
                zIndex: 100
            }}>
                <div style={{
                    fontSize: '22px', // Slightly smaller text
                    fontWeight: 900,
                    color: '#34d399',
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    animation: isActive ? 'fadeInUp 1s ease-out 0.3s forwards' : 'none',
                    opacity: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    textShadow: '0 0 20px rgba(52,211,153,0.4)' // Added glow for extra visibility
                }}>
                    <span className="material-symbols-outlined" style={{ animation: 'bounce 2s infinite' }}>south</span>
                    Please collect your documents from below
                    <span className="material-symbols-outlined" style={{ animation: 'bounce 2s infinite' }}>south</span>
                </div>

                <button
                    className="done-button-dynamic"
                    style={{
                        padding: '0 50px', height: '64px', borderRadius: '32px',
                        background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none',
                        fontSize: '20px', fontWeight: 900, letterSpacing: '4px',
                        textTransform: 'uppercase', cursor: 'pointer',
                        boxShadow: '0 20px 50px rgba(16,185,129,0.4), inset 0 1px 2px rgba(255,255,255,0.4)',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        animation: isActive ? 'fadeInUp 1s ease-out 0.5s forwards' : 'none',
                        opacity: 0
                    }}
                    onClick={onReset}
                    onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(16,185,129,0.2)'; }}
                    onPointerUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 20px 50px rgba(16,185,129,0.4)'; }}
                >
                    Done
                    <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>check_circle</span>
                </button>
            </div>

            <style>{`
                @keyframes fadeInUp {
                    0% { opacity: 0; transform: translateY(40px); }
                    100% { opacity: 1; transform: translateY(0); }
                }

                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }

                .done-button-dynamic:hover {
                    box-shadow: 0 0 30px rgba(16,185,129,0.5);
                    transform: translateY(-2px);
                }

                @keyframes paperDispenseHand {
                    0%, 5% { transform: translateY(-320px); opacity: 1; }
                    25%, 35% { transform: translateY(0px) rotate(0deg) skewX(0deg); opacity: 1; filter: brightness(1); }
                    41% { transform: translateY(0px) rotate(0deg) skewX(0deg); opacity: 1; filter: brightness(0.9); }
                    50% { transform: translateY(80px) rotate(-2deg) skewX(-3deg); opacity: 1; filter: brightness(0.9); }
                    60% { transform: translateY(300px) rotate(-6deg) skewX(-6deg); opacity: 0; filter: brightness(0.9); }
                    100% { transform: translateY(300px); opacity: 0; }
                }

                @keyframes handGrabAction {
                    0%, 25% { transform: translate(-50%, 350px); opacity: 0; filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
                    35% { transform: translate(-50%, 140px) scale(1.05); opacity: 1; filter: drop-shadow(0 40px 30px rgba(0,0,0,0.5)) brightness(1.1); }
                    41% { transform: translate(-50%, 150px) scale(0.95); opacity: 1; filter: drop-shadow(0 5px 10px rgba(0,0,0,0.8)) brightness(0.9); }
                    50% { transform: translate(-50%, 230px) scale(0.95); opacity: 1; filter: drop-shadow(0 8px 15px rgba(0,0,0,0.7)) brightness(0.9); }
                    60% { transform: translate(-50%, 450px) scale(0.95); opacity: 0; filter: drop-shadow(0 15px 25px rgba(0,0,0,0.6)) brightness(0.95); }
                    100% { transform: translate(-50%, 450px) scale(0.95); opacity: 0; }
                }
            `}</style>
        </div>
    );
};
