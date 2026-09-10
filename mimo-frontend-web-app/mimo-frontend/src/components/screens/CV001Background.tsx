import React from 'react';

export const CV001Background: React.FC = () => {
  return (
    <div className="cv001-bg-wrapper" style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Clean plain royal blue background color */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#FAF4E8',
          zIndex: 0
        }} 
      />
    </div>
  );
};
