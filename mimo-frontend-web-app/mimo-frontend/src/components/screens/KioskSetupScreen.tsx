import React from 'react';

export const KioskSetupScreen: React.FC = () => {
  const handleSelect = (kioskId: string) => {
    // Redirect with the kioskId in the URL parameters
    window.location.href = `?kioskId=${kioskId}`;
  };

  return (
    <div className="screen main-interface-wrap visible" style={{ height: '100vh', width: '100vw' }}>
      
      {/* Background Ambience */}
      <div className="aurora-bg">
        <div className="ambient-glow glow-1"></div>
        <div className="ambient-glow glow-2"></div>
        <div className="ambient-glow glow-3"></div>
      </div>
      <div className="watermark-mimo">Mimo</div>
      <div className="glass-reflection"></div>

      <div className="immersive-container" style={{ paddingBottom: '0', zIndex: 100 }}>
        
        <div className="brand-panel">
          <div className="glass-pill" style={{ marginBottom: '20px' }}>
            <div className="status-dot"></div>
            System Setup
          </div>
          
          <div className="main-heading">
            <h1 className="sub-heading">Hardware <span className="cyan-text">Configuration</span></h1>
          </div>
          
          <p className="brand-desc" style={{ fontSize: '18px', maxWidth: '500px' }}>
            Select the physical printer this kiosk is stationed at. This will permanently bind the display to route print jobs accurately.
          </p>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', gap: '30px', width: '100%', maxWidth: '800px', justifyContent: 'center' }}>
          
          {/* CAMPUS KIOSK BUTTON */}
          <div 
            onClick={() => handleSelect('CV-001')}
            style={{
              flex: 1,
              padding: '40px 20px',
              borderRadius: '24px',
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 15px 35px rgba(0, 0, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--teal-bright)';
              e.currentTarget.style.background = 'rgba(79, 195, 247, 0.05)';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '64px', color: 'var(--teal-bright)', marginBottom: '15px' }}>
              account_balance
            </span>
            <h2 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '5px', letterSpacing: '1px' }}>CV-001</h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px' }}>Campus Printer</p>
          </div>

          {/* BROTHER KIOSK BUTTON */}
          <div 
            onClick={() => handleSelect('SV-002')}
            style={{
              flex: 1,
              padding: '40px 20px',
              borderRadius: '24px',
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 15px 35px rgba(0, 0, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--teal-bright)';
              e.currentTarget.style.background = 'rgba(79, 195, 247, 0.05)';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '64px', color: 'var(--teal-bright)', marginBottom: '15px' }}>
              print
            </span>
            <h2 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '5px', letterSpacing: '1px' }}>SV-002</h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '2px' }}>New Brother</p>
          </div>

        </div>
      </div>
    </div>
  );
};
