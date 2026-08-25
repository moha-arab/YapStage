// THE LANDING. What a signed-out visitor sees: the pitch and one door on the
// left, the real match screen framed on the right. His pick (option B, "the
// product shot") from the four rendered directions of 2026-08-22, after he
// called the old screen "a student project".
//
// Rules of this screen, learned from his own edits:
//   - ONE door. sign in with google. Guest mode is gone.
//   - No fine print. He struck "your rating and record follow you everywhere"
//     by hand: "when you add unnecessary stuff like that... I want to make it
//     look clean." A line has to survive that sentence to be added here.
//   - No fake proof and no live counters. The screenshot is presented as an
//     illustration of the product, which is honest; a ghost verdict or an
//     unexplained "live now" is not.
import { useI18n } from '../i18n';
import { signIn } from '../player';
import Mask from '../Mask';
import Brand from '../Brand';

interface Props {
  /** Arrived on an invite link — the friend who called you out is waiting. */
  invited?: boolean;
}

/** Google's four-colour G, per their sign-in branding. Inline: an <img> would
    be one more request on the first screen anyone ever sees. */
function GoogleG() {
  return (
    <span className="ld-g" aria-hidden="true">
      <svg viewBox="0 0 18 18" width="13" height="13">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        />
      </svg>
    </span>
  );
}

export default function Welcome({ invited }: Props) {
  const { t } = useI18n();

  return (
    <div className="landing">
      <header className="ld-bar">
        <Brand size={26} />
      </header>

      <div className="ld-split">
        <div>
          <h1 className="ld-h1">{t('landH1')}</h1>
          <p className="ld-sub">{invited ? t('welcomeInvitedLine') : t('welcomeLine')}</p>
          <button className="ld-cta" onClick={signIn}>
            <GoogleG />
            {t('signInGoogle')}
          </button>
          <ul className="ld-steps">
            {(['landStep1', 'landStep2', 'landStep3'] as const).map((k, i) => (
              <li key={k}>
                <span className="ld-k">{i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: t(k) }} />
              </li>
            ))}
          </ul>
        </div>

        {/* The real match screen, framed: two debaters, the motion, the clock.
            Sample names on sample data, the way every product screenshot works
            — what it never does is claim somebody is playing right now. */}
        <div className="ld-shotwrap" aria-hidden="true">
          <div className="ld-glow" />
          <div className="ld-shot">
            <div className="ld-chrome">
              <i />
              <i />
              <i />
            </div>
            <div className="ld-app">
              <div className="ld-tile">
                <div className="ld-face">
                  <Mask id="luchador" size="100%" bare />
                </div>
                <div className="ld-tag">zorvint · {t('sideFor')}</div>
              </div>
              <div className="ld-tile ld-tile-on">
                <div className="ld-face">
                  <Mask id="kitsune" size="100%" bare />
                </div>
                <div className="ld-tag">goat · {t('sideAgainst')}</div>
                <div className="ld-pill">{t('onTheMic')}</div>
              </div>
              <div className="ld-bill">
                <div className="sec">{t('theMotion')}</div>
                <div className="mot">{t('landShotMotion')}</div>
                <div className="rnd">
                  <b>{t('rebuttals')}</b>
                  <span>{t('turnOf', { n: 4 })}</span>
                </div>
                <div className="clk">0:31</div>
                <div className="trk">
                  <i />
                </div>
                <div className="who">{t('landShotWho')}</div>
                <p className="how">{t('landShotHow')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
