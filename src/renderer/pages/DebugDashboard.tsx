import { useState, useEffect } from 'react';
import type { DebugPipelineState, TimelineEntryIpc, BatchHistoryEntry } from '@shared/ipc';

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: bg, color }}
    >
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
        className="flex items-start gap-1 w-full text-left font-mono text-[11px] bg-transparent border-none p-0 cursor-pointer"
        style={{ color: '#6B6259' }}
      >
        <span className="text-[9px] shrink-0 mt-0.5 w-2.5">{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && (
        <div className="mt-1 ml-3.5 pl-2.5 border-l-2" style={{ borderColor: '#EFE8DD' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: '#FFFFFF', border: '1px solid #EFE8DD' }}>
      <div className="flex items-center justify-between mb-2.5">
        <h2
          className="text-[10px] font-bold tracking-wider uppercase m-0"
          style={{ color: '#BAA898', letterSpacing: 1.2 }}
        >
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
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-[11px] shrink-0 w-[70px]" style={{ color: '#BAA898' }}>
        {formatTime(entry.timestamp)}
      </span>
      <span className="shrink-0 text-xs">{icon}</span>
      <Badge
        label={entry.eventType}
        bg={isPassive ? '#F3E5F5' : '#F5F0E8'}
        color={isPassive ? '#9C27B0' : '#8B8477'}
      />
      <span className="text-[11px] shrink-0" style={{ color: '#6B6259' }}>{entry.app}</span>
      <span className="text-[11px] truncate min-w-0" style={{ color: '#8B8477' }}>{entry.window}</span>
    </span>
  );

  return (
    <div className="py-1" style={{ borderBottom: '1px solid #F5F0E8' }}>
      <Expandable label={label}>
        <pre
          className="font-mono text-[11px] rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto mt-1"
          style={{ color: '#6B6259', background: '#FBF7F1', border: '1px solid #EFE8DD' }}
        >
          {JSON.stringify(entry, null, 2)}
        </pre>
      </Expandable>
    </div>
  );
}

function BatchHistoryRow({ entry }: { entry: BatchHistoryEntry }) {
  const [showPrompt, setShowPrompt] = useState(false);

  const label = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-[11px] shrink-0 w-[70px]" style={{ color: '#BAA898' }}>
        {formatTime(entry.timestamp)}
      </span>
      <Badge label={entry.level2Classification} bg="#E8EAF6" color="#5C6BC0" />
      <Badge
        label={entry.isDrifting ? `Drift ${Math.round(entry.confidence * 100)}%` : 'On track'}
        bg={entry.isDrifting ? '#FFEBEE' : '#E8F5E9'}
        color={entry.isDrifting ? '#E2574C' : '#2E7D32'}
      />
      <span className="font-mono text-[11px] shrink-0" style={{ color: '#D97706' }}>
        ${entry.costUsd.toFixed(4)}
      </span>
      <span className="text-[11px] truncate min-w-0" style={{ color: '#6B6259' }}>{entry.summary}</span>
    </span>
  );

  return (
    <div className="py-1.5" style={{ borderBottom: '1px solid #F5F0E8' }}>
      <Expandable label={label}>
        <div className="font-mono text-[11px] mb-0.5">
          <span style={{ color: '#BAA898' }}>summary: </span>
          <span style={{ color: '#2A2A2A' }}>{entry.summary}</span>
        </div>
        <div className="font-mono text-[11px] mb-0.5">
          <span style={{ color: '#BAA898' }}>drift reason: </span>
          <span style={{ color: '#2A2A2A' }}>{entry.reason}</span>
        </div>
        <div className="font-mono text-[11px] mb-0.5">
          <span style={{ color: '#BAA898' }}>tokens: </span>
          <span style={{ color: '#2A2A2A' }}>{entry.inputTokens} in / {entry.outputTokens} out</span>
          <span className="ml-2" style={{ color: '#D97706' }}>${entry.costUsd.toFixed(4)}</span>
        </div>
        <div className="mt-1.5">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="bg-transparent border-none p-0 cursor-pointer font-mono text-[11px] font-semibold hover:underline"
            style={{ color: '#E2574C' }}
          >
            {showPrompt ? 'Hide' : 'Show'} full prompt
          </button>
          {showPrompt && (
            <pre
              className="font-mono text-[11px] rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto mt-1"
              style={{ color: '#6B6259', background: '#FBF7F1', border: '1px solid #EFE8DD' }}
            >
              {entry.prompt}
            </pre>
          )}
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
    <div
      className="min-h-screen p-6 overflow-auto"
      style={{ background: '#FBF7F1', userSelect: 'text', WebkitUserSelect: 'text' }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold tracking-tight m-0" style={{ color: '#2A2A2A' }}>
            Debug Dashboard
          </h1>
          <span className="text-[11px] font-mono" style={{ color: '#8B8477' }}>screenpipe pipeline</span>
        </div>

        <Panel title={`Live Timeline (${timelineEntries.length} events)`}>
          {timelineEntries.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto">
              {[...timelineEntries].reverse().map((e, i) => (
                <TimelineEntryRow key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="text-sm" style={{ color: '#8B8477' }}>No activity yet. Start a session.</div>
          )}
        </Panel>

        <Panel
          title={`Batch History (${batchHistory.length} summaries)`}
          right={
            <span className="text-[11px] font-mono font-semibold" style={{ color: '#D97706' }}>
              Session: ${sessionCost.toFixed(4)}
            </span>
          }
        >
          {batchHistory.length > 0 ? (
            <div className="max-h-[500px] overflow-y-auto">
              {[...batchHistory].reverse().map((entry, i) => (
                <BatchHistoryRow key={i} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="text-sm" style={{ color: '#8B8477' }}>
              No batch summaries yet. First one runs after ~60 seconds.
            </div>
          )}
        </Panel>

        <Panel title="LLM State">
          <div className="flex items-center gap-2 text-sm" style={{ color: '#2A2A2A' }}>
            Pending call:
            <Badge
              label={pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
              bg={pipelineState?.pendingLlmCall ? '#FFF8E1' : '#F5F0E8'}
              color={pipelineState?.pendingLlmCall ? '#D97706' : '#8B8477'}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
