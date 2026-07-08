import { useState } from 'react';
import type { JoinError, LobbyUpdate } from '../../../server/src/protocol';
import { sessionId, socket } from '../socket';

const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

const ERRORS: Record<JoinError, string> = {
  not_found: "That code doesn't match any lobby. Double-check it with your friend.",
  full: 'That lobby is already full — debates are strictly 1v1.',
  in_progress: 'That debate already started. Ask your friend for a fresh code.',
  bad_name: 'Yap names are 3-16 characters: letters, numbers, underscores.',
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

  const validName = NAME_RE.test(name);

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
    if (code.trim().length !== 6) return setError('Lobby codes are 6 characters.');
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
      <p className="kicker">1v1 video debates · AI judge · no accounts</p>
      <h1 className="display logo">
        YAP<span className="logo-accent">STAGE</span>
      </h1>
      <p className="subtitle">
        Invite a friend. Get dealt a topic and a side. Argue it out in timed turns —
        the judge crowns the <strong>YapMaster</strong>.
      </p>

      <div className="card">
        <label className="field-label" htmlFor="yapname">
          Your yap name
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
            Create a debate
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
              Join
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </div>

      <p className="footnote">
        Desktop Chrome recommended — it powers the live transcription the judge reads.
      </p>
    </div>
  );
}
