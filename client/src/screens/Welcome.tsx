// THE MARQUEE. What a signed-out visitor sees: an empty house, two stage
// lights crossing on the name, one sentence, one door. His pick (option D)
// from the four landing directions of 2026-08-22, replacing the screen he
// called "a student project".
//
// What made the old one read that way, so nobody rebuilds it: a ghost "last
// verdict" for a match that never happened, a leaderboard of six bots dressed
// as a community, a guest link diluting the one action, and a centered column
// of small print. The fix is not more — it is one confident thing.
//
// The single live element ("a ranked debate is live right now") renders ONLY
// when it is actually true. Fake liveliness is the student-project tell.
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { signIn } from '../player';

interface Props {
  /** Arrived on an invite link — the friend who called you out is waiting. */
  invited?: boolean;
}

/** Google's four-colour G, per their sign-in branding. Drawn inline: an <img>
    would be one more request on the first screen anyone ever sees. */
function GoogleG() {
  return (
    <span className="mq-g" aria-hidden="true">
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
          d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-3.332z"
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

  const [live, setLive] = useState(0);
  useEffect(() => {
    void fetch('/live')
      .then((r) => r.json())
      .then((d: { live?: number }) => setLive(d.live ?? 0))
      .catch(() => {});
  }, []);

  return (
    <div className="marquee-welcome">
      <svg className="mq-lights" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="mqa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F0821E" stopOpacity="0.34" />
            <stop offset="0.75" stopColor="#F0821E" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="mqb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1FC2D4" stopOpacity="0.3" />
            <stop offset="0.75" stopColor="#1FC2D4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Blurred on purpose: hard-edged gradient polygons read as brown
            triangles, not light. The blur is what makes them beams. */}
        <g style={{ filter: 'blur(30px)' }}>
          <polygon points="480,-40 620,-40 900,940 220,940" fill="url(#mqa)" />
          <polygon points="820,-40 960,-40 1220,940 540,940" fill="url(#mqb)" />
        </g>
      </svg>

      <div className="mq-mid">
        <div className="mq-lockup">
          <svg viewBox="0 0 64 64" role="img" aria-label="YapStage">
            <path d="M8 14 h20 v20 q0 12 -14 16 v-8 q7 -3 7 -8 h-13 z" fill="var(--amber)" />
            <path d="M56 50 h-20 v-20 q0 -12 14 -16 v8 q-7 3 -7 8 h13 z" fill="var(--turq)" />
          </svg>
          <span className="mq-word">YAPSTAGE</span>
        </div>

        <p className="mq-line">{invited ? t('welcomeInvitedLine') : t('welcomeLine')}</p>

        <button className="mq-cta" onClick={signIn}>
          <GoogleG />
          {t('signInGoogle')}
        </button>
        <p className="mq-fine">{t('welcomeFine')}</p>

        {live > 0 ? (
          <p className="mq-live">
            <i />
            {live === 1 ? t('welcomeLiveOne') : t('welcomeLiveMany', { n: live })}
          </p>
        ) : null}
      </div>

      <p className="mq-rule" dangerouslySetInnerHTML={{ __html: t('lbHouseRule') }} />
    </div>
  );
}
