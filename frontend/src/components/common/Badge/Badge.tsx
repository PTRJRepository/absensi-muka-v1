import type { CSSProperties, ReactNode } from 'react';
import type { BadgeVariant } from '../../../types';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  style?: CSSProperties;
}

export function Badge({ variant = 'neutral', children, style }: BadgeProps) {
  return <span className={('badge badge-' + variant)} style={style}>{children}</span>;
}
