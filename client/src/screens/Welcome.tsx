// What a signed-out visitor sees. Its whole job is to answer "what is this?"
// in about four seconds and offer exactly two doors: make it yours, or just
// try it. The old home page tried to be this AND the app at once, which is why
// a name box and a sign-in button sat side by side looking like two answers to
// the same question.
import { useI18n } from '../i18n';
import { signIn } from '../player';
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';
import HomeFeed from '../HomeFeed';
import Brand from '../Brand';

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
        <Brand size={64} />
        <p className="welcome-line">{t('welcomeLine')}</p>
      </div>

      {/* Show the thing rather than describe it: two faces under two lights. */}
      <div className="welcome-stage" aria-hidden="true">
        <Mask id="luchador" size={96} bare />
        <span className="welcome-vs">{t('vs')}</span>
        <BotAvatar botId="giraffe" color="ink" size={96} bare />
      </div>

      <p className="welcome-beats">{t('welcomeHow')}</p>

      {/* One primary action, one quiet way past it. Two buttons of equal weight
          side by side is the landing-page tell that nobody decided what the
          page is FOR. */}
      <div className="welcome-doors">
        <button className="btn btn-primary btn-wide" onClick={signIn}>
          {t('signInGoogle')}
        </button>
        <button className="link-btn" onClick={onGuest}>
          {invited ? t('welcomeGuestInvited') : t('welcomeGuest')}
        </button>
      </div>

      <p className="small-print welcome-fine">{t('welcomeFine')}</p>

      {/* Proof, not promises: real finished debates and the real ladder. */}
      <HomeFeed />
    </div>
  );
}
