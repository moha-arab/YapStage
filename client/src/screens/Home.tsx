import { useEffect, useState } from 'react';
import { NAME_RE, type JoinError, type LobbyUpdate } from '../../../server/src/protocol';
import { session, socket } from '../socket';
import { loadReceipts } from '../history';
import { useI18n } from '../i18n';

const ERROR_KEYS: Record<JoinError, string> = {
  not_found: 'errNotFound',
  full: 'errFull',
  in_progress: 'errInProgress',
  bad_name: 'errBadName',
  rate_limited: 'errRateLimited',
};

interface Props {
  notice: string | null;
  onEntered: (u: LobbyUpdate) => void;
  onPlayBot: (name: string) => void;
}

export default function Home({ notice, onEntered, onPlayBot }: Props) {
  const { lang, t } = useI18n();
  const [name, setName] = useState('');
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get('code')?.toUpperCase() ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipts] = useState(loadReceipts);
  const [showMatches, setShowMatches] = useState(false);

  // With server-side transcription the chrome-only warning is a lie; only
  // show it when this deployment really depends on the browser's own STT.
  const [serverStt, setServerStt] = useState(true);
  useEffect(() => {
    fetch('/healthz')
      .then((r) => r.json())
      .then((h) => setServerStt(h.stt === 'cloudflare'))
      .catch(() => {});
  }, []);

  const validName = NAME_RE.test(name);
  const wins = receipts.filter((r) => r.won).length;

  function create() {
    if (busy) return;
    if (!validName) return setError('errBadName');
    setBusy(true);
    socket.emit('lobby:create', { sessionId: session.id, name }, (res) => {
      setBusy(false);
      if (res.ok) onEntered(res.update);
      else setError(ERROR_KEYS[res.error]);
    });
  }

  function join() {
    if (busy) return;
    if (!validName) return setError('errBadName');
    if (code.trim().length !== 6) return setError('errCodeLen');
    setBusy(true);
    socket.emit('lobby:join', { code: code.trim().toUpperCase(), sessionId: session.id, name }, (res) => {
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
        {name && !validName ? <p className="field-hint">{t('errBadName')}</p> : null}

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
          <div className="home-or">{t('orWord')}</div>
          <button
            className="btn btn-bot btn-wide"
            disabled={!validName}
            onClick={() => onPlayBot(name)}
          >
            {t('playBot')}
          </button>
        </div>

        {error ? <p className="error">{t(error)}</p> : null}
      </div>

      {receipts.length > 0 ? (
        <div className="bouts">
          <span className="tape">
            {t('receipts')}: {wins}-{receipts.length - wins}
          </span>
          <button
            className="btn btn-small"
            aria-expanded={showMatches}
            onClick={() => setShowMatches((s) => !s)}
          >
            {t('prevMatches')} ({receipts.length})
          </button>
          {showMatches ? (
            <>
              {receipts.map((r) => (
                <div className="bout-row" key={r.at}>
                  <span className={`bout-mark ${r.won ? 'bout-w' : 'bout-l'}`}>
                    {r.won ? 'W' : 'L'}
                  </span>
                  <span className="bout-names">
                    {r.me} <em>{r.myTotal}</em> vs {r.them} <em>{r.theirTotal}</em>
                  </span>
                  <span className="bout-topic">"{r.topic}"</span>
                  <span className="bout-date">
                    {new Date(r.at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en-US')}
                  </span>
                </div>
              ))}
              <p className="small-print">{t('receiptsNote')}</p>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="footnote">{t(serverStt ? 'footAny' : 'footChrome')}</p>
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
