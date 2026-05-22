import React from 'react';
import { Button as RadixButton, Spinner } from '@radix-ui/themes';

export function Button({
  children,
  variant = 'solid', // 'solid' | 'ghost' | 'danger' | 'soft' | 'outline'
  size = 'md',        // 'sm' | 'md' | 'lg' | '1' | '2' | '3'
  loading = false,
  disabled = false,
  icon: Icon,
  radius = 'small',  // 'none' | 'small' | 'medium' | 'large' | 'full'
  type = 'button',
  className = '',
  style = {},
  onClick,
  ...props
}) {
  // Map size from standard md/sm/lg if passed
  let radixSize = size;
  if (size === 'sm') radixSize = '1';
  if (size === 'md') radixSize = '2';
  if (size === 'lg') radixSize = '3';

  // Map variant and color
  let radixVariant = variant;
  let color = 'indigo';

  if (variant === 'danger' || variant === 'red') {
    radixVariant = 'solid';
    color = 'red';
  } else if (variant === 'primary' || variant === 'solid') {
    radixVariant = 'solid';
  } else if (variant === 'ghost') {
    radixVariant = 'ghost';
  } else if (variant === 'outline') {
    radixVariant = 'outline';
  } else if (variant === 'soft') {
    radixVariant = 'soft';
  }

  // Adjust padding if icon-only (to make it a square icon button)
  const isIconOnly = !children && Icon;
  const paddingStyle = isIconOnly ? { padding: '0', width: radixSize === '1' ? '28px' : radixSize === '2' ? '34px' : '40px', height: radixSize === '1' ? '28px' : radixSize === '2' ? '34px' : '40px' } : {};

  return (
    <RadixButton
      type={type}
      size={radixSize}
      variant={radixVariant}
      color={color}
      radius={radius}
      disabled={disabled || loading}
      onClick={onClick}
      className={className}
      style={{
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        ...paddingStyle,
        ...style
      }}
      {...props}
    >
      {loading ? (
        <Spinner size="1" />
      ) : Icon ? (
        typeof Icon === 'function' ? <Icon size={radixSize === '1' ? 13 : 15} /> : Icon
      ) : null}
      
      {children && (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {children}
        </span>
      )}
    </RadixButton>
  );
}
