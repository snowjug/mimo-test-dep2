import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HandTap, Sparkle, ShieldCheck, Lightning, FileText } from '@phosphor-icons/react';

interface AddsProps {
  isActive: boolean;
  onTap: () => void;
  onTimeoutChange?: (seconds: number) => void;
}

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

export function Adds({ isActive, onTap, onTimeoutChange }: AddsProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videos, setVideos] = useState<string[]>([]);
  const [playSound, setPlaySound] = useState(false);
  const [isMutedFallback, setIsMutedFallback] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Live Clock updater for screensaver
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }).toUpperCase()
      );
      setCurrentDateStr(
        now.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      );
    };
    updateClock();
    const clockTimer = setInterval(updateClock, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Fetch dynamic screen saver configuration directly from Firestore or admin backend
  useEffect(() => {
    const fetchScreenSaverConfig = async () => {
      try {
        const fsRes = await fetch(
          "https://firestore.googleapis.com/v1/projects/mimo-v2-11868/databases/(default)/documents/mimo_settings/screensaver"
        );
        if (fsRes.ok) {
          const docData = await fsRes.json();
          if (
            docData.fields &&
            docData.fields.videos &&
            docData.fields.videos.arrayValue &&
            docData.fields.videos.arrayValue.values
          ) {
            const videoUrls = docData.fields.videos.arrayValue.values
              .map((v: any) => v.stringValue)
              .filter(Boolean);
            if (videoUrls.length > 0) {
              setVideos(videoUrls);
            }
          }
          if (docData.fields?.playSound && typeof docData.fields.playSound.booleanValue === 'boolean') {
            setPlaySound(docData.fields.playSound.booleanValue);
          }
          if (docData.fields?.idleTimeoutSeconds && onTimeoutChange) {
            const sec = parseInt(docData.fields.idleTimeoutSeconds.integerValue || '60', 10);
            if (sec > 0) onTimeoutChange(sec);
          }
          return;
        }
      } catch (fsErr) {
        console.warn("Firestore REST fetch error, falling back to backend API:", fsErr);
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/screensaver`);
        if (res.ok) {
          const data = await res.json();
          if (data.videos && Array.isArray(data.videos) && data.videos.length > 0) {
            setVideos(data.videos);
          }
          if (typeof data.playSound === 'boolean') {
            setPlaySound(data.playSound);
          }
          if (data.idleTimeoutSeconds && onTimeoutChange) {
            onTimeoutChange(data.idleTimeoutSeconds);
          }
        }
      } catch (err) {
        console.warn("Could not load dynamic screensaver config, using defaults:", err);
      }
    };

    fetchScreenSaverConfig();
    const interval = setInterval(fetchScreenSaverConfig, 30000); // Re-check config every 30 seconds
    return () => clearInterval(interval);
  }, [onTimeoutChange]);

  // Teardown video element and frame buffers cleanly to prevent Pi memory leak
  const purgeVideoBuffers = useCallback(() => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch (e) {
        // ignore teardown error
      }
    }
  }, []);

  // Dismiss handler that halts video decoding instantly and prevents synthetic click fallthrough
  const handleDismiss = useCallback((e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
      if ('preventDefault' in e && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    }
    purgeVideoBuffers();
    onTap();
  }, [purgeVideoBuffers, onTap]);

  useEffect(() => {
    if (isActive) {
      setCurrentVideoIndex(0);
      setIsVideoReady(false);
    } else {
      purgeVideoBuffers();
    }
    return () => {
      purgeVideoBuffers();
    };
  }, [isActive, purgeVideoBuffers]);

  const isImageUrl = (url: string) => {
    if (!url) return false;
    const cleanUrl = decodeURIComponent(url.split('?')[0]).toLowerCase();
    return cleanUrl.endsWith('.jpg') || 
           cleanUrl.endsWith('.jpeg') || 
           cleanUrl.endsWith('.png') || 
           cleanUrl.endsWith('.webp') || 
           cleanUrl.endsWith('.gif') || 
           cleanUrl.includes('/images/') || 
           cleanUrl.includes('image_');
  };

  const handleVideoEnd = useCallback(() => {
    if (videos.length === 0) return;
    purgeVideoBuffers();
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
  }, [videos.length, purgeVideoBuffers]);

  const handleMediaError = useCallback((failedUrl: string) => {
    console.warn("Media failed to play/load, removing broken URL:", failedUrl);
    purgeVideoBuffers();
    setVideos((prev) => {
      const updated = prev.filter((url) => url !== failedUrl);
      return updated;
    });
    setCurrentVideoIndex(0);
  }, [purgeVideoBuffers]);

  // Watchdog timer: 8s for images, 60s max for videos to prevent stuck black screens
  useEffect(() => {
    if (!isActive || videos.length === 0) return;
    const currentUrl = videos[currentVideoIndex];
    if (!currentUrl) return;
    const isImg = isImageUrl(currentUrl);
    const timeoutMs = isImg ? 8000 : 60000;
    const timer = setTimeout(() => {
      handleVideoEnd();
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [isActive, currentVideoIndex, videos, handleVideoEnd]);

  // Autoplay and volume control with graceful muted fallback
  useEffect(() => {
    const currentUrl = videos[currentVideoIndex];
    if (isActive && videoRef.current && currentUrl && !isImageUrl(currentUrl)) {
      const vid = videoRef.current;
      vid.muted = !playSound || isMutedFallback;
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Autoplay attempt failed, falling back to muted play:", err);
          vid.muted = true;
          setIsMutedFallback(true);
          vid.play().catch(e => {
            console.error("Muted autoplay also failed, skipping video:", e);
            handleMediaError(currentUrl);
          });
        });
      }
    }
  }, [isActive, currentVideoIndex, playSound, isMutedFallback, videos, handleMediaError]);

  if (!isActive) return null;

  const hasMediaPlaylist = videos.length > 0;
  const currentMediaUrl = hasMediaPlaylist ? videos[currentVideoIndex] : null;
  const isImage = currentMediaUrl ? isImageUrl(currentMediaUrl) : false;

  return createPortal(
    <div 
      onClick={handleDismiss}
      onTouchStart={handleDismiss}
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: '#0F172A', 
        zIndex: 9999, 
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── MODE A: PLAYLIST MEDIA (If URLs exist) ── */}
      {hasMediaPlaylist && currentMediaUrl ? (
        isImage ? (
          <img
            key={`${currentVideoIndex}-${currentMediaUrl}`}
            src={currentMediaUrl}
            alt="Screen Saver"
            onError={() => handleMediaError(currentMediaUrl)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <video 
            ref={videoRef}
            key={`${currentVideoIndex}-${currentMediaUrl}`}
            src={currentMediaUrl}
            autoPlay 
            muted={!playSound || isMutedFallback}
            playsInline
            onCanPlay={() => setIsVideoReady(true)}
            onEnded={handleVideoEnd}
            onError={() => {
              setIsVideoReady(false);
              handleMediaError(currentMediaUrl);
            }}
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover',
              display: isVideoReady ? 'block' : 'none'
            }}
          >
            Your browser does not support the video tag.
          </video>
        )
      ) : (
        /* ── MODE B: BUILT-IN AMBIENT MOTION GRAPHICS (< 3% CPU, Zero Crash Risk on Pi) ── */
        <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0B0F19] via-[#111827] to-[#1E1B4B] p-10 text-white select-none">
          {/* Animated Ambient Pulsing Gradient Glows (GPU composited) */}
          <div className="pointer-events-none absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-amber-500/15 via-gold-500/10 to-transparent blur-3xl animate-pulse" />
          <div className="pointer-events-none absolute -bottom-32 -right-32 h-[520px] w-[520px] rounded-full bg-gradient-to-tl from-indigo-600/20 via-purple-600/10 to-transparent blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />

          {/* Top Bar: Brand Badge & Live Clock */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-500/40 bg-gold-500/10 shadow-[0_0_20px_rgba(217,165,68,0.25)] backdrop-blur-md">
                <Sparkle size={22} weight="fill" className="text-gold-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-sans text-[22px] font-black tracking-wider text-white">MIMO</span>
                  <span className="rounded-md bg-gold-500/20 px-2 py-0.5 text-[11px] font-bold text-gold-300 border border-gold-500/30">
                    KIOSK
                  </span>
                </div>
                <p className="text-[12px] font-medium text-slate-400 tracking-wide">Autonomous Print Station</p>
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono text-[30px] font-black tracking-tight text-white drop-shadow-md">
                {currentTimeStr}
              </div>
              <div className="text-[13px] font-semibold text-slate-400">{currentDateStr}</div>
            </div>
          </div>

          {/* Center Stage: Branded Geometric Motion Graphics & Value Proposition */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
            {/* Concentric Pulsing Gold Rings */}
            <div className="relative mb-6 flex items-center justify-center">
              <div className="absolute h-56 w-56 rounded-full border border-gold-500/20 animate-ping" style={{ animationDuration: '3.2s' }} />
              <div className="absolute h-44 w-44 rounded-full border border-gold-500/30 animate-pulse" style={{ animationDuration: '2.4s' }} />
              <div className="flex h-32 w-32 items-center justify-center rounded-full border border-gold-400/50 bg-gradient-to-tr from-amber-600/20 via-gold-500/30 to-amber-300/10 shadow-[0_0_40px_rgba(217,165,68,0.3)] backdrop-blur-xl">
                <h1 className="bg-gradient-to-b from-white via-gold-200 to-gold-400 bg-clip-text font-sans text-[48px] font-black tracking-tight text-transparent">
                  M
                </h1>
              </div>
            </div>

            <h2 className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-[38px] font-black tracking-tight text-transparent">
              Self-Service Fast Printing
            </h2>
            <p className="mt-2 text-[17px] font-medium text-slate-300/80 max-w-lg">
              Upload from mobile, enter your 4-digit code, and collect printed pages in seconds.
            </p>

            {/* Feature Pills */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur-md">
                <Lightning size={15} weight="fill" className="text-amber-400" />
                <span>Instant Release</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur-md">
                <FileText size={15} weight="fill" className="text-blue-400" />
                <span>B&W and Color Laser</span>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 backdrop-blur-md">
                <ShieldCheck size={15} weight="fill" className="text-emerald-400" />
                <span>Private & Automated</span>
              </div>
            </div>
          </div>

          {/* Bottom Floating Prompt Placeholder for Alignment */}
          <div className="h-14" />
        </div>
      )}

      {/* Floating Touch Prompt Banner */}
      <div
        className="pointer-events-none absolute bottom-10 flex items-center gap-3 rounded-full border border-gold-500/40 bg-white/95 px-8 py-3.5 text-[#1A1714] shadow-[0_12px_36px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-transform"
      >
        <HandTap size={24} weight="fill" className="text-gold-600" style={{ animation: 'kiosk-tap-bounce 1.1s ease-in-out infinite' }} />
        <span className="text-[19px] font-bold tracking-wide">Tap anywhere to start printing with Mimo</span>
      </div>

      <style>{`
        @keyframes kiosk-tap-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>,
    document.body
  );
}
