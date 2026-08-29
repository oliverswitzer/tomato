import { useState, useEffect, useCallback } from 'react';
import { formatTime, formatActivityTime } from '@shared/utils';
import { useSessionStore } from '../store/sessionStore';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { IconButton } from '../components/ui/IconButton';

export function HudPage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const state = useSessionStore((s) => s.state);
  const activities = useSessionStore((s) => s.activities);
  const driftInfo = useSessionStore((s) => s.driftInfo);
  const apiError = useSessionStore((s) => s.apiError);
  const sessionEnded = useSessionStore((s) => s.sessionEnded);

  const latestSummary =
    activities.length > 0
      ? activities[activities.length - 1].summary
      : 'First summary in a few minutes...';

  const resize = useCallback((expanded: boolean) => {
    window.tomato.timerResize(expanded ? 700 : 175);
  }, []);

  const toggleExpand = useCallback(() => {
    setManualOverride(true);
    setIsExpanded((prev) => {
      const next = !prev;
      resize(next);
      return next;
    });
  }, [resize]);

  useEffect(() => {
    window.tomato.timerReady();
  }, []);

  // Auto collapse/expand with drift state, unless the user has manually
  // toggled the HUD open/closed for this session.
  useEffect(() => {
    if (manualOverride) return;
    const shouldExpand = !!driftInfo;
    setIsExpanded(shouldExpand);
    resize(shouldExpand);
  }, [driftInfo, manualOverride, resize]);

  const timeStr = sessionEnded ? '00:00' : formatTime(state.remainingSec);
  const displaySummary = sessionEnded ? 'Session complete!' : latestSummary;
  const progress = sessionEnded
    ? 0
    : (state.remainingSec / (state.durationMin * 60)) * 100;

  const recentTimeline = activities.slice(-6).reverse();

  return (
    <div
      id="session-timer"
      className={`[-webkit-app-region:drag] rounded-[22px] p-4 flex flex-col gap-3.5 h-screen overflow-hidden bg-white border transition-[background,border-color,box-shadow] duration-[800ms] ease-in-out [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-subtle/30 [&::-webkit-scrollbar-thumb]:rounded-full ${
        driftInfo
          ? 'border-accent/60 shadow-[0_0_12px_3px_rgba(226,87,76,0.5),0_0_24px_6px_rgba(226,87,76,0.25),0_20px_44px_rgba(0,0,0,0.12)] animate-drift-pulse'
          : 'border-border shadow-[0_20px_44px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]'
      }`}
    >
      {/* Status badge + expand toggle */}
      <div className="flex items-center justify-between gap-2.5">
        <Badge
          variant="accent"
          dot
          className={`uppercase tracking-[1.2px] whitespace-nowrap${driftInfo ? ' animate-pulse' : ''}`}
        >
          {driftInfo ? 'POSSIBLE DISTRACTION' : 'ON TRACK'} &bull; {state.durationMin} MIN
        </Badge>
        <IconButton
          size="sm"
          onClick={toggleExpand}
          className="[-webkit-app-region:no-drag]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points={isExpanded ? '18,15 12,9 6,15' : '6,9 12,15 18,9'} />
          </svg>
        </IconButton>
      </div>

      {/* Timer row */}
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-[28px] shrink-0">
          🍅
        </div>
        <div className="flex-1 flex flex-col gap-[3px] min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[32px] font-semibold text-text tracking-[-0.5px]">
              {timeStr}
            </span>
          </div>
          <div className="font-serif text-[15px] font-medium text-text leading-[1.3] line-clamp-3">
            {state.intention || displaySummary}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar value={progress} />

      {apiError && (
        <div
          className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 mx-0.5 [-webkit-app-region:no-drag] ${
            apiError.type === 'auth' ? 'bg-[#FEE4E2]' : 'bg-[#FFF3E0]'
          }`}
        >
          <span
            className={`flex-1 text-[11px] leading-[1.4] ${
              apiError.type === 'auth' ? 'text-[#7A2E25]' : 'text-[#5D4037]'
            }`}
          >
            {apiError.message}
          </span>
          <button
            onClick={() => window.tomato.openSettings()}
            className="bg-transparent border-0 text-[11px] font-semibold text-[#B86B60] cursor-pointer whitespace-nowrap p-0"
          >
            Settings &rarr;
          </button>
        </div>
      )}

      {isExpanded && (
        <div id="expanded" className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3.5 [-webkit-app-region:no-drag] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-subtle/30 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-subtle tracking-[1.4px]">CURRENT ACTIVITY</span>
              <div className="font-serif text-[15px] italic font-medium text-text tracking-[-0.3px] leading-[1.3] line-clamp-3">
                {displaySummary}
              </div>
            </div>

            {driftInfo && (
              <div className="flex flex-col gap-1.5 bg-[#FCE5E2] rounded-xl px-3.5 py-2.5">
                <span className="text-xs font-bold tracking-[1.4px] text-[#B42318]">OFF TRACK</span>
                <div
                  title={driftInfo.reason}
                  className="text-[13px] text-text leading-[1.4] line-clamp-3"
                >
                  {driftInfo.reason}
                </div>
                <div className="text-[11px] text-muted mt-1">
                  {driftInfo.level2Classification} &middot; {Math.round(driftInfo.confidence * 100)}% confidence
                </div>
              </div>
            )}

            <div className="flex flex-col flex-1 min-h-0 gap-2.5 pt-2.5">
              <div className="flex justify-between items-center px-0.5 py-2 border-b border-border mb-1">
                <span className="text-xs font-bold text-subtle tracking-[1.4px]">
                  LAST {state.durationMin} MINUTES
                </span>
                <span className="text-xs font-semibold text-subtle tracking-[1px]">
                  {activities.length} ACTIVIT{activities.length === 1 ? 'Y' : 'IES'}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-subtle/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                {recentTimeline.length === 0 ? (
                  <div className="bg-cream border border-border rounded-2xl px-3.5 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      <span className="font-mono text-[15px] font-semibold text-text">0:00</span>
                    </div>
                    <div className="text-[13px] text-[#6B6259] leading-[1.4] pl-3.5">
                      Waiting for screen activity...
                    </div>
                    <div className="text-xs text-subtle pl-3.5">now</div>
                  </div>
                ) : (
                  recentTimeline.map((a) => (
                    <div
                      className="bg-cream border border-border rounded-2xl px-3.5 py-3 flex flex-col gap-1.5 [&+&]:mt-2"
                      key={a.timestamp}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span className="font-mono text-[15px] font-semibold text-text">
                          {formatActivityTime(a.timestamp)}
                        </span>
                      </div>
                      <div className="text-[13px] text-[#6B6259] leading-[1.4] pl-3.5">{a.summary}</div>
                      {a.apps.length > 0 && (
                        <div className="text-xs text-subtle pl-3.5">{a.apps.join(', ')}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 [-webkit-app-region:no-drag] shrink-0 pt-3.5">
            <button
              className="flex-1 px-2.5 py-2.5 rounded-[10px] border border-border bg-cream text-sm font-semibold text-text cursor-pointer text-center transition-colors duration-150 hover:bg-border"
              onClick={() => window.tomato.togglePause()}
            >
              {state.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="flex-1 px-2.5 py-2.5 rounded-[10px] border border-accent/20 bg-cream text-sm font-semibold text-accent cursor-pointer text-center transition-colors duration-150 hover:bg-[#FEE4E2]"
              onClick={() => window.tomato.endSession()}
            >
              End session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
