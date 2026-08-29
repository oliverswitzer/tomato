import { useState, useEffect } from 'react';
import type { DebugPipelineState, TimelineEntryIpc, BatchHistoryEntry } from '@shared/ipc';
import { Badge } from '../components/ui/Badge';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function Expandable({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-start gap-1 w-full text-left font-mono text-[11px] bg-transparent border-none p-0 cursor-pointer text-[#6B6259]"
      >
        <span className="text-[9px] shrink-0 mt-0.5 w-2.5">{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && (
        <div className="mt-1 ml-3.5 pl-2.5 border-l-2 border-border">
          {children}
        </div>
      )}
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 mb-3 bg-white border border-[#E0D8CC] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[10px] font-bold uppercase m-0 text-subtle tracking-[1.2px]">
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
      <span className="font-mono text-[11px] shrink-0 w-[70px] text-subtle">
        {formatTime(entry.timestamp)}
      </span>
      <span className="shrink-0 text-xs">{icon}</span>
      <Badge className={isPassive ? 'bg-[#F3E5F5] text-[#9C27B0]' : 'bg-[#F5F0E8] text-muted'}>
        {entry.eventType}
      </Badge>
      <span className="text-[11px] shrink-0 text-[#6B6259]">{entry.app}</span>
      <span className="text-[11px] truncate min-w-0 text-muted">{entry.window}</span>
    </span>
  );

  return (
    <div className="py-1 border-b border-[#F5F0E8]">
      <Expandable label={label}>
        <pre className="font-mono text-[11px] rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto mt-1 text-[#6B6259] bg-cream border border-border">
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
      <span className="font-mono text-[11px] shrink-0 w-[70px] text-subtle">
        {formatTime(entry.timestamp)}
      </span>
      <Badge className="bg-[#E8EAF6] text-[#5C6BC0]">{entry.level2Classification}</Badge>
      <Badge variant={entry.isDrifting ? 'accent' : 'success'}>
        {entry.isDrifting ? `Drift ${Math.round(entry.confidence * 100)}%` : 'On track'}
      </Badge>
      <span className="font-mono text-[11px] shrink-0 text-[#D97706]">
        ${entry.costUsd.toFixed(4)}
      </span>
      <span className="text-[11px] truncate min-w-0 text-[#6B6259]">{entry.summary}</span>
    </span>
  );

  return (
    <div className="py-1.5 border-b border-[#F5F0E8]">
      <Expandable label={label}>
        <div className="font-mono text-[11px] mb-0.5">
          <span className="text-subtle">summary: </span>
          <span className="text-text">{entry.summary}</span>
        </div>
        <div className="font-mono text-[11px] mb-0.5">
          <span className="text-subtle">drift reason: </span>
          <span className="text-text">{entry.reason}</span>
        </div>
        <div className="font-mono text-[11px] mb-0.5">
          <span className="text-subtle">tokens: </span>
          <span className="text-text">{entry.inputTokens} in / {entry.outputTokens} out</span>
          <span className="ml-2 text-[#D97706]">${entry.costUsd.toFixed(4)}</span>
        </div>
        <div className="mt-1.5">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="bg-transparent border-none p-0 cursor-pointer font-mono text-[11px] font-semibold hover:underline text-accent"
          >
            {showPrompt ? 'Hide' : 'Show'} full prompt
          </button>
          {showPrompt && (
            <pre className="font-mono text-[11px] rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto mt-1 text-[#6B6259] bg-cream border border-border">
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
    <div className="min-h-screen p-6 overflow-auto bg-cream select-text">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold tracking-tight m-0 text-text">
            Debug Dashboard
          </h1>
          <span className="text-[11px] font-mono text-muted">screenpipe pipeline</span>
        </div>

        <Panel title={`Live Timeline (${timelineEntries.length} events)`}>
          {timelineEntries.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto">
              {[...timelineEntries].reverse().map((e, i) => (
                <TimelineEntryRow key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">No activity yet. Start a session.</div>
          )}
        </Panel>

        <Panel
          title={`Batch History (${batchHistory.length} summaries)`}
          right={
            <span className="text-[11px] font-mono font-semibold text-[#D97706]">
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
            <div className="text-sm text-muted">
              No batch summaries yet. First one runs after ~60 seconds.
            </div>
          )}
        </Panel>

        <Panel title="LLM State">
          <div className="flex items-center gap-2 text-sm text-text">
            Pending call:
            <Badge
              variant={pipelineState?.pendingLlmCall ? 'warning' : 'neutral'}
              className={pipelineState?.pendingLlmCall ? 'bg-[#FFF8E1] text-[#D97706]' : undefined}
            >
              {pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
            </Badge>
          </div>
        </Panel>
      </div>
    </div>
  );
}
