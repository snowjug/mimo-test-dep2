import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AddsProps {
  isActive: boolean;
  onTap: () => void;
  onTimeoutChange?: (seconds: number) => void;
}

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

const defaultVideos = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
];

export function Adds({ isActive, onTap, onTimeoutChange }: AddsProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videos, setVideos] = useState<string[]>(defaultVideos);
  const [playSound, setPlaySound] = useState(true);
  const [isMutedFallback, setIsMutedFallback] = useState(true);
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
  }, [isActive]);

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
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
  };

  // Watchdog timer: 8s for images, 60s max for videos to prevent stuck black screens
  useEffect(() => {
    if (!isActive || videos.length === 0) return;
    const currentUrl = videos[currentVideoIndex];
    const isImg = isImageUrl(currentUrl);
    const timeoutMs = isImg ? 8000 : 60000;
    const timer = setTimeout(() => {
      handleVideoEnd();
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [isActive, currentVideoIndex, videos]);

  useEffect(() => {
    const currentUrl = videos[currentVideoIndex];
    if (isActive && videoRef.current && !isImageUrl(currentUrl)) {
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
            handleVideoEnd();
          });
        });
      }
    }
  }, [isActive, currentVideoIndex, playSound, isMutedFallback, videos]);

  if (!isActive || videos.length === 0) return null;

  const currentMediaUrl = videos[currentVideoIndex];
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
        backgroundColor: '#000', 
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
            console.warn("Image failed to load, skipping:", currentMediaUrl);
            handleVideoEnd();
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
          onEnded={handleVideoEnd}
          onError={() => {
            console.warn("Video failed to play/load, skipping:", currentMediaUrl);
            handleVideoEnd();
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        >
          Your browser does not support the video tag.
        </video>
      )}

      {/* Touch prompt banner */}
      <div style={{
        position: 'absolute',
        bottom: '2.5rem',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '0.75rem 2rem',
        borderRadius: '2rem',
        color: '#ffffff',
        fontSize: '1.25rem',
        fontWeight: 600,
        letterSpacing: '0.02em',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        pointerEvents: 'none'
      }}>
        <span style={{ animation: 'bounce 1s infinite', fontSize: '1.5rem' }}>👆</span> 
        Tap anywhere to start printing with Mimo
      </div>
    </div>,
    document.body
  );
}
