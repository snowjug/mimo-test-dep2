import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AddsProps {
  isActive: boolean;
  onTap: () => void;
}

const videos = [
  "/vidssave.com Apple Education_ Ready for every learning opportunity 5 1080P.mp4",
  "/second_video.mp4",
  "/3_video.mp4",
  "/4_video.mp4"
];

export function Adds({ isActive, onTap }: AddsProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  useEffect(() => {
    if (isActive) {
      setCurrentVideoIndex(0);
    }
  }, [isActive]);

  if (!isActive) return null;

  const handleVideoEnd = () => {
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
  };

  return createPortal(
    <div 
      onClick={onTap}
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100vw', 
        height: '100vh', 
        backgroundColor: 'black', 
        zIndex: 9999, 
        cursor: 'pointer' 
      }}
    >
      <video 
        key={currentVideoIndex}
        src={videos[currentVideoIndex]}
        autoPlay 
        muted 
        onEnded={handleVideoEnd}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      >
        Your browser does not support the video tag.
      </video>
    </div>,
    document.body
  );
}
