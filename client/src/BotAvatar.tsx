// Bot avatars: the eight animals and the YapMaster, drawn as busts in
// botcast.ts (GENERATED, same frame and language as the player characters in
// cast.ts). The old flat floating heads are still in git; they did not read as
// being on par with the masks, so the cast was redrawn. The SVGs are static
// and self-authored, so dangerouslySetInnerHTML is safe here and keeps them
// legible.
//
// The FLAT poster style is the identity: a "higher quality" Pip with gradients
// and shading read as off-brand. What changed in the redraw is the
// construction, not the register: head and shoulders, two tones per mass,
// costume and expression doing the personality.
//
// The busts hold STILL. The mouths used to flap on a fixed keyframe while the
// bot spoke; that read as cheap, and the speaking ring (VideoTile.tsx) carries
// the voice instead.
import { BOT_CAST } from './botcast';

// The frame colour. `gold` no longer resolves to gold: gold is the prize in
// this app (a win, a rating gain) and nobody wears it before winning anything.
const COLOR: Record<string, string> = {
  for: 'var(--for)',
  against: 'var(--against)',
  gold: 'var(--paper)',
  ink: 'var(--ink)',
};

interface Props {
  botId: string;
  color: string;
  size?: number | string;
  /** No frame, no background: just the drawing, for the lobby's lit stage. */
  bare?: boolean;
}

export default function BotAvatar({ botId, color, size = 120, bare }: Props) {
  const c = COLOR[color] ?? 'var(--paper)';
  const svg = BOT_CAST[botId] ?? BOT_CAST.rabbit;
  if (bare) {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: size, height: size, display: 'block' }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <div className="bot-avatar" style={{ width: size, height: size, borderColor: c }}>
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
