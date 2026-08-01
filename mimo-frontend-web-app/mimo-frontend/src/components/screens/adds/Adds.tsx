import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface AddsProps {
  isActive: boolean;
  onTap: () => void;
  onTimeoutChange?: (seconds: number) => void;
}

const BACKEND_URL = "https://api-upqxuj7evq-uc.a.run.app";

const defaultVideos = [
  "/vidssave.com Apple Education_ Ready for every learning opportunity 5 1080P.mp4",
  "/second_video.mp4",
  "/3_video.mp4",
  "/4_video.mp4"
];

export function Adds({ isActive, onTap, onTimeoutChange }: AddsProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [videos, setVideos] = useState<string[]>(defaultVideos);
  const [playSound, setPlaySound] = useState(true);
  const [isMutedFallback, setIsMutedFallback] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Fetch dynamic screen saver configuration from admin backend
    const fetchScreenSaverConfig = async () => {
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
    const interval = setInterval(fetchScreenSaverConfig, 60000); // Re-check config every minute
    return () => clearInterval(interval);
  }, [onTimeoutChange]);

  useEffect(() => {
    if (isActive) {
      setCurrentVideoIndex(0);
      setIsMutedFallback(false);
    }
  }, [isActive]);

  const isImageUrl = (url: string) => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.jpg') || 
           cleanUrl.endsWith('.jpeg') || 
           cleanUrl.endsWith('.png') || 
           cleanUrl.endsWith('.webp') || 
           cleanUrl.endsWith('.gif') || 
           cleanUrl.includes('/images/') || 
           cleanUrl.includes('image_');
  };

  useEffect(() => {
    if (!isActive || videos.length === 0) return;
    const currentUrl = videos[currentVideoIndex];
    if (isImageUrl(currentUrl)) {
      const timer = setTimeout(() => {
        setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [isActive, currentVideoIndex, videos]);

  useEffect(() => {
    const currentUrl = videos[currentVideoIndex];
    if (isActive && videoRef.current && !isImageUrl(currentUrl)) {
      const vid = videoRef.current;
      vid.muted = !playSound || isMutedFallback;
      vid.play().catch((err) => {
        // If unmuted autoplay is blocked by browser policy before first interaction, fallback to muted autoplay
        if (!vid.muted) {
          console.warn("Unmuted autoplay blocked by browser policy, falling back to muted autoplay:", err);
          vid.muted = true;
          setIsMutedFallback(true);
          vid.play().catch(e => console.error("Autoplay failed:", e));
        }
      });
    }
  }, [isActive, currentVideoIndex, playSound, isMutedFallback, videos]);

  if (!isActive || videos.length === 0) return null;

  const handleVideoEnd = () => {
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
  };

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
