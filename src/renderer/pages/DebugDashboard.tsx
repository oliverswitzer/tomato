import { useState, useEffect } from 'react';
import type { ScreenpipeFrame, DebugPipelineState, TimelineEntryIpc, BatchHistoryEntry } from '@shared/ipc';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#EFE8DD] bg-white p-4 space-y-3">
      <h2 className="text-xs font-bold text-[#BAA898] tracking-[1.4px] uppercase">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ label, color = '#8B8477' }: { label: string; color?: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}15`, color }}
    >
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function Expandable({ label, children, defaultOpen = false }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-[#6B6259] hover:text-[#2A2A2A] font-mono w-full text-left"
      >
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && <div className="mt-1 ml-3">{children}</div>}
    </div>
  );
}

function TimelineEntryRow({ entry }: { entry: TimelineEntryIpc }) {
  const icon = entry.eventType === 'app_switch' ? '⇄'
    : entry.eventType === 'clipboard' ? '📋'
    : entry.eventType === 'passive' ? '👁'
    : '⌨';

  const label = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-[#BAA898] shrink-0 w-16">{formatTime(entry.timestamp)}</span>
      <span className="shrink-0">{icon}</span>
      <Badge label={entry.eventType} color={entry.eventType === 'passive' ? '#9C27B0' : '#8B8477'} />
      <span className="text-[#6B6259] shrink-0">{entry.app}</span>
      <span className="text-[#8B8477] truncate">{entry.window}</span>
    </span>
  );

  const hasDetails = entry.typedText || entry.browserUrl || entry.accessibilityHints.length > 0 || entry.passiveContext;

  if (!hasDetails) {
    return <div className="py-1 border-b border-[#F0EAE2] last:border-0 font-mono text-xs">{label}</div>;
  }

  return (
    <div className="py-1 border-b border-[#F0EAE2] last:border-0 font-mono text-xs">
      <Expandable label={label}>
        <div className="space-y-1 text-[11px] mt-1 pl-2 border-l-2 border-[#EFE8DD]">
          {entry.browserUrl && (
            <div><span className="text-[#BAA898]">url:</span> <span className="text-[#5C6BC0]">{entry.browserUrl}</span></div>
          )}
          {entry.typedText && (
            <div><span className="text-[#BAA898]">typed:</span> <span className="text-[#2A2A2A]">"{entry.typedText}"</span></div>
          )}
          {entry.timestampEnd && (
            <div><span className="text-[#BAA898]">duration:</span> {formatTime(entry.timestamp)} — {formatTime(entry.timestampEnd)}</div>
          )}
          {entry.accessibilityHints.length > 0 && (
            <div><span className="text-[#BAA898]">headings:</span> {entry.accessibilityHints.join(', ')}</div>
          )}
          {entry.passiveContext && (
            <div className="space-y-0.5">
              {entry.passiveContext.urls.length > 0 && (
                <div><span className="text-[#BAA898]">passive urls:</span> <span className="text-[#5C6BC0]">{entry.passiveContext.urls.join(', ')}</span></div>
              )}
              {entry.passiveContext.screenText && (
                <div><span className="text-[#BAA898]">screen text:</span> <span className="text-[#6B6259]">{entry.passiveContext.screenText.slice(0, 200)}</span></div>
              )}
              {entry.passiveContext.clickTargets.length > 0 && (
                <div><span className="text-[#BAA898]">clicks:</span> {entry.passiveContext.clickTargets.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      </Expandable>
    </div>
  );
}

function BatchHistoryRow({ entry }: { entry: BatchHistoryEntry }) {
  const label = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-[#BAA898] shrink-0 w-16">{formatTime(entry.timestamp)}</span>
      <Badge label={entry.level2Classification} color="#5C6BC0" />
      <Badge
        label={entry.isDrifting ? `Drift ${Math.round(entry.confidence * 100)}%` : 'On track'}
        color={entry.isDrifting ? '#E2574C' : '#2E7D32'}
      />
      <span className="text-[#6B6259] truncate">{entry.summary}</span>
    </span>
  );

  return (
    <div className="py-1.5 border-b border-[#F0EAE2] last:border-0 font-mono text-xs">
      <Expandable label={label}>
        <div className="space-y-2 mt-1 pl-2 border-l-2 border-[#EFE8DD]">
          <div className="text-[11px]">
            <div><span className="text-[#BAA898]">summary:</span> <span className="text-[#2A2A2A]">{entry.summary}</span></div>
            <div><span className="text-[#BAA898]">drift reason:</span> <span className="text-[#6B6259]">{entry.reason}</span></div>
          </div>
          <Expandable label={<span className="text-[#E2574C] font-semibold">Show full prompt</span>}>
            <pre className="text-[11px] text-[#6B6259] whitespace-pre-wrap break-words bg-[#FBF7F1] rounded-lg p-3 border border-[#EFE8DD] max-h-80 overflow-auto mt-1">
              {entry.prompt}
            </pre>
          </Expandable>
        </div>
      </Expandable>
    </div>
  );
}

export function DebugDashboard() {
  const [frames, setFrames] = useState<ScreenpipeFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  async function handleCapture() {
    setLoading(true);
    setError(null);
    try {
      const result = await window.tomato.capture();
      if (result.error) {
        setError(result.error);
        setFrames([]);
      } else {
        setFrames(result.frames ?? []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const poll = pipelineState?.currentPollState;
  const batchHistory = pipelineState?.batchHistory ?? [];

  return (
    <div className="min-h-screen bg-[#FBF7F1] p-6 font-sans overflow-auto" style={{ userSelect: 'text' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#2A2A2A] tracking-tight">
            Debug Dashboard
          </h1>
          <span className="text-xs font-mono text-[#8B8477]">screenpipe DB pipeline</span>
        </div>

        {/* Poll State */}
        <Panel title="Poll State">
          {poll ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-[#2A2A2A]">{poll.activeApp || '—'}</span>
                <span className="text-[#8B8477]">&mdash; {poll.windowTitle || '—'}</span>
                <Badge
                  label={poll.screenpipeStatus}
                  color={poll.screenpipeStatus === 'ok' ? '#2E7D32' : '#E2574C'}
                />
              </div>
              <div className="text-xs text-[#BAA898]">
                Last tick: {formatTime(poll.timestamp)}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8B8477]">No poll data yet. Start a session.</div>
          )}
        </Panel>

        {/* Live Timeline */}
        <Panel title={`Live Timeline (${timelineEntries.length} events)`}>
          {timelineEntries.length > 0 ? (
            <div className="space-y-0 max-h-96 overflow-auto">
              {[...timelineEntries].reverse().map((e, i) => (
                <TimelineEntryRow key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#8B8477]">No activity yet. Start a session and type something.</div>
          )}
        </Panel>

        {/* Batch History */}
        <Panel title={`Batch History (${batchHistory.length} summaries)`}>
          {batchHistory.length > 0 ? (
            <div className="space-y-0 max-h-[500px] overflow-auto">
              {[...batchHistory].reverse().map((entry, i) => (
                <BatchHistoryRow key={i} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#8B8477]">No batch summaries yet. First one runs after ~60 seconds.</div>
          )}
        </Panel>

        {/* LLM State */}
        <Panel title="LLM State">
          <div className="text-sm flex items-center gap-2">
            <span className="text-[#2A2A2A]">Pending call:</span>
            <Badge
              label={pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
              color={pipelineState?.pendingLlmCall ? '#F0A020' : '#8B8477'}
            />
          </div>
        </Panel>

        {/* Raw Screenpipe Capture */}
        <Panel title="Raw Screenpipe Capture">
          <button
            onClick={handleCapture}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all
              bg-[#E2574C] text-white shadow-[0_4px_14px_rgba(226,87,76,0.25)]
              hover:bg-[#D04A3F] hover:shadow-[0_6px_18px_rgba(226,87,76,0.35)]
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Capturing...' : 'Capture Latest Frames'}
          </button>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {frames.length > 0 && (
            <div className="space-y-2">
              {frames.map((frame, i) => (
                <div key={i} className="rounded-lg border border-[#EFE8DD] bg-[#FBF7F1] p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E2574C]" />
                    <span className="font-mono text-sm font-semibold text-[#2A2A2A]">{frame.app}</span>
                    <span className="text-xs text-[#8B8477]">&mdash; {frame.window}</span>
                    {frame.focused && <Badge label="focused" color="#2E7D32" />}
                  </div>
                  <div className="text-[10px] text-[#BAA898]">
                    {new Date(frame.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
