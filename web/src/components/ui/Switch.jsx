import React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

export function Switch({ checked, onCheckedChange, disabled }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="toggle-root"
    >
      <SwitchPrimitive.Thumb className="toggle-thumb" />
    </SwitchPrimitive.Root>
  );
}
