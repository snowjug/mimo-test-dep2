import React, { useEffect, useRef } from 'react';

interface AdSenseBlockProps {
  adClient?: string;
  adSlot?: string;
  adFormat?: string;
  fullWidthResponsive?: string;
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export function AdSenseBlock({
  adClient = 'ca-pub-6488030243565665', // Using the official publisher ID
  adSlot = 'auto', // AdSense will auto-fill if multiplex/auto-ads are enabled
  adFormat = 'auto',
  fullWidthResponsive = 'true',
  className = '',
}: AdSenseBlockProps) {
  const adRef = useRef<HTMLModElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    // We only want to push to adsbygoogle once per component instance
    // This prevents errors in React Strict Mode or during re-renders
    if (!initialized.current && adRef.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        initialized.current = true;
      } catch (e) {
        console.error('AdSense injection error:', e);
      }
    }
  }, []);

  return (
    <div className={`w-full overflow-hidden flex justify-center items-center ${className}`}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%' }}
        data-ad-client={adClient}
        data-ad-slot={adSlot === 'auto' ? undefined : adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive={fullWidthResponsive}
      />
    </div>
  );
}
