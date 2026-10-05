import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, CaretRight } from '@phosphor-icons/react';
import { DiyaRow, FestiveBackdrop, Kalash, Lotus, Mandala, OrnamentDivider, Toran, ZariBorder } from '../festive/NavaratriDecor';
import { isFestivalActive } from '../../config/festivalConfig';
import { MimoCharacter3D } from '../3d/MimoCharacter3D';

interface MainScreenProps {
    onNext: () => void;
    isActive: boolean;
    kioskId?: string | null;
}

export const MainScreen: React.FC<MainScreenProps> = ({ onNext, isActive, kioskId }) => {
    const isFestiveMode = kioskId === 'CV-001' || (kioskId === 'SV-002' && isFestivalActive());
    const isSV002 = kioskId === 'SV-002';
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

    const thumbWidth = thumbRef.current?.offsetWidth || 340;
    const fillWidth = dragX + thumbWidth / 2 + TRACK_PADDING;

    const swipeTrack = (
        <div className={`relative z-10 ${isFestiveMode ? 'px-16 pb-4' : 'px-10 pb-10'}`}>
            <div
                ref={trackRef}
                className={`relative h-[92px] w-full overflow-hidden rounded-full border transition-colors duration-300 ${
                    isFestiveMode
                        ? `border-gold-600/50 ${isUnlocked ? 'bg-success-500/10' : 'bg-white/75'} shadow-[inset_0_0_0_4px_rgba(251,246,236,0.95),inset_0_0_0_5px_rgba(201,151,62,0.35),0_14px_34px_rgba(122,18,48,0.12)]`
                        : `border-white/10 ${isUnlocked ? 'bg-success-500/10' : 'bg-white/[0.04]'}`
                }`}
                style={{ padding: TRACK_PADDING }}
            >
                {/* Progress fill trailing the thumb */}
                <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                        width: `${fillWidth}px`,
                        background: isUnlocked
                            ? 'linear-gradient(90deg, var(--color-success-600), var(--color-success-500))'
                            : isFestiveMode
                            ? 'linear-gradient(90deg, var(--color-mahogany-700), var(--color-gold-500))'
                            : 'linear-gradient(90deg, var(--color-gold-700), var(--color-gold-400))',
                        transition: isDragging ? 'none' : 'width 0.5s var(--ease-kiosk)',
                        opacity: dragX > 0 || isUnlocked ? 1 : 0,
                    }}
                />

                {/* Chevron affordance, fades out as the thumb travels */}
                <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1"
                    style={{ opacity: Math.max(0, 1 - dragX / 140) }}
                >
                    {[0, 1, 2].map((i) => (
                        <CaretRight
                            key={i}
                            size={22}
                            weight="bold"
                            className={isFestiveMode ? 'text-mahogany-600/35' : 'text-white/20'}
                        />
                    ))}
                </div>

                {/* Draggable thumb */}
                <div
                    ref={thumbRef}
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                    className={`relative flex h-[76px] cursor-grab select-none items-center gap-4 rounded-full px-3 pr-8 shadow-lg active:cursor-grabbing ${
                        isUnlocked
                            ? 'bg-white'
                            : isFestiveMode
                            ? 'bg-gradient-to-br from-mahogany-600 to-mahogany-800 ring-1 ring-gold-400/70 shadow-[0_10px_24px_rgba(122,18,48,0.35)]'
                            : 'bg-white'
                    }`}
                    style={{
                        transform: `translateX(${dragX}px)`,
                        transition: isDragging ? 'none' : 'transform 0.5s var(--ease-kiosk)',
                        width: 'fit-content',
                    }}
                >
                    <span
                        className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${
                            isUnlocked
                                ? 'bg-success-500/15 text-success-600'
                                : isFestiveMode
                                ? 'bg-gradient-to-br from-gold-200 to-gold-500 text-mahogany-800'
                                : 'bg-ink-950 text-gold-400'
                        }`}
                    >
                        {isUnlocked ? <Check size={26} weight="bold" /> : <ArrowRight size={24} weight="bold" />}
                    </span>
                    <span
                        className={`whitespace-nowrap text-[19px] font-extrabold uppercase tracking-[0.15em] ${
                            isUnlocked ? 'text-success-600' : isFestiveMode ? 'text-parchment-50' : 'text-ink-950'
                        }`}
                    >
                        {isUnlocked ? 'Unlocked' : 'Swipe to start'}
                    </span>
                </div>
            </div>
        </div>
    );

    const copyright = (
        <footer
            className={`relative z-10 text-center text-[12px] ${
                isFestiveMode ? 'pb-7 text-mahogany-800/45' : 'pb-5 text-white/30'
            }`}
        >
            &copy; 2026 <strong className="font-semibold">VisionPrintt</strong>. All rights reserved.
        </footer>
    );

    if (isFestiveMode) {
        return (
            <div
                className={`screen ${isActive ? 'visible' : ''} flex h-full flex-col overflow-hidden bg-parchment-100`}
                style={{ display: isActive ? 'flex' : 'none' }}
            >
                <FestiveBackdrop />

                <div className="pointer-events-none absolute left-1/2 top-[338px] z-0 -translate-x-1/2 -translate-y-1/2 opacity-[0.17]">
                    <Mandala size={680} />
                </div>

                <Kalash className="absolute left-[86px] top-[296px] z-[1]" />
                <Kalash className="absolute right-[86px] top-[296px] z-[1]" style={{ transform: 'scaleX(-1)' }} />

                <Toran />

                <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-10 pt-[60px]">
                    <motion.section
                        initial={isActive ? { opacity: 0, y: 22 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        className="flex flex-col items-center text-center"
                    >
                        {!isSV002 && (
                            <div className="mb-1 flex items-center justify-center">
                                <MimoCharacter3D
                                    size="sm"
                                    isFestive={true}
                                    isInteracting={isDragging || dragX > 20 || isUnlocked}
                                    isActive={isActive}
                                />
                            </div>
                        )}

                        <div className="flex items-center gap-4">
                            <Lotus size={26} />
                            <p lang="hi" className="font-deva text-[36px] leading-[1.2] text-mahogany-600">
                                शुभ नवरात्रि
                            </p>
                            <Lotus size={26} />
                        </div>

                        <p className="mt-2 text-[13px] font-bold uppercase tracking-[0.55em] text-mahogany-700/60">
                            Welcome to
                        </p>

                        <div className="relative mt-1 flex items-baseline justify-center leading-none [filter:drop-shadow(0_3px_0_rgba(122,18,48,0.18))]">
                            <h1 className="bg-gradient-to-b from-gold-300 via-gold-500 to-gold-700 bg-clip-text font-sans text-[128px] font-black tracking-tight text-transparent">
                                MIMO
                            </h1>
                            <span className="bg-gradient-to-b from-gold-300 via-gold-500 to-gold-700 bg-clip-text pb-5 pl-2 font-sans text-[46px] font-extrabold text-transparent">
                                {isSV002 ? '2.0' : '1.0'}
                            </span>
                        </div>

                        <h2 className="mt-1 text-[34px] font-semibold text-mahogany-800">
                            Self-Service <span className="text-gold-600">Printing Kiosk</span>
                        </h2>

                        <div className="mb-3 mt-4">
                            <OrnamentDivider width={110} />
                        </div>

                        <p className="font-serif text-[27px] font-medium italic text-mahogany-700">
                            Happy Navaratri &mdash; nine nights of devotion, dance &amp; light
                        </p>
                    </motion.section>
                </main>

                <div className="relative z-10 pb-5">
                    <DiyaRow count={9} size={38} gap={46} />
                </div>

                {swipeTrack}
                {copyright}
                <ZariBorder />
            </div>
        );
    }

    return (
        <div
            className={`screen ${isActive ? 'visible' : ''} flex h-full flex-col overflow-hidden bg-ink-950`}
            style={{ display: isActive ? 'flex' : 'none' }}
        >
            <div
                className="pointer-events-none absolute left-1/2 top-[30%] h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px]"
                style={{ background: 'radial-gradient(closest-side, rgba(217,165,68,0.16), transparent)' }}
            />

            <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-10 pb-8">
                <motion.section
                    initial={isActive ? { opacity: 0, y: 22 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-col items-center text-center"
                >
                    {!isSV002 && (
                        <div className="mb-2 flex items-center justify-center">
                            <MimoCharacter3D
                                size="md"
                                isFestive={false}
                                isInteracting={isDragging || dragX > 20 || isUnlocked}
                                isActive={isActive}
                            />
                        </div>
                    )}

                    <p className="mb-2 text-[15px] font-bold uppercase tracking-[0.5em] text-white/50">Welcome to</p>

                    <div className="relative flex items-baseline justify-center leading-none">
                        <h1 className="bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 bg-clip-text font-sans text-[130px] font-black tracking-tight text-transparent">
                            MIMO
                        </h1>
                        <span className="bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 bg-clip-text pb-6 pl-2 font-sans text-[48px] font-extrabold text-transparent">
                            {isSV002 ? '2.0' : '1.0'}
                        </span>
                    </div>

                    <h2 className="mt-2 text-[38px] font-medium text-white/90">
                        Self-Service <span className="text-gold-400">Printing Kiosk</span>
                    </h2>

                    <p className="mt-3 text-[18px] font-medium text-white/50">Fast, secure document printing via Mimo code.</p>
                </motion.section>
            </main>

            {swipeTrack}
            {copyright}
        </div>
    );
};
