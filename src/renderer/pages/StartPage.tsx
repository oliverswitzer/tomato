import { useState, useEffect, useRef } from 'react';
import { relativeDate } from '@shared/utils';
import type { SavedSession } from '@shared/ipc';
import './StartPage.css';

const TIMER_OPTIONS = [
  { min: 15, label: 'quick' },
  { min: 25, label: 'classic' },
  { min: 45, label: 'focus' },
  { min: 60, label: 'deep' },
] as const;

const CHIPS = [
  { text: 'Writing documentation', color: '#7CB342' },
  { text: 'Debugging auth flow', color: '#E2574C' },
  { text: 'Drafting cold email', color: '#F0A020' },
] as const;

const DOT_COLORS = ['#E2574C', '#7CB342', '#F0A020', '#5C6BC0', '#26A69A'];
const MAX_INTENTION_LENGTH = 250;

export function StartPage() {
  const [intention, setIntention] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [recentSessions, setRecentSessions] = useState<SavedSession[]>([]);
  const [hasScreenPermission, setHasScreenPermission] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.tomato.getRecentSessions().then(setRecentSessions);
    window.tomato.getScreenPermission().then(setHasScreenPermission);
    const interval = setInterval(() => {
      window.tomato.getScreenPermission().then(setHasScreenPermission);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  function handleStart() {
    const text = intention.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    window.tomato.startSession(text, selectedMinutes);
  }

  return (
    <div className="start-window">
      <button
        className="close-btn no-drag"
        onClick={() => window.tomato.closeStart()}
      />

      <div className="tomato-icon">🍅</div>

      <div className="headline-section">
        <div className="headline">What are you working on?</div>
        <div className="subtitle">
          Set an intention for this session — it helps us keep you on track.
        </div>
      </div>

      <div className="input-section no-drag">
        <div style={{ position: 'relative', width: '100%' }}>
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="input-field"
            placeholder="e.g. Finish the landing page hero copy"
            autoFocus
            maxLength={MAX_INTENTION_LENGTH}
            rows={3}
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart(); } }}
          />
          <span style={{
            position: 'absolute',
            right: 16,
            bottom: 8,
            fontSize: 11,
            color: intention.length > MAX_INTENTION_LENGTH - 20 ? '#E2574C' : '#BAA898',
          }}>
            {intention.length}/{MAX_INTENTION_LENGTH}
          </span>
        </div>
        <div className="chips-label">Or try one:</div>
        <div className="chips-row">
          {CHIPS.map((chip) => (
            <div
              key={chip.text}
              className="chip"
              onClick={() => setIntention(chip.text)}
            >
              <span className="dot" style={{ background: chip.color }} />
              {chip.text}
            </div>
          ))}
        </div>
      </div>

      <div className="timer-section no-drag">
        <div className="timer-label-row">
          <span className="timer-label">Session length</span>
        </div>
        <div className="timer-options">
          {TIMER_OPTIONS.map((opt) => (
            <div
              key={opt.min}
              className={`timer-option${selectedMinutes === opt.min ? ' selected' : ''}`}
              onClick={() => setSelectedMinutes(opt.min)}
            >
              <span className="num">{opt.min}</span>
              <span className="label">{opt.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="no-drag"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {!hasScreenPermission && (
          <div style={{
            width: '100%',
            padding: '12px 16px',
            background: '#FEE4E2',
            borderRadius: 12,
            fontSize: 13,
            color: '#B42318',
            lineHeight: 1.5,
          }}>
            <strong>Screen recording permission required.</strong>
            {' '}Open System Settings → Privacy & Security → Screen Recording and enable Tomato.
          </div>
        )}
        <button
          className="start-btn"
          onClick={handleStart}
          disabled={!hasScreenPermission}
          style={!hasScreenPermission ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
        >
          <span className="icon-circle">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </span>
          Start {selectedMinutes}-minute session
        </button>
      </div>

      {recentSessions.length > 0 && (
        <div className="recent-section no-drag">
          <div className="recent-header">
            <span className="recent-title">Recent sessions</span>
            <span className="recent-date">This week</span>
          </div>
          <div>
            {recentSessions.map((s, i) => (
              <div
                key={s.startedAt}
                className="recent-card"
                onClick={() => setIntention(s.intention)}
              >
                <div className="recent-card-header">
                  <span className="recent-card-title">
                    <span
                      className="dot"
                      style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
                    />
                    {s.intention}
                  </span>
                  <span className="recent-card-meta">
                    {s.durationMin} min session &middot; {relativeDate(s.endedAt)}
                  </span>
                </div>
                {s.focusScore !== undefined && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <div style={{
                      flex: 1,
                      height: 4,
                      background: '#F0EAE2',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${s.focusScore}%`,
                        height: '100%',
                        background: s.focusScore >= 70 ? '#7CB342' : s.focusScore >= 40 ? '#F0A020' : '#E2574C',
                        borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#8B8477' }}>
                      {s.focusScore}%
                    </span>
                  </div>
                )}
                {s.summary && (
                  <div className="recent-card-desc">{s.summary}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
