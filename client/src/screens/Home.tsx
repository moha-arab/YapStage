import { useState } from 'react';
import type { JoinError, LobbyUpdate } from '../../../server/src/protocol';
import { sessionId, socket } from '../socket';
import { loadReceipts } from '../history';
import { useI18n } from '../i18n';

const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

const ERROR_KEYS: Record<JoinError, string> = {
  not_found: 'errNotFound',
  full: 'errFull',
  in_progress: 'errInProgress',
  bad_name: 'errBadName',
};

interface Props {
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
}

export default function Home({ notice, onEntered }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipts] = useState(loadReceipts);

  const validName = NAME_RE.test(name);
  const wins = receipts.filter((r) => r.won).length;

  function create() {
    if (!validName) return setError('errBadName');
    setBusy(true);
    socket.emit('lobby:create', { sessionId, name }, (res) => {
      setBusy(false);
      if (res.ok) onEntered(res.update);
      else setError(ERROR_KEYS[res.error]);
    });
  }

  function join() {
    if (!validName) return setError('errBadName');
    if (code.trim().length !== 6) return setError('errCodeLen');
    setBusy(true);
    socket.emit('lobby:join', { code: code.trim().toUpperCase(), sessionId, name }, (res) => {
      setBusy(false);
      if (res.ok) onEntered(res.update);
      else setError(ERROR_KEYS[res.error]);
    });
  }

  return (
    <div className="stage center-col home">
      {notice ? <div className="banner">{t(notice)}</div> : null}
      <p className="kicker">{t('kicker')}</p>
      <h1 className="display logo">
        YAP<span className="logo-accent">STAGE</span>
      </h1>
      <p className="subtitle">{t('homeSubtitle')}</p>

      <div className="card">
        <label className="field-label" htmlFor="yapname">
          {t('yourYapName')}
        </label>
        <input
          id="yapname"
          className="input"
          placeholder={t('namePlaceholder')}
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
            {t('startDebate')}
          </button>
          <div className="join-row">
            <input
              className="input input-code"
              placeholder={t('codePlaceholder')}
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
              {t('joinOne')}
            </button>
          </div>
        </div>

        {error ? <p className="error">{t(error)}</p> : null}
      </div>

      {receipts.length > 0 ? (
        <div className="bouts">
          <span className="tape">
            {t('receipts')}: {wins}-{receipts.length - wins}
          </span>
          {receipts.slice(0, 5).map((r) => (
            <div className="bout-row" key={r.at}>
              <span className={`bout-mark ${r.won ? 'bout-w' : 'bout-l'}`}>{r.won ? 'W' : 'L'}</span>
              <span className="bout-names">
                {r.me} <em>{r.myTotal}</em> vs {r.them} <em>{r.theirTotal}</em>
              </span>
              <span className="bout-topic">"{r.topic}"</span>
            </div>
          ))}
          <p className="small-print">{t('receiptsNote')}</p>
        </div>
      ) : null}

      <p className="footnote">{t('footChrome')}</p>
      <p className="small-print">{t('smallPrint')}</p>

      <div className="marquee" aria-hidden="true">
        <span className="marquee-track">
          {t('marquee').repeat(4)}
          {t('marquee').repeat(4)}
        </span>
      </div>
    </div>
  );
}
