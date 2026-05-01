import { useState, useEffect } from 'react';
import type { DebugPipelineState, TimelineEntryIpc, BatchHistoryEntry } from '@shared/ipc';

const colors = {
  bg: '#FBF7F1',
  white: '#FFFFFF',
  border: '#EFE8DD',
  textPrimary: '#2A2A2A',
  textSecondary: '#6B6259',
  textMuted: '#8B8477',
  textFaint: '#BAA898',
  panelBg: '#F5F0E8',
  red: '#E2574C',
  green: '#2E7D32',
  greenBg: '#E8F5E9',
  redBg: '#FFEBEE',
  blue: '#5C6BC0',
  blueBg: '#E8EAF6',
  purple: '#9C27B0',
  purpleBg: '#F3E5F5',
  amber: '#D97706',
  amberBg: '#FFF8E1',
};

const mono = "'SF Mono', 'Menlo', monospace";

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 600,
      padding: '2px 8px', borderRadius: 99, background: bg, color, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function Expandable({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontFamily: mono, fontSize: 11, color: colors.textSecondary,
          display: 'flex', alignItems: 'flex-start', gap: 4, width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 9, flexShrink: 0, marginTop: 2, width: 10 }}>{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && (
        <div style={{ marginTop: 4, marginLeft: 14, paddingLeft: 10, borderLeft: `2px solid ${colors.border}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: colors.white, border: `1px solid ${colors.border}`,
      borderRadius: 16, padding: '14px 16px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{
          fontSize: 10, fontWeight: 700, color: colors.textFaint,
          letterSpacing: 1.2, textTransform: 'uppercase', margin: 0,
        }}>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function TimelineEntryRow({ entry }: { entry: TimelineEntryIpc }) {
  const icon = entry.eventType === 'app_switch' ? '⇄'
    : entry.eventType === 'clipboard' ? '📋'
    : entry.eventType === 'passive' ? '👁'
    : '⌨';

  const isPassive = entry.eventType === 'passive';

  const label = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint, flexShrink: 0, width: 70 }}>
        {formatTime(entry.timestamp)}
      </span>
      <span style={{ flexShrink: 0, fontSize: 12 }}>{icon}</span>
      <Badge
        label={entry.eventType}
        bg={isPassive ? colors.purpleBg : colors.panelBg}
        color={isPassive ? colors.purple : colors.textMuted}
      />
      <span style={{ fontSize: 11, color: colors.textSecondary, flexShrink: 0 }}>{entry.app}</span>
      <span style={{
        fontSize: 11, color: colors.textMuted,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {entry.window}
      </span>
    </span>
  );

  return (
    <div style={{ padding: '5px 0', borderBottom: `1px solid ${colors.panelBg}` }}>
      <Expandable label={label}>
        <pre style={{
          fontFamily: mono, fontSize: 11, color: colors.textSecondary,
          background: colors.bg, border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 300, overflowY: 'auto', marginTop: 4,
        }}>
          {JSON.stringify(entry, null, 2)}
        </pre>
      </Expandable>
    </div>
  );
}

function BatchHistoryRow({ entry }: { entry: BatchHistoryEntry }) {
  const [showPrompt, setShowPrompt] = useState(false);

  const label = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <span style={{ fontFamily: mono, fontSize: 11, color: colors.textFaint, flexShrink: 0, width: 70 }}>
        {formatTime(entry.timestamp)}
      </span>
      <Badge label={entry.level2Classification} bg={colors.blueBg} color={colors.blue} />
      <Badge
        label={entry.isDrifting ? `Drift ${Math.round(entry.confidence * 100)}%` : 'On track'}
        bg={entry.isDrifting ? colors.redBg : colors.greenBg}
        color={entry.isDrifting ? colors.red : colors.green}
      />
      <span style={{ fontFamily: mono, fontSize: 11, color: colors.amber, flexShrink: 0 }}>
        ${entry.costUsd.toFixed(4)}
      </span>
      <span style={{
        fontSize: 11, color: colors.textSecondary,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
      }}>
        {entry.summary}
      </span>
    </span>
  );

  const preStyle = {
    fontFamily: mono, fontSize: 11, color: colors.textSecondary,
    background: colors.bg, border: `1px solid ${colors.border}`,
    borderRadius: 8, padding: 10, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
    maxHeight: 300, overflowY: 'auto' as const, marginTop: 4,
  };

  return (
    <div style={{ padding: '6px 0', borderBottom: `1px solid ${colors.panelBg}` }}>
      <Expandable label={label}>
        <div style={{ fontFamily: mono, fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: colors.textFaint }}>summary: </span>
          <span style={{ color: colors.textPrimary }}>{entry.summary}</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: colors.textFaint }}>drift reason: </span>
          <span style={{ color: colors.textPrimary }}>{entry.reason}</span>
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: colors.textFaint }}>tokens: </span>
          <span style={{ color: colors.textPrimary }}>{entry.inputTokens} in / {entry.outputTokens} out</span>
          <span style={{ color: colors.amber, marginLeft: 8 }}>${entry.costUsd.toFixed(4)}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: mono, fontSize: 11, fontWeight: 600, color: colors.red,
            }}
          >
            {showPrompt ? 'Hide' : 'Show'} full prompt
          </button>
          {showPrompt && <pre style={preStyle}>{entry.prompt}</pre>}
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
  const sessionCost = pipelineState?.sessionCostUsd ?? 0;

  return (
    <div style={{
      minHeight: '100vh', background: colors.bg, padding: 24,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowY: 'auto', userSelect: 'text', WebkitUserSelect: 'text',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: colors.textPrimary, letterSpacing: -0.3, margin: 0 }}>
            Debug Dashboard
          </h1>
          <span style={{ fontSize: 11, fontFamily: mono, color: colors.textMuted }}>screenpipe pipeline</span>
        </div>

        <Panel title={`Live Timeline (${timelineEntries.length} events)`}>
          {timelineEntries.length > 0 ? (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {[...timelineEntries].reverse().map((e, i) => (
                <TimelineEntryRow key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: colors.textMuted }}>No activity yet. Start a session.</div>
          )}
        </Panel>

        <Panel
          title={`Batch History (${batchHistory.length} summaries)`}
          right={
            <span style={{ fontSize: 11, fontFamily: mono, fontWeight: 600, color: colors.amber }}>
              Session: ${sessionCost.toFixed(4)}
            </span>
          }
        >
          {batchHistory.length > 0 ? (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {[...batchHistory].reverse().map((entry, i) => (
                <BatchHistoryRow key={i} entry={entry} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: colors.textMuted }}>
              No batch summaries yet. First one runs after ~60 seconds.
            </div>
          )}
        </Panel>

        <Panel title="LLM State">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textPrimary }}>
            Pending call:
            <Badge
              label={pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
              bg={pipelineState?.pendingLlmCall ? colors.amberBg : colors.panelBg}
              color={pipelineState?.pendingLlmCall ? colors.amber : colors.textMuted}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
