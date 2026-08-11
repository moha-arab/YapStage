// What a signed-out visitor sees. Its whole job is to answer "what is this?"
// in about four seconds and offer exactly two doors: make it yours, or just
// try it. The old home page tried to be this AND the app at once, which is why
// a name box and a sign-in button sat side by side looking like two answers to
// the same question.
import { useI18n } from '../i18n';
import { signIn } from '../player';
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';

interface Props {
  /** Skip the account and go straight in, guest-style. */
  onGuest: () => void;
  /** Arrived on an invite link — the friend who called you out is waiting. */
  invited?: boolean;
}

export default function Welcome({ onGuest, invited }: Props) {
  const { t } = useI18n();
  return (
    <div className="stage welcome">
      <div className="welcome-hero">
        <h1 className="display logo">
          YAP<span className="logo-accent">STAGE</span>
        </h1>
        <p className="welcome-line">{t('welcomeLine')}</p>
      </div>

      {/* Show the thing rather than describe it: two faces, a clock, a verdict. */}
      <div className="welcome-stage" aria-hidden="true">
        <Mask id="luchador" size={78} />
        <span className="welcome-vs">VS</span>
        <BotAvatar botId="giraffe" color="gold" size={78} />
      </div>

      <div className="welcome-beats">
        <p>{t('welcomeBeat1')}</p>
        <p>{t('welcomeBeat2')}</p>
        <p>{t('welcomeBeat3')}</p>
      </div>

      <div className="welcome-doors">
        <button className="btn btn-primary btn-wide" onClick={signIn}>
          {t('signInGoogle')}
        </button>
        <button className="btn btn-wide" onClick={onGuest}>
          {invited ? t('welcomeGuestInvited') : t('welcomeGuest')}
        </button>
      </div>

      <p className="small-print welcome-fine">{t('welcomeFine')}</p>
    </div>
  );
}
