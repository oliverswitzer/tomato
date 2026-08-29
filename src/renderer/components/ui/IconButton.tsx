import type { ButtonHTMLAttributes } from 'react';
import { iconButtonClasses, type IconButtonSize } from './variants';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
}

export function IconButton({ size = 'md', className = '', children, ...rest }: IconButtonProps) {
  return (
    <button className={iconButtonClasses(size, className)} {...rest}>
      {children}
    </button>
  );
}
