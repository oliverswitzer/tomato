import { useState, useEffect, useCallback } from 'react';
import { formatTime, formatActivityTime } from '@shared/utils';
import type { Activity, SessionStateWithActivities } from '@shared/ipc';
import './HudPage.css';

export function HudPage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isDrifting, setIsDrifting] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [state, setState] = useState<SessionStateWithActivities>({
    active: false,
    intention: '',
    durationMin: 25,
    remainingSec: 1500,
    paused: false,
    activities: [],
  });

  const latestSummary =
    activities.length > 0
      ? activities[activities.length - 1].summary
      : state.intention || 'Starting session...';

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      window.tomato.hudResize(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const unsubs = [
      window.tomato.onSessionState((s) => {
        setState(s);
        if (s.activities && s.activities.length > 0) {
          setActivities(s.activities);
        }
      }),
      window.tomato.onActivityUpdate((activity) => {
        setActivities((prev) => {
          const next = [...prev, activity];
          return next.length > 100 ? next.slice(1) : next;
        });
      }),
      window.tomato.onDriftDetected(() => {
        setIsDrifting(true);
      }),
      window.tomato.onSessionEnded(() => {
        setSessionEnded(true);
      }),
    ];

    window.tomato.hudReady();

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const timeStr = sessionEnded ? '00:00' : formatTime(state.remainingSec);
  const displaySummary = sessionEnded ? 'Session complete!' : latestSummary;
  const progress = sessionEnded
    ? 0
    : (state.remainingSec / (state.durationMin * 60)) * 100;

  let badgeClass = 'status-badge on-track';
  let badgeDotColor = '#2E7D32';
  let badgeText = 'On track';

  if (sessionEnded) {
    badgeText = 'Done';
  } else if (state.paused) {
    badgeClass = 'status-badge paused';
    badgeDotColor = '#E65100';
    badgeText = 'Paused';
  } else if (isDrifting) {
    badgeClass = 'status-badge paused';
    badgeDotColor = '#E2574C';
    badgeText = 'Off track';
  }

  const recentTimeline = activities.slice(-6).reverse();

  return (
    <div id="hud">
      {!isExpanded && (
        <div id="collapsed">
          <div className="top-row">
            <div className="tomato-avatar">🍅</div>
            <div className="text-col">
              <div className="timer-row">
                <span className="timer-time">{timeStr}</span>
                <span className={badgeClass}>
                  <span className="dot" style={{ background: badgeDotColor }} />
                  {badgeText}
                </span>
              </div>
              <div className="summary-text">{displaySummary}</div>
            </div>
          </div>
          <div className="divider" />
          <div className="bottom-row">
            <span className="focused-label">FOCUSED</span>
            <span className="spacer" />
            <button
              className="expand-btn no-drag"
              onClick={toggleExpand}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {isExpanded && (
        <div id="expanded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="session-badge">
              <span className="dot" />
              <span>POMODORO &bull; {state.durationMin} MIN</span>
            </div>
            <button className="expand-btn no-drag" onClick={toggleExpand}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18,15 12,9 6,15" />
              </svg>
            </button>
          </div>

          <div className="expanded-header">
            <div className="expanded-avatar">🍅</div>
            <div className="header-info">
              <span className="header-label">SESSION TIMER</span>
              <span className="header-time">{timeStr}</span>
            </div>
          </div>

          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>

          <div className="activity-section">
            <span className="activity-label">CURRENT ACTIVITY</span>
            <div className="activity-text">{displaySummary}</div>
          </div>

          <div className="timeline-section">
            <div className="timeline-header">
              <span className="timeline-label">
                LAST {state.durationMin} MINUTES
              </span>
              <span className="timeline-count">
                {activities.length} ACTIVIT{activities.length === 1 ? 'Y' : 'IES'}
              </span>
            </div>
            <div>
              {recentTimeline.length === 0 ? (
                <div className="timeline-entry">
                  <div className="entry-header">
                    <span className="entry-dot" />
                    <span className="entry-duration">0:00</span>
                  </div>
                  <div className="entry-desc">Waiting for screen activity...</div>
                  <div className="entry-time">now</div>
                </div>
              ) : (
                recentTimeline.map((a) => (
                  <div className="timeline-entry" key={a.timestamp}>
                    <div className="entry-header">
                      <span
                        className="entry-dot"
                        style={{ background: isDrifting ? '#E2574C' : '#7CB342' }}
                      />
                      <span className="entry-duration">
                        {formatActivityTime(a.timestamp)}
                      </span>
                    </div>
                    <div className="entry-desc">{a.summary}</div>
                    <div className="entry-time">{a.apps.join(', ') || 'unknown'}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="hud-controls no-drag">
            <button className="hud-btn" onClick={() => window.tomato.togglePause()}>
              {state.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="hud-btn danger"
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
