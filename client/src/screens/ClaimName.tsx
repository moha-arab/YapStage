// One-time yap-name claim, right after a first sign-in. Blocking on purpose:
// a name is the identity everyone else sees on a scoreboard, so it gets picked
// once and it's yours. Uniqueness is decided by the server, never guessed here.
import { useState } from 'react';
import { nameProblem } from '../../../server/src/protocol';
import { socket } from '../socket';
import { useI18n } from '../i18n';
import Mask, { MASK_IDS } from '../Mask';

interface Props {
  onClaimed: (name: string) => void;
}

export default function ClaimName({ onClaimed }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same function the server runs, so the screen never promises a name the
  // server will refuse.
  const problem = name ? nameProblem(name) : 'bad_name';
  const valid = problem === null;

  async function claim() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/auth/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const out = (await res.json()) as { ok?: boolean; error?: string; name?: string };
      if (out.ok && out.name) {
        // The socket connected with the pre-name cookie, and the server reads
        // the session ONCE at connect. Without this bounce your first session
        // runs as a nameless account: seats fall back to the typed name and
        // your friends cannot see you online. Same fix as the locker's.
        socket.disconnect();
        socket.connect();
        return onClaimed(out.name);
      }
      setError(
        out.error === 'taken'
          ? 'nameTaken'
          : out.error === 'reserved'
            ? 'nameReserved'
            : out.error === 'bad_name'
              ? 'errBadName'
              : 'nameFailed',
      );
    } catch {
      setError('nameFailed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stage center-col claim-name">
      <Mask id={MASK_IDS[0]} size={96} />
      <p className="kicker">{t('claimKicker')}</p>
      <h1 className="display">{t('claimTitle')}</h1>
      <p className="subtitle">{t('claimSub')}</p>

      <div className="card claim-card">
        <label className="field-label" htmlFor="claimname">
          {t('yourYapName')}
        </label>
        <input
          id="claimname"
          className="input"
          placeholder={t('namePlaceholder')}
          maxLength={16}
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value.replace(/\s/g, ''));
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void claim();
          }}
        />
        {name && !valid ? (
          <p className="field-hint">{t(problem === 'reserved' ? 'nameReserved' : 'errBadName')}</p>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {t(error)}
          </p>
        ) : null}
        <button className="btn btn-primary btn-wide" disabled={!valid || busy} onClick={() => void claim()}>
          {busy ? t('claiming') : t('claimBtn')}
        </button>
        <p className="small-print">{t('claimForever')}</p>
      </div>
    </div>
  );
}
