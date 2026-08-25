// What a signed-out visitor sees. Its whole job is to answer "what is this?"
// in about four seconds and offer exactly ONE door: sign in with Google.
//
// Guest mode is gone (his call, 2026-08-22) — playing requires an account.
// The feed and the ladder are gone too: showing a ghost "last verdict" for a
// match that never happened and a leaderboard of six bots was placeholder
// content dressed as proof, and it is exactly what made this screen read as a
// student project. Real proof can return when there is something real to show.
import { useI18n } from '../i18n';
import { signIn } from '../player';
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';
import Brand from '../Brand';

interface Props {
  /** Arrived on an invite link — the friend who called you out is waiting. */
  invited?: boolean;
}

export default function Welcome({ invited }: Props) {
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

      <p className="welcome-beats">{invited ? t('welcomeInvitedLine') : t('welcomeHow')}</p>

      <div className="welcome-doors">
        <button className="btn btn-primary btn-wide" onClick={signIn}>
          {t('signInGoogle')}
        </button>
      </div>

      <p className="small-print welcome-fine">{t('welcomeFine')}</p>
    </div>
  );
}
