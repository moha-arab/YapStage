// Bold, iconic SVG avatars for each bot — poster-style, single accent color,
// hard edges. `speaking` drives the mouth/glow animation during the bot's turn.

const COLOR: Record<string, string> = {
  for: 'var(--for)',
  against: 'var(--against)',
  gold: 'var(--gold)',
  ink: 'var(--ink)',
};

interface Props {
  botId: string;
  color: string;
  speaking?: boolean;
  size?: number;
}

function Face({ id, c }: { id: string; c: string }) {
  const cream = 'var(--ink)';
  const dark = '#141210';
  switch (id) {
    case 'professor':
      return (
        <>
          <rect x="26" y="30" width="48" height="52" rx="6" fill={cream} />
          {/* mortarboard */}
          <polygon points="18,26 50,14 82,26 50,38" fill={c} />
          <rect x="46" y="30" width="8" height="8" fill={c} />
          <line x1="82" y1="26" x2="82" y2="44" stroke={c} strokeWidth="3" />
          <circle cx="82" cy="46" r="4" fill="var(--gold)" />
          {/* round glasses */}
          <circle cx="40" cy="52" r="9" fill="none" stroke={dark} strokeWidth="3.5" />
          <circle cx="60" cy="52" r="9" fill="none" stroke={dark} strokeWidth="3.5" />
          <line x1="49" y1="52" x2="51" y2="52" stroke={dark} strokeWidth="3.5" />
          <circle cx="40" cy="52" r="2.5" fill={dark} />
          <circle cx="60" cy="52" r="2.5" fill={dark} />
          <rect className="bot-mouth" x="43" y="68" width="14" height="4" rx="2" fill={dark} />
        </>
      );
    case 'firebrand':
      return (
        <>
          {/* flame hair */}
          <polygon points="24,40 30,14 40,34 50,10 60,34 70,14 76,40" fill={c} />
          <rect x="26" y="34" width="48" height="48" rx="6" fill={cream} />
          {/* angry brows */}
          <line x1="34" y1="48" x2="46" y2="52" stroke={dark} strokeWidth="4" strokeLinecap="round" />
          <line x1="66" y1="48" x2="54" y2="52" stroke={dark} strokeWidth="4" strokeLinecap="round" />
          <circle cx="40" cy="58" r="3.5" fill={dark} />
          <circle cx="60" cy="58" r="3.5" fill={dark} />
          {/* shouting mouth */}
          <ellipse className="bot-mouth" cx="50" cy="72" rx="9" ry="7" fill={dark} />
        </>
      );
    case 'comedian':
      return (
        <>
          <rect x="26" y="28" width="48" height="54" rx="24" fill={cream} />
          {/* hair swoosh */}
          <path d="M26 40 Q50 14 74 40 L74 34 Q50 20 26 34 Z" fill={c} />
          {/* one raised brow */}
          <line x1="34" y1="48" x2="46" y2="46" stroke={dark} strokeWidth="3.5" strokeLinecap="round" />
          <line x1="54" y1="44" x2="66" y2="48" stroke={dark} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="40" cy="55" r="3.5" fill={dark} />
          <circle cx="60" cy="55" r="3.5" fill={dark} />
          {/* big grin */}
          <path className="bot-mouth" d="M38 66 Q50 80 62 66 Z" fill={dark} />
          <path d="M78 24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="var(--gold)" />
        </>
      );
    case 'closer':
      return (
        <>
          <rect x="26" y="30" width="48" height="52" rx="6" fill={cream} />
          {/* slick side hair */}
          <path d="M24 40 Q30 20 52 24 Q74 28 76 42 L76 34 Q60 14 40 20 Q26 26 24 40 Z" fill={c} />
          {/* sunglasses */}
          <rect x="32" y="48" width="16" height="10" rx="3" fill={dark} />
          <rect x="52" y="48" width="16" height="10" rx="3" fill={dark} />
          <line x1="48" y1="51" x2="52" y2="51" stroke={dark} strokeWidth="3" />
          {/* smirk */}
          <path className="bot-mouth" d="M42 70 Q52 76 60 68" fill="none" stroke={dark} strokeWidth="3.5" strokeLinecap="round" />
          {/* collar */}
          <polygon points="34,82 50,74 66,82 66,88 34,88" fill={c} />
        </>
      );
    case 'rookie':
    default:
      return (
        <>
          <rect x="27" y="34" width="46" height="48" rx="20" fill={cream} />
          {/* cap */}
          <path d="M28 40 Q50 20 72 40 Z" fill={c} />
          <rect x="24" y="40" width="30" height="6" rx="3" fill={c} />
          {/* nervous dot eyes */}
          <circle cx="41" cy="56" r="3.5" fill={dark} />
          <circle cx="59" cy="56" r="3.5" fill={dark} />
          {/* small worried smile */}
          <path className="bot-mouth" d="M43 70 Q50 74 57 70" fill="none" stroke={dark} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="68" cy="70" r="3" fill="var(--for)" opacity="0.5" />
        </>
      );
  }
}

export default function BotAvatar({ botId, color, speaking, size = 120 }: Props) {
  const c = COLOR[color] ?? 'var(--gold)';
  return (
    <div
      className={`bot-avatar ${speaking ? 'bot-speaking' : ''}`}
      style={{ width: size, height: size, borderColor: c }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
        <Face id={botId} c={c} />
      </svg>
    </div>
  );
}
