import { useSessionStore } from '../store/sessionStore';
import { Button } from '../components/ui/Button';

export function NudgePage() {
  const intention = useSessionStore((s) => s.state.intention);

  const nudgeText = intention
    ? `I noticed you don't seem to be working on "${intention}" right now.`
    : "I noticed you don't seem to be working on your focus task right now.";

  return (
    <div
      id="bubble"
      className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-[0_14px_50px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.08)] [-webkit-app-region:drag]"
    >
      <div className="font-serif text-base italic leading-normal text-text [&_strong]:font-medium">
        {nudgeText}
      </div>
      <div className="flex gap-2 [-webkit-app-region:no-drag]">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 rounded-lg py-2.5 text-xs"
          onClick={() => window.tomato.nudgePause()}
        >
          Pause session
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="flex-1 rounded-lg py-2.5 text-xs shadow-none"
          onClick={() => window.tomato.nudgeRefocus()}
        >
          Refocus
        </Button>
      </div>
    </div>
  );
}
