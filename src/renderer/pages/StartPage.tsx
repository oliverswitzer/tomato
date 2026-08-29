import { useState, useEffect, useRef, useMemo } from 'react';
import { relativeDate } from '@shared/utils';
import type { SavedSession } from '@shared/ipc';
import { deriveRecentChips } from '@shared/chips';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

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

  const recentChips = useMemo(() => deriveRecentChips(recentSessions), [recentSessions]);

  function handleStart() {
    const text = intention.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    window.tomato.startSession(text, selectedMinutes);
  }

  return (
    <div className="bg-cream rounded-3xl px-12 pt-9 pb-8 flex flex-col items-center gap-[22px] h-screen overflow-y-auto [&::-webkit-scrollbar]:w-0">
      <div className="fixed top-0 inset-x-0 h-9 [-webkit-app-region:drag] bg-gradient-to-b from-accent/25 to-transparent rounded-t-3xl" />
      <button
        className="[-webkit-app-region:no-drag] absolute top-4 left-4 w-3 h-3 rounded-full bg-accent border-0 cursor-pointer opacity-60 transition-opacity duration-150 hover:opacity-100"
        onClick={() => window.tomato.closeStart()}
      />

      <div className="w-[72px] h-[72px] rounded-[20px] flex items-center justify-center text-[42px] drop-shadow-[0_4px_12px_rgba(226,87,76,0.15)]">
        🍅
      </div>

      <div className="text-center flex flex-col gap-1.5">
        <div className="font-serif text-[32px] font-medium text-text tracking-[-0.4px]">
          What are you working on?
        </div>
        <div className="text-sm text-muted font-normal">
          Set an intention for this session — it helps us keep you on track.
        </div>
      </div>

      <div className="[-webkit-app-region:no-drag] w-full flex flex-col gap-3">
        <div className="relative w-full">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="bg-white border-[1.5px] border-accent/20 rounded-[18px] px-5 pt-[18px] pb-7 font-serif text-lg text-text outline-none w-full shadow-[0_2px_12px_rgba(42,42,42,0.05)] transition-colors duration-200 resize-none leading-[1.4] placeholder:text-subtle focus:border-accent/50"
            placeholder="e.g. Finish the landing page hero copy"
            autoFocus
            maxLength={MAX_INTENTION_LENGTH}
            rows={3}
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStart(); } }}
          />
          <span
            className={`absolute right-4 bottom-2 text-[11px] ${
              intention.length > MAX_INTENTION_LENGTH - 20 ? 'text-accent' : 'text-subtle'
            }`}
          >
            {intention.length}/{MAX_INTENTION_LENGTH}
          </span>
        </div>
        <div className="text-xs font-medium text-muted">
          {recentChips.length > 0 ? 'Recent:' : 'Or try one:'}
        </div>
        <div className="flex gap-2 flex-wrap">
          {recentChips.length > 0
            ? recentChips.map((text, i) => (
                <div
                  key={text}
                  className="flex items-center gap-1.5 px-3.5 py-[7px] bg-white border border-border rounded-full text-[13px] font-medium text-text cursor-pointer transition-all duration-150 hover:bg-[#F7F2EA] hover:border-accent/20"
                  onClick={() => setIntention(text)}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                  {text}
                </div>
              ))
            : CHIPS.map((chip) => (
                <div
                  key={chip.text}
                  className="flex items-center gap-1.5 px-3.5 py-[7px] bg-white border border-border rounded-full text-[13px] font-medium text-text cursor-pointer transition-all duration-150 hover:bg-[#F7F2EA] hover:border-accent/20"
                  onClick={() => setIntention(chip.text)}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: chip.color }} />
                  {chip.text}
                </div>
              ))
          }
        </div>
      </div>

      <div className="[-webkit-app-region:no-drag] w-full flex flex-col gap-2.5">
        <div className="flex justify-between items-center">
          <span className="text-[13px] font-semibold text-text">Session length</span>
        </div>
        <div className="flex gap-2.5">
          {TIMER_OPTIONS.map((opt) => (
            <div
              key={opt.min}
              className={`flex-1 flex flex-col items-center gap-0.5 py-3.5 px-3 rounded-[14px] border cursor-pointer transition-all duration-200 ${
                selectedMinutes === opt.min
                  ? 'bg-accent border-accent shadow-[0_4px_14px_rgba(226,87,76,0.25)]'
                  : 'bg-white border-border hover:border-accent/40'
              }`}
              onClick={() => setSelectedMinutes(opt.min)}
            >
              <span className={`font-serif text-2xl font-medium ${selectedMinutes === opt.min ? 'text-white' : 'text-text'}`}>
                {opt.min}
              </span>
              <span className={`text-[11px] ${selectedMinutes === opt.min ? 'text-[#FBE5E3] font-semibold' : 'text-muted font-medium'}`}>
                {opt.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="[-webkit-app-region:no-drag] w-full flex flex-col items-center gap-3">
        {!hasScreenPermission && (
          <div className="w-full px-4 py-3 bg-[#FEE4E2] rounded-xl text-[13px] text-[#B42318] leading-[1.5]">
            <strong>Screen recording permission required.</strong>
            {' '}Open System Settings → Privacy & Security → Screen Recording and enable Tomato.
          </div>
        )}
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={!hasScreenPermission}
          className="w-full shadow-[0_8px_24px_rgba(226,87,76,0.3)] hover:shadow-[0_10px_28px_rgba(226,87,76,0.4)] hover:-translate-y-px active:translate-y-0"
        >
          <span className="w-[22px] h-[22px] rounded-[11px] bg-white/15 flex items-center justify-center">
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
        </Button>
      </div>

      {recentSessions.length > 0 && (
        <div className="[-webkit-app-region:no-drag] w-full flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-[13px] font-semibold text-text">Recent sessions</span>
            <span className="text-[11px] text-muted">This week</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {recentSessions.map((s, i) => (
              <Card
                key={s.startedAt}
                className="cursor-pointer flex flex-col gap-2"
                onClick={() => setIntention(s.intention)}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="flex items-start gap-1.5 text-[13px] font-semibold text-text flex-1 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]"
                      style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
                    />
                    {s.intention}
                  </span>
                  <span className="text-[11px] text-muted whitespace-nowrap shrink-0">
                    {s.actualDurationSec !== undefined
                      ? `${Math.round(s.actualDurationSec / 60)} min session`
                      : `${s.durationMin} min session`} &middot; {relativeDate(s.endedAt)}
                  </span>
                </div>
                {s.focusScore !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold ${
                        s.focusScore >= 70 ? 'text-[#7CB342]' : s.focusScore >= 40 ? 'text-[#F0A020]' : 'text-accent'
                      }`}
                    >
                      {(() => {
                        const totalSec = s.actualDurationSec ?? s.durationMin * 60;
                        const focusedSec = Math.round(totalSec * s.focusScore! / 100);
                        const fm = Math.floor(focusedSec / 60);
                        const fs = focusedSec % 60;
                        const totalMin = Math.floor(totalSec / 60);
                        const totalRemSec = totalSec % 60;
                        return `${fm}:${String(fs).padStart(2, '0')} of ${totalMin}:${String(totalRemSec).padStart(2, '0')} focused`;
                      })()}
                    </span>
                  </div>
                )}
                {s.summary && (
                  <div className="text-xs text-[#6B6259] leading-[1.5]">{s.summary}</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
