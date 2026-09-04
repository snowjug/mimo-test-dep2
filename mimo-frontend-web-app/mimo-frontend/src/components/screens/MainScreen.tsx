// Deploy trigger: 2026-07-03 botanical redesign
import React, { useState, useRef, useEffect } from 'react';

interface MainScreenProps {
    onNext: () => void;
    isActive: boolean;
    kioskId?: string | null;
}

export const MainScreen: React.FC<MainScreenProps> = ({ onNext, isActive, kioskId }) => {
    const isCV001 = kioskId === 'CV-001';
    const [isDragging, setIsDragging] = useState(false);
    const [dragX, setDragX] = useState(0);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const dragStartX = useRef<number>(0);
    const dragStartThumbX = useRef<number>(0);
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);

    const TRACK_PADDING = 8;

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (isUnlocked) return;
        const isPortrait = window.innerWidth <= 1000;
        let startVal = 0;
        if ('touches' in e) {
            startVal = isPortrait ? e.touches[0].clientY : e.touches[0].clientX;
        } else {
            const mouseEvent = e as React.MouseEvent;
            startVal = isPortrait ? mouseEvent.clientY : mouseEvent.clientX;
        }
        dragStartX.current = startVal;
        dragStartThumbX.current = dragX;
        setIsDragging(true);
    };

    const handleDragEnd = () => {
        if (isUnlocked) return;
        setIsDragging(false);
        setDragX(0);
    };

    useEffect(() => {
        const handleDragMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging || isUnlocked || !trackRef.current) return;

            const isPortrait = window.innerWidth <= 1000;
            let currentVal = 0;
            if ('touches' in e) {
                currentVal = isPortrait ? e.touches[0].clientY : e.touches[0].clientX;
            } else {
                currentVal = isPortrait ? (e as MouseEvent).clientY : (e as MouseEvent).clientX;
            }

            const trackRect = trackRef.current.getBoundingClientRect();
            const thumbWidth = thumbRef.current ? thumbRef.current.offsetWidth : 360;
            const trackWidth = isPortrait ? trackRect.height : trackRect.width;
            const maxDragX = trackWidth - thumbWidth - (TRACK_PADDING * 2);

            const dx = isPortrait ? (dragStartX.current - currentVal) : (currentVal - dragStartX.current);
            let newX = dragStartThumbX.current + dx;

            if (newX < 0) newX = 0;
            if (newX > maxDragX) newX = maxDragX;

            setDragX(newX);

            if (newX >= maxDragX * 0.90) {
                setIsUnlocked(true);
                setIsDragging(false);
                setDragX(maxDragX);

                if (navigator.vibrate) navigator.vibrate(50);

                setTimeout(() => {
                    onNext();
                    setTimeout(() => {
                        setIsUnlocked(false);
                        setDragX(0);
                    }, 500);
                }, 600);
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchmove', handleDragMove, { passive: false });
            window.addEventListener('touchend', handleDragEnd);
        } else {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging, isUnlocked, onNext]);

    return (
        <div
            className={`screen main-interface-wrap ${isActive ? 'visible' : ''} ${isCV001 ? 'cv001-main' : ''}`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            {/* Botanical background */}
            <div className="kiosk-bg" />

            {/* Ambient warm glows */}
            <div className="ambient-glow glow-1" />
            <div className="ambient-glow glow-2" />
            <div className="ambient-glow glow-3" />

            {/* Oversized watermark */}
            <div className="watermark-mimo">MIMO</div>

            <main className="immersive-container">
                <section className="brand-panel">

                    <div style={{ opacity: 0.88, transform: 'translateY(2px)' }}>
                        <p className="tag-line">— WELCOME TO —</p>
                    </div>

                    <div className="main-heading">
                        <svg width="820" height="180" viewBox="0 0 820 180" style={{ overflow: 'visible', filter: isCV001 ? 'drop-shadow(0 16px 28px rgba(74, 45, 20, 0.35))' : 'drop-shadow(0 10px 22px rgba(80,40,0,0.38))' }}>
                            <defs>
                                <linearGradient id="mimoBotanicalGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#ffd97d" />
                                    <stop offset="100%" stopColor="#b78c43" />
                                </linearGradient>
                                <linearGradient id="mimoCyberGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%"   stopColor="#ffffff" />
                                    <stop offset="100%" stopColor="#e3f2ff" />
                                </linearGradient>
                                <linearGradient id="mimoCv001Grad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#3c2113" />
                                    <stop offset="48%" stopColor="#a86f2b" />
                                    <stop offset="100%" stopColor="#e7bd68" />
                                </linearGradient>
                            </defs>

                            {/* 3D shadow layer */}
                            <text
                                x="50%" y="52%"
                                dominantBaseline="middle"
                                textAnchor="middle"
                                fill={isCV001 ? 'rgba(67, 38, 18, 0.28)' : 'rgba(80,40,0,0.45)'}
                                transform="translate(5, 18)"
                                style={{
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontSize: '155px',
                                    fontWeight: 900,
                                    letterSpacing: '4px'
                                }}
                            >
                                MIMO<tspan dx="15" dy="-60" fontSize="60px" fontWeight="800">{isCV001 ? '1.0' : '2.0'}</tspan>
                            </text>

                            {/* Main text */}
                            <text
                                x="50%" y="52%"
                                dominantBaseline="middle"
                                textAnchor="middle"
                                fill={isCV001 ? 'url(#mimoCv001Grad)' : 'url(#mimoBotanicalGrad)'}
                                stroke={isCV001 ? 'none' : 'rgba(255,255,255,0.35)'}
                                strokeWidth={isCV001 ? '0' : '1.5'}
                                paintOrder="stroke fill"
                                transform="translate(0, 12)"
                                style={{
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontSize: '155px',
                                    fontWeight: 900,
                                    letterSpacing: '4px'
                                }}
                            >
                                MIMO<tspan dx="15" dy="-60" fontSize="60px" fontWeight="800">{isCV001 ? '1.0' : '2.0'}</tspan>
                            </text>
                        </svg>
                    </div>

                    <div className="sub-heading-wrap">
                        <h2 className="sub-heading">
                            Self-Service <span className={isCV001 ? "cv001-gold-text" : "cyan-text"}>Printing Kiosk</span>
                        </h2>
                    </div>
                    <p className="brand-desc">Fast, secure document printing via Mimo code.</p>
                </section>

                <section className="action-panel">
                    <div
                        className={`swipe-track-glass ${isUnlocked ? 'unlocked' : ''} ${isCV001 ? 'cv001-track' : ''}`}
                        ref={trackRef}
                    >
                        <div className="glass-reflection" />

                        {/* Progress fill */}
                        <div
                            className={`swipe-fill ${isCV001 ? 'cv001-swipe-fill' : ''}`}
                            style={{
                                width: dragX + (thumbRef.current?.offsetWidth || 360) / 2 + TRACK_PADDING + 'px',
                                transition: isDragging ? 'none' : 'width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                                opacity: dragX > 0 ? 1 : 0
                            }}
                        />

                        {/* Shimmer chevrons */}
                        <div
                            className="swipe-right-text"
                            style={{
                                opacity: Math.max(0, 1 - (dragX / 150)),
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}
                        >
                            <div className={`shimmer-chevrons-container ${isCV001 ? 'cv001-chevrons' : ''}`}>
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <span
                                        key={i}
                                        className="material-symbols-outlined"
                                        style={{ margin: '0 -22px', fontVariationSettings: '"wght" 300' }}
                                    >
                                        chevron_right
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Draggable thumb */}
                        <div
                            className={`swipe-pill-thumb ${isDragging ? 'dragging' : ''} ${isCV001 ? 'cv001-thumb' : ''}`}
                            ref={thumbRef}
                            style={{
                                transform: `translateX(${dragX}px)`,
                                transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                            }}
                            onMouseDown={handleDragStart}
                            onTouchStart={handleDragStart}
                        >
                            <span className="thumb-text">
                                {isUnlocked ? 'UNLOCKED' : 'SWIPE TO START'}
                            </span>
                            <div className="arrow-circle">
                                <span
                                    className="material-symbols-outlined"
                                    style={{ color: isUnlocked ? '#4CAF50' : (isCV001 ? '#a66d2b' : '') }}
                                >
                                    {isUnlocked ? 'check' : 'arrow_forward'}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="kiosk-footer" style={{ position: 'relative', zIndex: 10 }}>
                Crafted with innovation by <strong>Md Huzaif, Rathin &amp; Atharv.</strong><br />
                &copy; 2026 <strong>VisionPrintt</strong>. All rights reserved.
            </footer>
        </div>
    );
};
