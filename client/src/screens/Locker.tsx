// The locker. Your mask lives on the ACCOUNT, not on one lobby, which is what
// finally gives training a mask — that mode goes straight from the picker into
// the debate, so there was never a screen to choose one on.
import { useState } from 'react';
import Mask, { MASK_IDS } from '../Mask';
import { socket } from '../socket';
import { saveLocker, type Account } from '../player';
import { useI18n } from '../i18n';
import Brand from '../Brand';

interface Props {
  account: Account;
  onSaved: (mask: string, maskDefault: boolean) => void;
  onBack: () => void;
}

export default function Locker({ account, onSaved, onBack }: Props) {
  const { t } = useI18n();
  const [mask, setMask] = useState(account.mask ?? MASK_IDS[0]);
  const [maskDefault, setMaskDefault] = useState(Boolean(account.maskDefault));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await saveLocker(mask, maskDefault);
    setSaving(false);
    if (ok) {
      // The server reads your locker once, when the socket connects. Bounce it
      // so the choice you just made applies to the very next debate instead of
      // the next page load.
      socket.disconnect();
      socket.connect();
      onSaved(mask, maskDefault);
      // Saving is finished business: leave. Sitting on a 'saved' badge makes the
      // player wonder whether anything happened and what to press next.
      onBack();
    }
  }

  return (
    <div className="stage matches locker">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <Brand />
        <span className="pill">{t('lockerPill')}</span>
      </header>

      <h1 className="display page-title">{t('lockerTitle')}</h1>
      <p className="page-sub">{t('lockerSub')}</p>

      <div className="locker-preview">
        <Mask id={mask} size={140} />
      </div>

      <div className="mask-row locker-row">
        {MASK_IDS.map((id) => (
          <button
            key={id}
            className={`mask-chip ${mask === id ? 'mask-chip-on' : ''}`}
            aria-label={id}
            aria-pressed={mask === id}
            onClick={() => setMask(id)}
          >
            <Mask id={id} size={58} />
          </button>
        ))}
      </div>

      <label className="consent-row locker-toggle">
        <input
          type="checkbox"
          checked={maskDefault}
          onChange={(e) => setMaskDefault(e.target.checked)}
        />
        <span>{t('lockerWearIt')}</span>
      </label>
      <p className="small-print locker-note">{t('lockerRankedNote')}</p>

      <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
        {saving ? t('claiming') : t('lockerSave')}
      </button>
    </div>
  );
}
