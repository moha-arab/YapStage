import { useEffect, useRef } from 'react';
import type { Side } from '../../server/src/protocol';

interface Props {
  stream: MediaStream | null;
  muted: boolean;
  mirror?: boolean;
  label: string;
  sub?: string;
  side?: Side;
  active?: boolean;
  placeholder?: string;
}

export default function VideoTile(props: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Set muted BEFORE attaching the stream: the <video> mounts only once the
    // stream exists, so an effect keyed on props.muted alone would never run
    // for it — and an unmuted local tile echoes your own mic into your ears.
    el.muted = props.muted;
    if (el.srcObject !== props.stream) {
      el.srcObject = props.stream;
      if (props.stream) void el.play().catch(() => {});
    }
  }, [props.stream, props.muted]);

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
        <div className="tile-empty">{props.placeholder ?? 'Waiting…'}</div>
      )}
      <div className="tag">
        <span className="tag-name">{props.label}</span>
        {props.sub ? <span className="tag-sub">{props.sub}</span> : null}
      </div>
      {props.active ? <div className="live-pill">ON THE MIC</div> : null}
    </div>
  );
}
