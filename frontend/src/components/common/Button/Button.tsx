import type { ReactNode } from 'react';
import type { BadgeVariant } from '../../../types';

interface ButtonProps {
  variant?: 'primary' | 'success' | 'outline' | 'ghost';
  size?: 'sm' | 'lg';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'sm',
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size !== 'sm' ? `btn-${size}` : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
