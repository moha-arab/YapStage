// Settings, in a sheet over the lobby (LobbySheet, so it reads as part of it).
// Plain sections with every control in view: your yap name and its
// once-a-month change, signing in or out, and deleting the account.
import { useEffect, useState } from 'react';
import { foldName, nameProblem } from '../../../server/src/protocol';
import { socket } from '../socket';
import { useI18n, type Lang } from '../i18n';
import { deleteAccount, renameAccount, signIn, signOut, type Account } from '../player';
import LobbySheet from './LobbySheet';
import '../settings.css';

interface Props {
  account: Account | null;
  onClose: () => void;
  onRenamed: (name: string) => void;
}

/** Mirrors the server's rule (auth.ts NAME_CHANGE_DAYS); the server enforces it. */
const NAME_CHANGE_DAYS = 30;
const DAY_MS = 86_400_000;

/** The moment a change is allowed again, or null when it is allowed now. */
function waitUntil(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && at > Date.now() ? new Date(at) : null;
}

/** "October 12 at 8:00 PM": the time is there because the rule is exact to
    the minute, and a bare date would be refused on the morning of that day. */
function formatWhen(d: Date, lang: Lang): string {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-US', {
      month: 'long',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export default function SettingsSheet({ account, onClose, onRenamed }: Props) {
  const { t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  // The name as it is now, so the delete step asks for the new one straight
  // after a rename in this same sheet.
  const [name, setName] = useState(account?.name ?? '');
  useEffect(() => setName(account?.name ?? ''), [account?.name]);
  const signedIn = Boolean(account?.signedIn);

  return (
    <LobbySheet title={t('settingsTitle')} onClose={onClose}>
      <div className="set">
        {signedIn && name ? (
          <NameSection
            name={name}
            nextChange={account?.nextNameChange ?? null}
            onRenamed={(n) => {
              setName(n);
              onRenamed(n);
            }}
          />
        ) : null}

        {signedIn ? (
          <section className="set-sec" aria-labelledby="set-acct-h">
            <h3 className="set-h" id="set-acct-h">
              {t('settingsAccount')}
            </h3>
            <button
              className="btn"
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                void signOut();
              }}
            >
              {leaving ? t('settingsSigningOut') : t('settingsSignOut')}
            </button>
          </section>
        ) : account?.google ? (
          <section className="set-sec" aria-labelledby="set-acct-h">
            <h3 className="set-h" id="set-acct-h">
              {t('settingsAccount')}
            </h3>
            <div className="set-acct">
              <p className="set-note">{t('signInWhy')}</p>
              <button className="btn btn-primary" onClick={signIn}>
                {t('signInGoogle')}
              </button>
            </div>
          </section>
        ) : (
          <section className="set-sec">
            <p className="set-note">{t('settingsNothing')}</p>
          </section>
        )}

        {signedIn && name ? <DeleteSection name={name} /> : null}
      </div>
    </LobbySheet>
  );
}

