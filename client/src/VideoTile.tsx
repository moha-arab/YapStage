import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Side } from '../../server/src/protocol';
import { useI18n } from './i18n';
import Mask, { MASK_IDS } from './Mask';

interface Props {
  stream: MediaStream | null;
  muted: boolean;
  mirror?: boolean;
  label: string;
  sub?: string;
  side?: Side;
  active?: boolean;
  placeholder?: string;
  /** Remote camera died while the connection stayed up — overlay the tile. */
  dead?: boolean;
  /** Mask mode: no camera at all, this player debates behind a mask. The tile
      renders the character instead of video. */
  maskId?: string;
  /** Accepted and ignored since 2026-09-12. It drove the speaking ring, which
      is gone (see the note on the lit tile below); the green room still
      passes it, and the mic meters under the tiles carry the level now. */
  level?: number;
  /** Your own tile in a match: a "you · for" badge in the side's colour, so
      the coin's call is on your face from the first frame to the last. `side`
      is left off where the side is a sentence (settle-it). */
  you?: { label: string; side?: string };
  /** The "on the mic" pill on the lit tile. The match leaves it off: a status
      line under the lit tile says who has the floor there, in words. */
  pill?: boolean;
}

/** The character standing in the frame: a head-and-shoulders bust, bottom
    centred, as tall as the tile and never wider than it, so the shoulders sit
    on the tile's bottom edge like a portrait in its frame. Shared with the
    bot's tile (Debate.tsx) and the spectator's frames (Spectate.tsx). */
export function TileBust({ children }: { children: ReactNode }) {
  return <div className="tile-bust">{children}</div>;
}

/** Your side, on your own tile, in the side's colour. On a phone-sized tile
    the side word drops (styles.css) and the coloured tag under it carries it. */
function YouBadge({ label, side }: { label: string; side?: string }) {
  return (
    <div className="you-badge">
      {label}
      {side ? <span className="you-badge-side"> · {side}</span> : null}
    </div>
  );
}

export default function VideoTile(props: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  // Mask mode's stand-in for the <video> element's audio channel.
  const audioRef = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);

  // Keep the masked tile's audio element fed. Separate from the video effect
  // because the two elements never exist at the same time.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.srcObject !== props.stream) {
      el.srcObject = props.stream;
      if (props.stream) void el.play().catch(() => {});
    }
  }, [props.stream, props.maskId, props.muted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Set muted BEFORE attaching the stream: the <video> mounts only once the
    // stream exists, so an effect keyed on props.muted alone would never run
    // for it — and an unmuted local tile echoes your own mic into your ears.
    el.muted = props.muted;
    if (el.srcObject !== props.stream) {
      el.srcObject = props.stream;
      if (props.stream) {
        void el.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
      }
    }
  // props.maskId is in the deps on purpose: leaving mask mode MOUNTS A NEW
  // <video> element, and without a re-run its srcObject is never set — the
  // camera stays on with a black tile (his "face doesn't come back" bug).
  }, [props.stream, props.muted, props.maskId]);

  // Autoplay refused: keep retrying on EVERY tap until one lands (a single
  // once:true attempt can miss), and show an overlay so a black tile isn't
  // mistaken for a connecting camera.
  useEffect(() => {
    if (!blocked) return;
    const retry = () => {
      const el = ref.current;
      if (!el) return;
      void el.play().then(() => setBlocked(false)).catch(() => {});
    };
    document.addEventListener('pointerdown', retry);
    return () => document.removeEventListener('pointerdown', retry);
  }, [blocked]);

  // iOS pauses videos when the page is hidden and does not always resume
  // them — re-kick playback whenever we come back to the foreground.
  useEffect(() => {
    const onVis = () => {
      const el = ref.current;
      if (document.visibilityState === 'visible' && el && el.paused && el.srcObject) {
        void el.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Belt and suspenders for later prop flips (turn changes on the remote tile).
  useEffect(() => {
    if (ref.current) ref.current.muted = props.muted;
  }, [props.muted]);

  // A masked player still holds an AUDIO-ONLY stream. Rendering <video> for it
  // produces a black rectangle, which is what a forgotten maskId looks like.
  const hasVideo = Boolean(props.stream && props.stream.getVideoTracks().length > 0);
  const sideClass = props.side === 'FOR' ? 'tile-for' : props.side === 'AGAINST' ? 'tile-against' : '';

  // Masked player: the tile IS the mask. No video element is ever created, so
  // a masked debate needs no camera permission at all.
  if (props.maskId || (props.stream && !hasVideo)) {
    // THE CHARACTER IS STILL, and since 2026-09-12 so is everything around it.
    // Who has the floor used to be a ring round the face that thickened with
    // the voice; his note: "remove the circle that vibrates when people talk,
    // just light up each rectangle when it's that person's turn". The whole
    // tile lights now (.tile-active in styles.css), the same for a camera, a
    // character or a bot, and it holds steady for the length of the turn.
    return (
      <div className={`tile tile-masked ${sideClass} ${props.active ? 'tile-active' : ''}`}>
        {/* The <video> element we're NOT rendering was also what played the
            opponent's voice. Without this, a masked debate is silent. */}
        {props.stream && !props.muted ? (
          <audio ref={audioRef} autoPlay playsInline />
        ) : null}
        <TileBust>
          <Mask id={props.maskId ?? MASK_IDS[0]} size="100%" bare />
        </TileBust>
        <div className="tag">
          <span className="tag-name">{props.label}</span>
          {props.sub ? <span className="tag-sub">{props.sub}</span> : null}
        </div>
        {props.you ? <YouBadge {...props.you} /> : null}
        {props.active && props.pill !== false ? <div className="live-pill">{t('onTheMic')}</div> : null}
      </div>
    );
  }

  return (
    <div className={`tile ${sideClass} ${props.active ? 'tile-active' : ''}`}>
      {props.stream ? (
        <video ref={ref} autoPlay playsInline className={props.mirror ? 'mirror' : ''} />
      ) : (
        <div className="tile-empty">{props.placeholder ?? t('emptyCorner')}</div>
      )}
      {props.stream && props.dead ? <div className="tile-overlay">{t('theyFroze')}</div> : null}
      {props.stream && blocked && !props.dead ? (
        <div className="tile-overlay">{t('tapToPlay')}</div>
      ) : null}
      <div className="tag">
        <span className="tag-name">{props.label}</span>
        {props.sub ? <span className="tag-sub">{props.sub}</span> : null}
      </div>
      {props.you ? <YouBadge {...props.you} /> : null}
      {props.active && props.pill !== false ? <div className="live-pill">{t('onTheMic')}</div> : null}
    </div>
  );
}
