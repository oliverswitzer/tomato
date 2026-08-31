import { progressTrackClasses, progressFillClasses, clampPercent, type ProgressVariant } from './variants';

export interface ProgressBarProps {
  /** 0-100. Values outside this range are clamped. */
  value: number;
  variant?: ProgressVariant;
  className?: string;
}

export function ProgressBar({ value, variant = 'success', className = '' }: ProgressBarProps) {
  const clamped = clampPercent(value);
  return (
    <div className={progressTrackClasses(className)}>
      <div className={progressFillClasses(variant)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
