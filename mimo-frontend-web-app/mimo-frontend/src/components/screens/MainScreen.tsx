import React, { useState, useRef, useEffect } from 'react';

interface MainScreenProps {
  onNext: () => void;
  isActive: boolean;
}

export const MainScreen: React.FC<MainScreenProps> = ({ onNext, isActive }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const dragStartX = useRef<number>(0);
  const dragStartThumbX = useRef<number>(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const TRACK_PADDING = 10;

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      if (isUnlocked) return;
      let clientX = 0;
      if ('touches' in e) {
          clientX = e.touches[0].clientX;
      } else {
          clientX = (e as React.MouseEvent).clientX;
      }
      dragStartX.current = clientX;
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
          
          let clientX = 0;
          if ('touches' in e) {
              clientX = e.touches[0].clientX;
          } else {
              clientX = (e as MouseEvent).clientX;
          }

          const trackRect = trackRef.current.getBoundingClientRect();
          const thumbWidth = thumbRef.current ? thumbRef.current.offsetWidth : 360;
          const maxDragX = trackRect.width - thumbWidth - (TRACK_PADDING * 2);
          
          const dx = clientX - dragStartX.current;
          let newX = dragStartThumbX.current + dx;
          
          if (newX < 0) newX = 0;
          if (newX > maxDragX) newX = maxDragX;
          
          setDragX(newX);
          
          if (newX >= maxDragX * 0.95) {
              setIsUnlocked(true);
              setIsDragging(false);
              setDragX(maxDragX);
              
              if (navigator.vibrate) {
                  navigator.vibrate(50);
              }

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
        className={`screen main-interface-wrap ${isActive ? 'visible' : ''}`}
        style={{ display: isActive ? 'flex' : 'none' }}
    >
        {/* Cinematic Aurora Background and Globs */}
        <div className="aurora-bg"></div>
        <div className="ambient-glow glow-1"></div>
        <div className="ambient-glow glow-2"></div>
        <div className="ambient-glow glow-3"></div>

        {/* Oversized Subtle Background Watermark */}
        <div className="watermark-mimo">MIMO</div>

        <main className="immersive-container">
            <section className="brand-panel">
                <div style={{ opacity: 0.8 }}>
                    <p className="tag-line">— WELCOME TO —</p>
                </div>
                <div className="main-heading">
                    <svg width="680" height="175" viewBox="0 0 680 175" style={{ overflow: 'visible', filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.45))' }}>
                        <defs>
                            <style>{`@import url('https://fonts.cdnfonts.com/css/lovelo');`}</style>
                            <linearGradient id="mimoGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.7" />
                            </linearGradient>
                        </defs>
                        <text 
                            x="50%" y="52%" 
                            dominantBaseline="middle" 
                            textAnchor="middle" 
                            fill="url(#mimoGrad)" 
                            stroke="rgba(255,255,255,0.3)" 
                            strokeWidth="1.5"
                            strokeLinejoin="bevel"
                            strokeLinecap="butt"
                            style={{ 
                                fontFamily: "'Lovelo', sans-serif", 
                                fontSize: '158px', 
                                fontWeight: 900,
                                letterSpacing: '12px',
                                paintOrder: 'stroke fill'
                            }}
                        >
                            MIMO
                        </text>
                    </svg>
                </div>
                <div className="sub-heading-wrap">
                    <h2 className="sub-heading">Self-Service <span className="cyan-text">Printing Kiosk</span></h2>
                </div>
                <p className="brand-desc">Fast, secure document printing via Mimo code.</p>
            </section>
            
            <section className="action-panel">
                <div 
                    className={`swipe-track-glass ${isUnlocked ? 'unlocked' : ''}`} 
                    ref={trackRef}
                >
                    <div className="glass-reflection"></div>
                    
                    {/* Progress fill behind thumb */}
                    <div 
                        className="swipe-fill"
                        style={{ 
                            width: dragX + (thumbRef.current?.offsetWidth || 360) / 2 + TRACK_PADDING + 'px',
                            transition: isDragging ? 'none' : 'width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
                            opacity: dragX > 0 ? 1 : 0
                        }}
                    ></div>

                    {/* iPhone-style Shimmer Sweeping Chevron Indicator */}
                    <div className="swipe-right-text" style={{ opacity: Math.max(0, 1 - (dragX / 150)), display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="shimmer-chevrons-container">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <span 
                                    key={i} 
                                    className="material-symbols-outlined"
                                    style={{ 
                                        margin: '0 -24px', 
                                        fontVariationSettings: '"wght" 300' 
                                    }}
                                >
                                    chevron_right
                                </span>
                            ))}
                        </div>
                    </div>
                    
                    {/* Draggable Pill Thumb */}
                    <div 
                        className={`swipe-pill-thumb ${isDragging ? 'dragging' : ''}`}
                        ref={thumbRef}
                        style={{ 
                            transform: `translateX(${dragX}px)`,
                            transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
                        }}
                        onMouseDown={handleDragStart}
                        onTouchStart={handleDragStart}
                    >
                        <span className="thumb-text">{isUnlocked ? 'UNLOCKED' : 'SWIPE TO START'}</span>
                        <div className="arrow-circle">
                            <span className="material-symbols-outlined" style={{ color: isUnlocked ? '#4fc3f7' : '' }}>
                                {isUnlocked ? 'check' : 'arrow_forward'}
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        </main>
        
        <footer className="kiosk-footer" style={{ position: 'relative', zIndex: 10 }}>
            Software designed and developed by <strong>Rathindra.</strong><br/>&copy; 2026 <strong>VisionPrintt</strong>. All rights reserved.
        </footer>

        <style>{`
            .shimmer-chevrons-container {
                display: flex;
                background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(79,195,247,0.6) 45%, #ffffff 50%, rgba(79,195,247,0.6) 55%, rgba(255,255,255,0.05) 100%);
                background-size: 200% 100%;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                animation: shimmerSweep 3s infinite linear;
                filter: drop-shadow(0 0 10px rgba(79,195,247,0.2));
            }

            .shimmer-chevrons-container span {
                font-size: 96px;
            }

            @keyframes shimmerSweep {
                0% { background-position: 200% center; }
                100% { background-position: -200% center; }
            }
        `}</style>
    </div>
  );
};
