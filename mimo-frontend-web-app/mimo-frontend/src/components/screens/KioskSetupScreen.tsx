import React from 'react';

export const KioskSetupScreen: React.FC = () => {
  const handleSelect = (kioskId: string) => {
    // Redirect with the kioskId in the URL parameters
    window.location.href = `?kioskId=${kioskId}`;
  };

  return (
    <div className="screen main-interface visible" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
      <div className="brand-header">
        <h1 className="brand-title">Mimo<span className="dot">.</span></h1>
        <p className="brand-desc">Kiosk Hardware Setup</p>
      </div>

      <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '20px', width: '80%', maxWidth: '400px' }}>
        <button 
          className="num-btn submit-btn ready" 
          onClick={() => handleSelect('CV-001')}
          style={{ padding: '20px', fontSize: '18px' }}
        >
          KIOSK MACHINE CV-001
          <br/>
          <span style={{ fontSize: '12px', opacity: 0.8 }}>(Campus PrintPi)</span>
        </button>

        <button 
          className="num-btn submit-btn ready" 
          onClick={() => handleSelect('SV-002')}
          style={{ padding: '20px', fontSize: '18px' }}
        >
          KIOSK MACHINE SV-002
          <br/>
          <span style={{ fontSize: '12px', opacity: 0.8 }}>(New Brother Printer)</span>
        </button>
      </div>
    </div>
  );
};
