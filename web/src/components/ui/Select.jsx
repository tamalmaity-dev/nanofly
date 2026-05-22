import React from 'react';
import { Select } from '@radix-ui/themes';

export const SelectRoot = Select.Root;
export const SelectTrigger = Select.Trigger;


// Set position="popper" prop to position the select menu below the trigger.

export const SelectContent = React.forwardRef(({ children, position = 'popper', sideOffset = 4, ...props }, ref) => (
  <Select.Content ref={ref} position={position} sideOffset={sideOffset} {...props}>
    {children}
  </Select.Content>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = Select.Item;
export const SelectGroup = Select.Group;
export const SelectLabel = Select.Label;
export const SelectSeparator = Select.Separator;
