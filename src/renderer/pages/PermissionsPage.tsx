import { useState, useEffect } from 'react';

interface PermissionCardProps {
  icon: React.ReactNode;
  iconGradient: string;
  title: string;
  description: string;
  granted: boolean;
  onOpen: () => void;
}

function PermissionCard({ icon, iconGradient, title, description, granted, onOpen }: PermissionCardProps) {
  return (
    <div className="flex flex-1 basis-0 flex-col gap-3.5 rounded-2xl border border-border bg-white p-6">
      <div className="flex items-center gap-3.5">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: iconGradient }}
        >
          {icon}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-serif text-lg font-medium leading-tight text-text">
            {title}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${granted ? 'bg-[#7CB342]' : 'bg-accent'}`}
            />
            {granted ? 'Granted' : 'Not granted'}
          </span>
        </div>
      </div>

      <p className="flex-1 text-sm leading-normal text-[#5E5A52]">{description}</p>

      <div className="flex items-center justify-between rounded-xl border border-border bg-cream px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
            <span className="text-xs leading-none">🍅</span>
          </div>
          <span className="text-xs font-semibold text-text">Tomato</span>
        </div>
        <div
          className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${
            granted ? 'bg-[#7CB342]' : 'bg-[#D6D2C8]'
          }`}
        >
          <div
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] transition-[left] duration-200 ${
              granted ? 'left-5' : 'left-0.5'
            }`}
          />
        </div>
      </div>

      <button
        onClick={onOpen}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(226,87,76,0.25)] transition-colors hover:brightness-95 active:brightness-90 [-webkit-app-region:no-drag]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15,3 21,3 21,9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
        Open System Settings
      </button>
    </div>
  );
}

export function PermissionsPage() {
  const [screenGranted, setScreenGranted] = useState(false);
  const [accessibilityGranted, setAccessibilityGranted] = useState(false);

  useEffect(() => {
    async function check() {
      const s = await window.tomato.getScreenPermission();
      const a = await window.tomato.getAccessibilityPermission();
      setScreenGranted(s);
      setAccessibilityGranted(a);
      if (s && a) {
        window.tomato.permissionsComplete();
      }
    }
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen flex-col items-center overflow-hidden rounded-3xl bg-cream px-20 pb-10 pt-11 gap-7 [-webkit-app-region:drag]">
      {/* Header */}
      <div className="flex flex-col items-center gap-3.5">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border text-5xl leading-none shadow-[0_6px_20px_rgba(226,87,76,0.1)]">
          🍅
        </div>

        <h1 className="text-center font-serif text-4xl font-medium tracking-tight text-text">
          Two quick permissions
        </h1>

        <p className="max-w-lg text-center text-sm leading-normal text-muted">
          Tomato needs to read your screen — on-device only — to gently nudge you when you drift. Grant both to get started.
        </p>
      </div>

      {/* Cards */}
      <div className="flex w-full gap-3.5">
        <PermissionCard
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          }
          iconGradient="linear-gradient(180deg, #E2574C 0%, #C7402F 100%)"
          title="Screen & System Audio Recording"
          description="Tomato reads your screen on-device to detect when you've drifted from your intent. Audio is never recorded — we just need this scope from macOS."
          granted={screenGranted}
          onOpen={() => window.tomato.openScreenPermissionSettings()}
        />
        <PermissionCard
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              <path d="m13 13 6 6" />
            </svg>
          }
          iconGradient="#7CB342"
          title="Accessibility"
          description="Lets Tomato show you a gentle nudge when you drift, and respond to your Pause/Refocus reply right inside the speech bubble."
          granted={accessibilityGranted}
          onOpen={() => window.tomato.openAccessibilityPermissionSettings()}
        />
      </div>

      {/* Footer */}
      <div className="flex w-full flex-col items-center gap-3.5">
        <button
          onClick={() => window.tomato.permissionsComplete()}
          className="text-sm font-medium text-muted transition-colors hover:text-[#6B6259] [-webkit-app-region:no-drag]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
