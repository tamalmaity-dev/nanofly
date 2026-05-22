import React from 'react';
import { DropdownMenu as ThemesDropdownMenu } from '@radix-ui/themes';

export function DropdownMenu({ children, ...props }) {
  return <ThemesDropdownMenu.Root {...props}>{children}</ThemesDropdownMenu.Root>;
}

export function DropdownMenuTrigger({ children, ...props }) {
  return <ThemesDropdownMenu.Trigger {...props}>{children}</ThemesDropdownMenu.Trigger>;
}

export const DropdownMenuContent = React.forwardRef(({ children, className = '', ...props }, ref) => (
  <ThemesDropdownMenu.Content ref={ref} className={className} {...props}>
    {children}
  </ThemesDropdownMenu.Content>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef(({ children, className = '', variant = '', color, ...props }, ref) => (
  <ThemesDropdownMenu.Item
    ref={ref}
    className={`${variant} ${className}`}
    color={color}
    {...props}
  >
    {children}
  </ThemesDropdownMenu.Item>
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuSeparator = React.forwardRef(({ className = '', ...props }, ref) => (
  <ThemesDropdownMenu.Separator ref={ref} className={className} {...props} />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuLabel = React.forwardRef(({ children, className = '', ...props }, ref) => (
  <ThemesDropdownMenu.Label ref={ref} className={className} {...props}>
    {children}
  </ThemesDropdownMenu.Label>
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';