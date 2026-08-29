import { progressTrackClasses, progressFillClasses, clampPercent } from './variants';

export interface ProgressBarProps {
  /** 0-100. Values outside this range are clamped. */
  value: number;
  className?: string;
}

export function ProgressBar({ value, className = '' }: ProgressBarProps) {
  const clamped = clampPercent(value);
  return (
    <div className={progressTrackClasses(className)}>
      <div className={progressFillClasses} style={{ width: `${clamped}%` }} />
    </div>
  );
}
