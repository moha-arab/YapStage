import { useEffect, useRef, useState } from 'react';
import type { Side } from '../../server/src/protocol';
import { useI18n } from './i18n';

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
}

export default function VideoTile(props: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);

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
  }, [props.stream, props.muted]);

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

  const sideClass = props.side === 'FOR' ? 'tile-for' : props.side === 'AGAINST' ? 'tile-against' : '';
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
      {props.active ? <div className="live-pill">{t('onTheMic')}</div> : null}
    </div>
  );
}
