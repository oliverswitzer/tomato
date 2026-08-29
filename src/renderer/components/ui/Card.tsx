import type { HTMLAttributes } from 'react';
import { cardClasses } from './variants';

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div className={cardClasses(className)} {...rest}>
      {children}
    </div>
  );
}
