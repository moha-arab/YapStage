import { useState } from 'react';
import type { JoinError, LobbyUpdate } from '../../../server/src/protocol';
import { sessionId, socket } from '../socket';
import { loadBouts } from '../history';

const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

const ERRORS: Record<JoinError, string> = {
  not_found: "that code doesn't exist. your friend typed it wrong. classic.",
  full: 'lobby is full. debates are strictly 1v1, no cornermen.',
  in_progress: 'that debate already started without you. get a new code.',
  bad_name: 'yap names are 3 to 16 characters. letters, numbers, underscores.',
};

interface Props {
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
}

export default function Home({ notice, onEntered }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bouts] = useState(loadBouts);

  const validName = NAME_RE.test(name);
  const wins = bouts.filter((b) => b.won).length;

  function create() {
    if (!validName) return setError(ERRORS.bad_name);
    setBusy(true);
    socket.emit('lobby:create', { sessionId, name }, (res) => {
      setBusy(false);
      if (res.ok) onEntered(res.update);
      else setError(ERRORS[res.error]);
    });
  }

  function join() {
    if (!validName) return setError(ERRORS.bad_name);
    if (code.trim().length !== 6) return setError('codes are 6 characters. count again.');
    setBusy(true);
    socket.emit('lobby:join', { code: code.trim().toUpperCase(), sessionId, name }, (res) => {
      setBusy(false);
      if (res.ok) onEntered(res.update);
      else setError(ERRORS[res.error]);
    });
  }

  return (
    <div className="stage center-col home">
      {notice ? <div className="banner">{notice}</div> : null}
      <p className="kicker">1v1 video debates · ai judge · no accounts</p>
      <h1 className="display logo">
        YAP<span className="logo-accent">STAGE</span>
      </h1>
      <p className="subtitle">
        one friend. one topic you don't get to pick. the judge hears everything and crowns a
        YapMaster.
      </p>

      <div className="card">
        <label className="field-label" htmlFor="yapname">
          your yap name
        </label>
        <input
          id="yapname"
          className="input"
          placeholder="pizzamaster"
          maxLength={16}
          value={name}
          onChange={(e) => {
            setName(e.target.value.replace(/\s/g, ''));
            setError(null);
          }}
          autoFocus
        />

        <div className="home-actions">
          <button className="btn btn-primary" disabled={busy || !validName} onClick={create}>
            start a debate
          </button>
          <div className="join-row">
            <input
              className="input input-code"
              placeholder="CODE"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') join();
              }}
            />
            <button className="btn" disabled={busy || !validName || code.length !== 6} onClick={join}>
              join one
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </div>

      {bouts.length > 0 ? (
        <div className="bouts">
          <span className="tape">
            fight record: {wins}-{bouts.length - wins}
          </span>
          {bouts.slice(0, 5).map((b) => (
            <div className="bout-row" key={b.at}>
              <span className={`bout-mark ${b.won ? 'bout-w' : 'bout-l'}`}>{b.won ? 'W' : 'L'}</span>
              <span className="bout-names">
                {b.me} <em>{b.myTotal}</em> vs {b.them} <em>{b.theirTotal}</em>
              </span>
              <span className="bout-topic">"{b.topic}"</span>
            </div>
          ))}
          <p className="small-print">saved on this device only. we keep nothing.</p>
        </div>
      ) : null}

      <p className="footnote">works best in chrome on a laptop. the judge needs ears.</p>
      <p className="small-print">
        sanctioned by the yapstage athletic commission · the judge cannot be bribed (we tried)
      </p>

      <div className="marquee" aria-hidden="true">
        <span className="marquee-track">
          {'tonight · yapstage · settle it on camera · loser buys shawarma · '.repeat(4)}
          {'tonight · yapstage · settle it on camera · loser buys shawarma · '.repeat(4)}
        </span>
      </div>
    </div>
  );
}
