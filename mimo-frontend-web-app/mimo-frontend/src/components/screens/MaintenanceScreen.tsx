import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Wrench } from '@phosphor-icons/react';

interface MaintenanceScreenProps {
    isActive: boolean;
    onReset: () => void;
    kioskId?: string;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ isActive, onReset }) => {
    const [adminCounter, setAdminCounter] = useState(0);
    const resetTimerRef = useRef<number | null>(null);

    // Hidden Admin Reset: 6 taps on the screen resets the machine
    const handleAdminTap = () => {
        setAdminCounter(prev => {
            const next = prev + 1;
            if (next >= 6) {
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
        const powerScale = 1 + adminCounter * 0.2;

        setRipples(prev => [...prev, { id, x, y, scale: powerScale }]);

        setTimeout(() => {
            setRipples(prev => prev.filter(r => r.id !== id));
        }, 800);

        handleAdminTap();
    };

    return (
        <div
            className={`screen ${isActive ? 'visible' : ''} flex h-full select-none flex-col items-center justify-center overflow-hidden bg-[#FAFAF8] text-center`}
            onPointerDown={handleScreenTouch}
            style={{ touchAction: 'none', display: isActive ? 'flex' : 'none' }}
        >
            <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px]"
                style={{ background: 'radial-gradient(closest-side, rgba(217,165,68,0.12), transparent)' }}
            />

            {ripples.map(r => (
                <span
                    key={r.id}
                    className="pointer-events-none fixed z-50 h-4 w-4 rounded-full bg-gold-500/40 shadow-[0_0_40px_#d9a544]"
                    style={{
                        left: r.x,
                        top: r.y,
                        transform: `translate(-50%, -50%) scale(${r.scale})`,
                        animation: 'kiosk-ripple 0.8s cubic-bezier(0.1,0.5,0.2,1) forwards',
                    }}
                />
            ))}

            <motion.div
                initial={isActive ? { opacity: 0, y: 18, filter: 'blur(16px)' } : false}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-11 px-10"
            >
                <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-500/35 to-transparent" />

                <div className="flex flex-col items-center gap-10">
                    <span className="flex h-32 w-32 items-center justify-center rounded-full bg-gold-500/15 text-gold-600 shadow-md">
                        <Wrench size={72} weight="regular" />
                    </span>
                    <h1 className="text-[70px] font-black uppercase leading-[1.1] tracking-[0.1em] text-[#1A1714]">
                        Temporarily
                        <br />
                        <span className="text-gold-600">Out of Service</span>
                    </h1>
                </div>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-gold-500/35 to-transparent" />
            </motion.div>

            <style>{`
                @keyframes kiosk-ripple {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0.8; }
                    100% { transform: translate(-50%, -50%) scale(25); opacity: 0; }
                }
            `}</style>
        </div>
    );
};
