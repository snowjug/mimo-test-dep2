import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HandTap } from '@phosphor-icons/react';

interface AddsProps {
  isActive: boolean;
  onTap: () => void;
  onTimeoutChange?: (seconds: number) => void;
}

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

const defaultVideos: string[] = [];

export function Adds({ isActive, onTap, onTimeoutChange }: AddsProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videos, setVideos] = useState<string[]>(defaultVideos);
  const [playSound, setPlaySound] = useState(true);
  const [isMutedFallback, setIsMutedFallback] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Fetch dynamic screen saver configuration directly from Firestore or admin backend
    const fetchScreenSaverConfig = async () => {
      try {
        const fsRes = await fetch("https://firestore.googleapis.com/v1/projects/mimo-v2-11868/databases/(default)/documents/mimo_settings/screensaver");
        if (fsRes.ok) {
          const docData = await fsRes.json();
          if (docData.fields && docData.fields.videos && docData.fields.videos.arrayValue && docData.fields.videos.arrayValue.values) {
            const videoUrls = docData.fields.videos.arrayValue.values.map((v: any) => v.stringValue).filter(Boolean);
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

  useEffect(() => {
    if (isActive) {
      setCurrentVideoIndex(0);
    }
    setIsVideoReady(false);
  }, [isActive, currentVideoIndex]);

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

  const handleVideoEnd = () => {
    if (videos.length === 0) return;
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
  };

  const handleMediaError = (failedUrl: string) => {
    console.warn("Media failed to play/load, removing broken URL:", failedUrl);
    setVideos((prev) => {
      const updated = prev.filter((url) => url !== failedUrl);
      if (updated.length === 0 && onTap) {
        onTap(); // Dismiss screensaver overlay immediately if all URLs 404/fail
      }
      return updated;
    });
    setCurrentVideoIndex(0);
  };

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
  }, [isActive, currentVideoIndex, videos]);

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
  }, [isActive, currentVideoIndex, playSound, isMutedFallback, videos]);

  if (!isActive || videos.length === 0) return null;

  const currentMediaUrl = videos[currentVideoIndex];
  if (!currentMediaUrl) return null;
  const isImage = isImageUrl(currentMediaUrl);

  return createPortal(
    <div 
      onClick={onTap}
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: 'transparent', 
        zIndex: 9999, 
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {isImage ? (
        <img
          key={`${currentVideoIndex}-${currentMediaUrl}`}
          src={currentMediaUrl}
          alt="Screen Saver"
          onError={() => {
            handleMediaError(currentMediaUrl);
          }}
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
      )}

      {/* Touch prompt banner */}
      <div
        className="pointer-events-none absolute bottom-10 flex items-center gap-3 rounded-full border border-gold-500/30 bg-white/90 px-8 py-3 text-[#1A1714] shadow-2xl backdrop-blur-md"
      >
        <HandTap size={22} weight="fill" className="text-gold-600" style={{ animation: 'kiosk-tap-bounce 1.1s ease-in-out infinite' }} />
        <span className="text-[19px] font-semibold tracking-wide">Tap anywhere to start printing with Mimo</span>
      </div>
      <style>{`
        @keyframes kiosk-tap-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </div>,
    document.body
  );
}
