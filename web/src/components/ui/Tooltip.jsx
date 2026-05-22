import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export function Tooltip({ children, content, position = 'top', delayDuration = 200 }) {
  if (!content) return children;

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={position}
            sideOffset={6}
            className="tooltip-box fade-in"
          >
            {content}
            <TooltipPrimitive.Arrow className="tooltip-arrow" style={{ fill: 'var(--border)' }} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