function NameSection({
  name,
  nextChange,
  onRenamed,
}: {
  name: string;
  nextChange: string | null;
  onRenamed: (name: string) => void;
}) {
  const { t, lang } = useI18n();
  const [current, setCurrent] = useState(name);
  const [next, setNext] = useState<string | null>(nextChange);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The account can be refreshed underneath the sheet; the newer answer wins.
  useEffect(() => setCurrent(name), [name]);
  useEffect(() => setNext(nextChange), [nextChange]);

  const wait = waitUntil(next);
  const typed = draft.normalize('NFKC').trim();
  // Same function the server runs, so Save never offers a name it will refuse.
  const problem = typed ? nameProblem(typed) : 'bad_name';
  const canSave = !busy && problem === null && typed !== current;

  function start() {
    setDraft(current);
    setError(null);
    setDone(false);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const out = await renameAccount(typed);
    setBusy(false);
    if (out.ok) {
      // The server reads the session ONCE at connect, so the open socket still
      // carries the old name until it reconnects. Same bounce as ClaimName.
      socket.disconnect();
      socket.connect();
      setCurrent(out.name);
      setNext(out.nextNameChange);
      setEditing(false);
      setDone(true);
      onRenamed(out.name);
      return;
    }
    if (out.error === 'too_soon' && out.nextNameChange) {
      // The date line under the name says it; no need for an error as well.
      setNext(out.nextNameChange);
      setEditing(false);
      return;
    }
    setError(out.error);
  }

  const errorText = (code: string): string => {
    switch (code) {
      case 'taken':
        return t('nameTaken');
      case 'reserved':
        return t('nameReserved');
      case 'bad_name':
        return t('errBadName');
      case 'same':
        return t('settingsNameSame');
      case 'too_soon':
        return t('settingsNameTooSoon');
      case 'rate_limited':
        return t('settingsBusy');
      case 'signed_out':
        return t('settingsSignedOut');
      default:
        return t('settingsNameFailed');
    }
  };

  return (
    <section className="set-sec" aria-labelledby="set-name-h">
      <h3 className="set-h" id="set-name-h">
        {t('settingsName')}
      </h3>
      {editing ? (
        <>
          <div className="set-edit">
            <input
              className="input"
              aria-labelledby="set-name-h"
              value={draft}
              maxLength={16}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setDraft(e.target.value.replace(/\s/g, ''));
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') {
                  // Escape here backs out of the edit, not out of Settings.
                  e.stopPropagation();
                  cancel();
                }
              }}
            />
            <div className="set-btns">
              <button className="btn btn-primary" disabled={!canSave} onClick={() => void save()}>
                {busy ? t('settingsNameSaving') : t('settingsNameSave')}
              </button>
              <button className="btn ghost" disabled={busy} onClick={cancel}>
                {t('settingsCancel')}
              </button>
            </div>
          </div>
          {typed && problem ? (
            <p className="set-hint">{t(problem === 'reserved' ? 'nameReserved' : 'errBadName')}</p>
          ) : (
            <p className="set-note">
              {t('settingsNameWarn', { date: formatWhen(new Date(Date.now() + NAME_CHANGE_DAYS * DAY_MS), lang) })}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="set-row">
            <span className="set-name">{current}</span>
            <button className="btn set-name-change" disabled={Boolean(wait)} onClick={start}>
              {t('settingsNameChange')}
            </button>
          </div>
          <p className="set-note">
            {wait ? t('settingsNameWait', { date: formatWhen(wait, lang) }) : t('settingsNameRule')}
          </p>
        </>
      )}
      {done && !editing ? (
        <p className="set-ok" role="status">
          {t('settingsNameDone', { name: current })}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      ) : null}
    </section>
  );
}

/** Quiet until asked: a plain button, then an inline step that says what goes
    and asks for the username typed out before the red button wakes up. */
function DeleteSection({ name }: { name: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server compares folds too, so "Zorvint" confirms "zorvint".
  const confirmed = typed.trim() !== '' && foldName(typed.trim()) === foldName(name);

  function close() {
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const out = await deleteAccount(typed.trim());
    // Gone (or already gone): reset the device the way signing out does and
    // land on the signed-out front page. signOut() navigates away.
    if (out.ok || out.error === 'missing') return signOut();
    setBusy(false);
    setError(
      out.error === 'mismatch'
        ? t('settingsDeleteMismatch')
        : out.error === 'rate_limited'
          ? t('settingsBusy')
          : out.error === 'signed_out'
            ? t('settingsSignedOut')
            : t('settingsDeleteFailed'),
    );
  }

  return (
    <section className="set-sec" aria-labelledby="set-del-h">
      <h3 className="set-h" id="set-del-h">
        {t('settingsDelete')}
      </h3>
      {open ? (
        <div className="set-del">
          <p className="set-del-what">{t('settingsDeleteWhat')}</p>
          <label className="set-del-lab" htmlFor="set-del-input">
            {t('settingsDeleteType', { name })}
          </label>
          <div className="set-edit">
            <input
              id="set-del-input"
              className="input"
              value={typed}
              maxLength={32}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setTyped(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void remove();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  close();
                }
              }}
            />
            <div className="set-btns">
              <button className="btn set-danger" disabled={!confirmed || busy} onClick={() => void remove()}>
                {busy ? t('settingsDeleting') : t('settingsDeleteGo')}
              </button>
              <button className="btn ghost" disabled={busy} onClick={close}>
                {t('settingsCancel')}
              </button>
            </div>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="set-acct">
          <p className="set-note">{t('settingsDeleteSub')}</p>
          <button className="btn ghost set-del-open" onClick={() => setOpen(true)}>
            {t('settingsDelete')}
          </button>
        </div>
      )}
    </section>
  );
}
