import React, { useEffect, useRef, useState } from 'react';

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

/**
 * Renders its own "Sponsored" section -- not just the raw AdSense slot -- so it can hide the whole
 * thing (heading included) when there's no ad to show, instead of leaving a visible empty placeholder.
 * AdSense resolves asynchronously and marks the slot with data-ad-status="filled" or "unfilled" once it
 * knows; until that's confirmed `filled`, the slot stays mounted (so AdSense can actually attempt to
 * fill it) but visually collapsed to zero size, so nothing ever flashes an empty skeleton.
 */
export function AdSenseBlock({
  adClient = 'ca-pub-6488030243565665', // Using the official publisher ID
  adSlot = 'auto', // AdSense will auto-fill if multiplex/auto-ads are enabled
  adFormat = 'auto',
  fullWidthResponsive = 'true',
  className = '',
}: AdSenseBlockProps) {
  const adRef = useRef<HTMLModElement>(null);
  const initialized = useRef(false);
  const [status, setStatus] = useState<'pending' | 'filled' | 'unfilled'>('pending');

  useEffect(() => {
    const el = adRef.current;
    if (!el) return;

    // We only want to push to adsbygoogle once per component instance
    // This prevents errors in React Strict Mode or during re-renders
    if (!initialized.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        initialized.current = true;
      } catch (e) {
        console.error('AdSense injection error:', e);
        setStatus('unfilled');
      }
    }

    const readStatus = () => {
      const adStatus = el.getAttribute('data-ad-status');
      if (adStatus === 'filled') setStatus('filled');
      else if (adStatus === 'unfilled') setStatus('unfilled');
    };
    readStatus(); // AdSense sometimes sets the attribute synchronously right after push()
    const observer = new MutationObserver(readStatus);
    observer.observe(el, { attributes: true, attributeFilter: ['data-ad-status'] });
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={status === 'filled' ? 'mt-8' : 'absolute h-0 w-0 overflow-hidden'}
      aria-label="Sponsored"
      aria-hidden={status !== 'filled'}
    >
      <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-3">Sponsored</h2>
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
    </section>
  );
}
