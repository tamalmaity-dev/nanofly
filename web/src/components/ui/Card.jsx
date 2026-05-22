import React from 'react';

export function Card({ children, className = '', style = {}, onClick, hoverGlow = false }) {
  const classes = `${className} ${hoverGlow ? 'hover-glow' : ''}`;
  return (
    <div className={classes} style={{ ...style }} onClick={onClick}>
      {children}
    </div>
  );
}
