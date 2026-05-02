import { useState, useEffect, useCallback } from 'react';
import { formatTime, formatActivityTime } from '@shared/utils';
import type { Activity, SessionStateWithActivities } from '@shared/ipc';
import './HudPage.css';

export function HudPage() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [driftInfo, setDriftInfo] = useState<{ reason: string; confidence: number; level2Classification: string } | null>(null);
  const [apiError, setApiError] = useState<{ type: 'auth' | 'model_deprecated'; message: string } | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [liquidGlass, setLiquidGlass] = useState(false);
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
      : 'First summary in a few minutes...';

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      window.tomato.timerResize(next);
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
        setDriftInfo(null);
        setActivities((prev) => {
          const next = [...prev, activity];
          return next.length > 100 ? next.slice(1) : next;
        });
      }),
      window.tomato.onDriftDetected((data) => {
        setDriftInfo(data);
      }),
      window.tomato.onSessionEnded(() => {
        setSessionEnded(true);
      }),
      window.tomato.onApiError((data) => {
        setApiError(data);
      }),
    ];

    window.tomato.timerReady();

    window.tomato.getLiquidGlassSupported().then((supported) => {
      setLiquidGlass(supported);
    });

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const timeStr = sessionEnded ? '00:00' : formatTime(state.remainingSec);
  const displaySummary = sessionEnded ? 'Session complete!' : latestSummary;
  const progress = sessionEnded
    ? 0
    : (state.remainingSec / (state.durationMin * 60)) * 100;


  const recentTimeline = activities.slice(-6).reverse();

  let hudOpacity = 1;
  if (liquidGlass) {
    if (!driftInfo) {
      hudOpacity = 0.35;
    } else if (driftInfo.confidence < 0.6) {
      hudOpacity = 0.65;
    } else {
      hudOpacity = 1;
    }
  }

  return (
    <div
      id="session-timer"
      className={[
        liquidGlass ? 'liquid-glass' : '',
        !liquidGlass && driftInfo ? 'glow-drift' : '',
      ].join(' ').trim() || undefined}
      style={liquidGlass ? { opacity: hudOpacity } : undefined}
    >
      {/* Shared header: status badge + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          className={`session-badge${driftInfo ? ' drifting' : ''}`}
          style={driftInfo ? {
            background: 'rgba(230, 160, 0, 0.12)',
            color: '#B8860B',
          } : {
            background: 'rgba(46, 125, 50, 0.1)',
            color: '#2E7D32',
          }}
        >
          <span className="dot" style={{ background: driftInfo ? '#E6A000' : '#2E7D32' }} />
          <span>{driftInfo ? 'POSSIBLE DISTRACTION' : 'ON TRACK'} &bull; {state.durationMin} MIN</span>
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
            <polyline points={isExpanded ? '18,15 12,9 6,15' : '6,9 12,15 18,9'} />
          </svg>
        </button>
      </div>

      {/* Shared timer row */}
      <div className="top-row">
        <div className="tomato-avatar">🍅</div>
        <div className="text-col">
          <div className="timer-row">
            <span className="timer-time">{timeStr}</span>
          </div>
          <div className="summary-text">{state.intention || displaySummary}</div>
        </div>
      </div>

      {/* Shared progress bar */}
      <div className="progress-wrap">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {apiError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: liquidGlass
                ? (apiError.type === 'auth' ? 'rgba(226, 87, 76, 0.15)' : 'rgba(255, 152, 0, 0.15)')
                : (apiError.type === 'auth' ? '#FEE4E2' : '#FFF3E0'),
              borderRadius: 10,
              padding: '8px 12px',
              margin: '0 2px',
            }}
            className="no-drag"
          >
            <span style={{
              flex: 1,
              fontFamily: 'Inter, sans-serif',
              fontSize: 11,
              color: apiError.type === 'auth' ? '#7A2E25' : '#5D4037',
              lineHeight: 1.4,
            }}>
              {apiError.message}
            </span>
            <button
              onClick={() => window.tomato.openSettings()}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: 600,
                color: '#B86B60',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                padding: 0,
              }}
            >
              Settings &rarr;
            </button>
          </div>
        )}

      {isExpanded && (
        <div id="expanded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div className="activity-section">
            <span className="activity-label">CURRENT ACTIVITY</span>
            <div className="activity-text">{displaySummary}</div>
          </div>

          {driftInfo && (
            <div className="activity-section" style={{ background: liquidGlass ? 'rgba(226, 87, 76, 0.15)' : '#FEE4E2', borderRadius: 12, padding: '10px 14px' }}>
              <span className="activity-label" style={{ color: '#B42318' }}>OFF TRACK</span>
              <div style={{ fontSize: 13, color: '#2A2A2A', lineHeight: 1.4 }}>{driftInfo.reason}</div>
              <div style={{ fontSize: 11, color: '#8B8477', marginTop: 4 }}>
                {driftInfo.level2Classification} &middot; {Math.round(driftInfo.confidence * 100)}% confidence
              </div>
            </div>
          )}

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
                        style={{ background: driftInfo ? '#E2574C' : '#7CB342' }}
                      />
                      <span className="entry-duration">
                        {formatActivityTime(a.timestamp)}
                      </span>
                    </div>
                    <div className="entry-desc">{a.summary}</div>
                    {a.apps.length > 0 && <div className="entry-time">{a.apps.join(', ')}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="timer-controls no-drag">
            <button className="timer-btn" onClick={() => window.tomato.togglePause()}>
              {state.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="timer-btn danger"
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
