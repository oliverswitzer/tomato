import { useState, useEffect } from 'react';
import type { DebugPipelineState, TimelineEntryIpc, BatchHistoryEntry } from '@shared/ipc';
import './DebugDashboard.css';

function Badge({ label, variant }: { label: string; variant: string }) {
  return <span className={`badge badge-${variant}`}>{label}</span>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function Expandable({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="expand-btn" onClick={() => setOpen(!open)}>
        <span className="expand-arrow">{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && <div className="expand-body">{children}</div>}
    </div>
  );
}

function TimelineEntryRow({ entry }: { entry: TimelineEntryIpc }) {
  const icon = entry.eventType === 'app_switch' ? '⇄'
    : entry.eventType === 'clipboard' ? '📋'
    : entry.eventType === 'passive' ? '👁'
    : '⌨';

  const badgeVariant = entry.eventType === 'passive' ? 'passive' : 'muted';

  const label = (
    <span className="timeline-summary">
      <span className="timeline-time">{formatTime(entry.timestamp)}</span>
      <span className="timeline-icon">{icon}</span>
      <Badge label={entry.eventType} variant={badgeVariant} />
      <span className="timeline-app">{entry.app}</span>
      <span className="timeline-window">{entry.window}</span>
    </span>
  );

  return (
    <div className="timeline-row">
      <Expandable label={label}>
        <pre className="json-block">{JSON.stringify(entry, null, 2)}</pre>
      </Expandable>
    </div>
  );
}

function BatchHistoryRow({ entry }: { entry: BatchHistoryEntry }) {
  const [showPrompt, setShowPrompt] = useState(false);

  const label = (
    <span className="timeline-summary">
      <span className="timeline-time">{formatTime(entry.timestamp)}</span>
      <Badge label={entry.level2Classification} variant="category" />
      <Badge
        label={entry.isDrifting ? `Drift ${Math.round(entry.confidence * 100)}%` : 'On track'}
        variant={entry.isDrifting ? 'drift' : 'on-track'}
      />
      <span className="batch-summary-text">{entry.summary}</span>
    </span>
  );

  return (
    <div className="batch-row">
      <Expandable label={label}>
        <div className="detail-field">
          <span className="detail-label">summary: </span>
          <span className="detail-value">{entry.summary}</span>
        </div>
        <div className="detail-field">
          <span className="detail-label">drift reason: </span>
          <span className="detail-value">{entry.reason}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <button className="prompt-toggle" onClick={() => setShowPrompt(!showPrompt)}>
            {showPrompt ? 'Hide' : 'Show'} full prompt
          </button>
          {showPrompt && <pre className="json-block">{entry.prompt}</pre>}
        </div>
      </Expandable>
    </div>
  );
}

export function DebugDashboard() {
  const [pipelineState, setPipelineState] = useState<DebugPipelineState | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntryIpc[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const state = await window.tomato.getDebugPipelineState();
      if (state) setPipelineState(state);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = window.tomato.onTimelineUpdate((entries) => {
      setTimelineEntries((prev) => {
        const combined = [...prev, ...entries];
        return combined.slice(-200);
      });
    });
    return unsub;
  }, []);

  const batchHistory = pipelineState?.batchHistory ?? [];

  return (
    <div className="debug-window">
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div className="debug-header">
          <h1>Debug Dashboard</h1>
          <span className="subtitle">screenpipe pipeline</span>
        </div>

        {/* Live Timeline */}
        <div className="debug-panel">
          <div className="debug-panel-title">Live Timeline ({timelineEntries.length} events)</div>
          {timelineEntries.length > 0 ? (
            <div className="timeline-scroll">
              {[...timelineEntries].reverse().map((e, i) => (
                <TimelineEntryRow key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="debug-empty">No activity yet. Start a session.</div>
          )}
        </div>

        {/* Batch History */}
        <div className="debug-panel">
          <div className="debug-panel-title">Batch History ({batchHistory.length} summaries)</div>
          {batchHistory.length > 0 ? (
            <div className="batch-scroll">
              {[...batchHistory].reverse().map((entry, i) => (
                <BatchHistoryRow key={i} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="debug-empty">No batch summaries yet. First one runs after ~60 seconds.</div>
          )}
        </div>

        {/* LLM State */}
        <div className="debug-panel">
          <div className="debug-panel-title">LLM State</div>
          <div className="llm-row">
            Pending call:
            <Badge
              label={pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
              variant={pipelineState?.pendingLlmCall ? 'pending' : 'muted'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
