import { useSessionStore } from '../store/sessionStore';
import { Button } from '../components/ui/Button';

export function NudgePage() {
  const intention = useSessionStore((s) => s.state.intention);
  const lastPreDriftActivity = useSessionStore((s) => s.lastPreDriftActivity);
  const incrementResume = useSessionStore((s) => s.incrementResume);

  const nudgeText = intention
    ? `I noticed you don't seem to be working on "${intention}" right now.`
    : "I noticed you don't seem to be working on your focus task right now.";

  const handleTakeMeBack = async () => {
    if (!lastPreDriftActivity) return;
    const result = await window.tomato.takeMeBack(lastPreDriftActivity.app);
    if (result.success) {
      incrementResume();
    }
  };

  return (
    <div
      id="bubble"
      className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-[0_14px_50px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.08)] [-webkit-app-region:drag]"
    >
      <div className="font-serif text-base italic leading-normal text-text [&_strong]:font-medium">
        {nudgeText}
      </div>
      {lastPreDriftActivity && (
        <div className="[-webkit-app-region:no-drag] rounded-lg bg-neutral-50 px-3 py-2 text-xs text-text/60">
          Last seen: <span className="font-medium text-text">{lastPreDriftActivity.app}</span>
          {lastPreDriftActivity.window ? ` — ${lastPreDriftActivity.window}` : ''}
        </div>
      )}
      <div className="flex gap-2 [-webkit-app-region:no-drag]">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 rounded-lg py-2.5 text-xs"
          onClick={() => window.tomato.nudgePause()}
        >
          Pause session
        </Button>
        {lastPreDriftActivity ? (
          <Button
            variant="primary"
            size="sm"
            className="flex-1 rounded-lg py-2.5 text-xs shadow-none"
            onClick={handleTakeMeBack}
          >
            Take me back
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className="flex-1 rounded-lg py-2.5 text-xs shadow-none"
            onClick={() => window.tomato.nudgeRefocus()}
          >
            Refocus
          </Button>
        )}
      </div>
    </div>
  );
}
