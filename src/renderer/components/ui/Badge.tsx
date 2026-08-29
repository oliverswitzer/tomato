import type { HTMLAttributes } from 'react';
import { badgeClasses, badgeDotClass, type BadgeVariant } from './variants';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ variant = 'neutral', dot = false, className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={badgeClasses(variant, className)} {...rest}>
      {dot && <span className={badgeDotClass(variant)} />}
      {children}
    </span>
  );
}
