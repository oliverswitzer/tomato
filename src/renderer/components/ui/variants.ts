/**
 * Pure class-name builders for the Tailwind UI primitives in this folder.
 * Kept separate from the .tsx components so they can be unit tested without
 * needing a DOM/React render environment (see ARCHITECTURE.md — no new
 * browser/e2e test framework for this build).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md';

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold ' +
  'transition-colors duration-150 cursor-pointer disabled:opacity-50 ' +
  'disabled:cursor-not-allowed';

const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[0_8px_24px_rgba(226,87,76,0.3)] hover:bg-accent-dark',
  secondary: 'bg-cream border border-border text-text hover:bg-border/60',
  danger: 'bg-white border border-accent/20 text-accent hover:bg-accent/10',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = ''
): string {
  return [buttonBase, buttonSizeClasses[size], buttonVariantClasses[variant], className]
    .filter(Boolean)
    .join(' ');
}

export type IconButtonSize = 'sm' | 'md';

const iconButtonSizeClasses: Record<IconButtonSize, string> = {
  sm: 'w-7 h-7 [&_svg]:w-3.5 [&_svg]:h-3.5',
  md: 'w-9 h-9 [&_svg]:w-4 [&_svg]:h-4',
};

export function iconButtonClasses(size: IconButtonSize = 'md', className = ''): string {
  return [
    'inline-flex items-center justify-center rounded-full bg-cream border-0',
    'cursor-pointer text-muted transition-colors duration-150 hover:bg-border',
    iconButtonSizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function cardClasses(className = ''): string {
  return [
    'bg-white border border-border rounded-2xl p-4',
    'shadow-[0_2px_12px_rgba(42,42,42,0.05)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export type BadgeVariant = 'success' | 'warning' | 'accent' | 'neutral';

const badgeVariantClasses: Record<BadgeVariant, string> = {
  success: 'bg-[#E8F5E9] text-[#2E7D32]',
  warning: 'bg-[#FFF3E0] text-[#E65100]',
  accent: 'bg-accent/10 text-accent',
  neutral: 'bg-border/60 text-text',
};

const badgeDotClasses: Record<BadgeVariant, string> = {
  success: 'bg-[#2E7D32]',
  warning: 'bg-[#E65100]',
  accent: 'bg-accent',
  neutral: 'bg-subtle',
};

export function badgeClasses(variant: BadgeVariant = 'neutral', className = ''): string {
  return [
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
    badgeVariantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function badgeDotClass(variant: BadgeVariant = 'neutral'): string {
  return ['w-1.5 h-1.5 rounded-full', badgeDotClasses[variant]].filter(Boolean).join(' ');
}

export function progressTrackClasses(className = ''): string {
  return ['w-full h-1 bg-[#F4EEE3] rounded-full overflow-hidden', className]
    .filter(Boolean)
    .join(' ');
}

export const progressFillClasses = 'h-full bg-accent rounded-full transition-[width] duration-1000 ease-linear';

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
