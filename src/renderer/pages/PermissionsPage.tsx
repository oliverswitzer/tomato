import { useState, useEffect } from 'react';

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

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
    <div
      className="flex-1 basis-0 flex flex-col rounded-[18px] border border-[#EFE8DD] bg-white"
      style={{ padding: 24, gap: 14 }}
    >
      <div className="flex items-center" style={{ gap: 14 }}>
        <div
          className="w-[56px] h-[56px] rounded-[14px] flex items-center justify-center shrink-0"
          style={{ background: iconGradient }}
        >
          {icon}
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span
            className="text-[17px] font-medium text-[#2A2A2A] leading-[1.25]"
            style={{ fontFamily: "'Newsreader', Georgia, serif" }}
          >
            {title}
          </span>
          <span className="text-[11px] text-[#8B8477] flex items-center" style={{ gap: 4 }}>
            <span
              className="w-[6px] h-[6px] rounded-full inline-block"
              style={{ background: granted ? '#7CB342' : '#E2574C' }}
            />
            {granted ? 'Granted' : 'Not granted'}
          </span>
        </div>
      </div>

      <p className="text-[13px] text-[#5E5A52] flex-1" style={{ lineHeight: 1.5 }}>
        {description}
      </p>

      <div
        className="flex items-center justify-between rounded-[10px] border border-[#EFE8DD]"
        style={{ background: '#F8F5EE', padding: '10px 12px' }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <div
            className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center"
            style={{ background: '#E2574C' }}
          >
            <span className="text-[9px] leading-none">🍅</span>
          </div>
          <span className="text-[12px] font-semibold text-[#2A2A2A]">Tomato</span>
        </div>
        <div
          className="relative"
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: granted ? '#7CB342' : '#D6D2C8',
            transition: 'background 0.2s',
          }}
        >
          <div
            className="absolute bg-white rounded-full"
            style={{
              width: 16, height: 16, top: 2,
              left: granted ? 18 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          />
        </div>
      </div>

      <button
        onClick={onOpen}
        style={{ ...noDrag, background: '#E2574C', padding: '12px 16px', boxShadow: '0 4px 14px rgba(226,87,76,0.25)' }}
        className="w-full flex items-center justify-center gap-[8px] rounded-[12px] text-white text-[14px] font-semibold transition-colors hover:brightness-95 active:brightness-90"
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
    <div
      className="h-screen overflow-hidden rounded-[28px] flex flex-col items-center"
      style={{ background: '#FBF7F1', WebkitAppRegion: 'drag', padding: '44px 80px 40px', gap: 28 } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex flex-col items-center" style={{ gap: 14 }}>
        <div
          className="rounded-[48px] flex items-center justify-center overflow-hidden"
          style={{ width: 96, height: 96, border: '1px solid #EFE8DD', boxShadow: '0 6px 20px rgba(226,87,76,0.1)', fontSize: 52, lineHeight: 1 }}
        >
          🍅
        </div>

        <h1
          className="text-center text-[#2A2A2A]"
          style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 36, fontWeight: 500, letterSpacing: '-0.4px' }}
        >
          Two quick permissions
        </h1>

        <p className="text-center text-[#8B8477]" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 480 }}>
          Tomato needs to read your screen — on-device only — to gently nudge you when you drift. Grant both to get started.
        </p>
      </div>

      {/* Cards */}
      <div className="flex w-full" style={{ gap: 14 }}>
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
      <div className="flex flex-col items-center w-full" style={{ gap: 14 }}>
        <div style={noDrag}>
          <button
            onClick={() => window.tomato.permissionsComplete()}
            className="text-[13px] font-medium text-[#8B8477] hover:text-[#6B6259] transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
