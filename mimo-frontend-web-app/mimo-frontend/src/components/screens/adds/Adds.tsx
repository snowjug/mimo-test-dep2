import { createPortal } from 'react-dom';

interface AddsProps {
  isActive: boolean;
  onTap: () => void;
}

export function Adds({ isActive, onTap }: AddsProps) {
  if (!isActive) return null;

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
        src="/vidssave.com Apple Education_ Ready for every learning opportunity 5 1080P.mp4"
        autoPlay 
        loop 
        muted 
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      >
        Your browser does not support the video tag.
      </video>
    </div>,
    document.body
  );
}

