import './debate.css';

export type MicTone = 'heard' | 'live' | 'warn' | 'off' | 'error';

const BARS = 5;

/** Your mic, always on screen: an icon, five bars that move with your voice,
    and one line of what that means right now. A blocked or failed mic shows
    its error and the Retry here, where you would look for it.

    Shared by the match (Debate.tsx, on the paper strip) and the daily
    rebuttal (Drill.tsx, on the dark card: `dark`). Only the text is the live
    region, so a screen reader hears "The judge hears you", not the button. */
export default function MicCheck({
  level,
  tone,
  text,
  retry,
  dark,
}: {
  level: number;
  tone: MicTone;
  text: string;
  retry?: { label: string; onClick: () => void };
  dark?: boolean;
}) {
  const lit = level <= 0.02 ? 0 : Math.min(BARS, Math.ceil(level * 10));
  return (
    <div className={`dv-mic dv-mic-${tone} ${dark ? 'dv-mic-dark' : ''}`}>
      <svg className="dv-mic-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <rect x="5.25" y="1" width="5.5" height="9" rx="2.75" fill="currentColor" />
        <path
          d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15M5.5 15h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {tone === 'off' ? (
          <>
            <path d="M2.5 1.5l11 13" stroke={dark ? '#1d1e36' : '#efe8d8'} strokeWidth="3.5" strokeLinecap="round" />
            <path d="M2.5 1.5l11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : null}
      </svg>
      <span className="dv-bars" aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} className={i < lit ? 'on' : ''} />
        ))}
      </span>
      <span className="dv-mic-text" role="status">
        {text}
      </span>
      {retry ? (
        <button className="btn btn-small dv-retry" onClick={retry.onClick}>
          {retry.label}
        </button>
      ) : null}
    </div>
  );
}
