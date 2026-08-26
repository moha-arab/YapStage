// THE LANDING, in two costumes.
//
// PRE-LAUNCH (prelaunch=true, the current one): the doors are closed, and this
// page has one job — make somebody want in badly enough to leave an email.
// Everything on it is 100% true of the product as built: the judge and its
// four categories, the tier ladder bound to real bots, the masks, the drill,
// public ranked debates. Nothing speculative, because he plans to change
// things and this page must never promise what might move.
//
// RELEASE (prelaunch=false): the same page with the email capture swapped for
// the Google door. Flip PRELAUNCH in server/src/auth.ts and this follows.
//
// Standing rules for this screen, from his own edits: one action, no fine
// print, no fake proof, no unexplained live counters.
import { useState } from 'react';
import { useI18n } from '../i18n';
import { signIn } from '../player';
import Mask from '../Mask';
import Brand from '../Brand';
import BotAvatar from '../BotAvatar';
import TierBadge from '../TierBadge';

interface Props {
  prelaunch?: boolean;
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

/** The framed product shot: the real match screen on sample data. */
function ProductShot() {
  const { t } = useI18n();
  return (
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
              <Mask id="calavera" size="100%" bare />
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
  );
}

/** The email capture. POST /waitlist; the states are the whole UI. */
function EmailCapture() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'already' | 'error'>('idle');

  function join() {
    const v = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return setState('error');
    setState('busy');
    void fetch('/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: v }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { already?: boolean }) => setState(d.already ? 'already' : 'done'))
      .catch(() => setState('error'));
  }

  if (state === 'done' || state === 'already') {
    return (
      <div className="ld-joined">
        <i />
        {state === 'done' ? t('wlDone') : t('wlAlready')}
      </div>
    );
  }
  return (
    <div className="ld-capture">
      <div className="ld-capture-row">
        <input
          className="input ld-email"
          type="email"
          placeholder={t('wlPlaceholder')}
          value={email}
          maxLength={320}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') setState('idle');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') join();
          }}
        />
        <button className="ld-cta" disabled={state === 'busy'} onClick={join}>
          {state === 'busy' ? t('loading') : t('wlJoin')}
        </button>
      </div>
      {state === 'error' ? <p className="ld-err">{t('wlError')}</p> : null}
    </div>
  );
}

export default function Welcome({ prelaunch, invited }: Props) {
  const { t } = useI18n();
  // A refused Google sign-in lands back here with ?auth=waitlist.
  const [turnedAway] = useState(
    () => new URLSearchParams(window.location.search).get('auth') === 'waitlist',
  );

  const CATS: { k: string; max: number }[] = [
    { k: 'wlCatArgument', max: 30 },
    { k: 'wlCatEvidence', max: 20 },
    { k: 'wlCatClash', max: 30 },
    { k: 'wlCatDelivery', max: 20 },
  ];
  const TIER_KEYS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'headliner'];
  const BOTS: { id: string; name: string; elo: number }[] = [
    { id: 'duckling', name: 'Pip', elo: 650 },
    { id: 'capybara', name: 'Cappy', elo: 850 },
    { id: 'fox', name: 'Vivi', elo: 1000 },
    { id: 'owl', name: 'Ozzy', elo: 1200 },
    { id: 'bull', name: 'Brutus', elo: 1350 },
    { id: 'giraffe', name: 'Gigi', elo: 1500 },
  ];
  const MASKS = ['luchador', 'oni', 'calavera', 'ninja'];

  if (!prelaunch) {
    // Release costume: the product shot page with the Google door.
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
          <ProductShot />
        </div>
      </div>
    );
  }

  return (
    <div className="landing ldp">
      <header className="ld-bar">
        <Brand size={26} />
        <span className="ldp-soon">{t('wlSoon')}</span>
      </header>

      {turnedAway ? <div className="ldp-turned">{t('wlTurnedAway')}</div> : null}

      {/* ---- hero: the pitch and the one action ---- */}
      <section className="ldp-hero">
        <svg className="ldp-lights" viewBox="0 0 1440 700" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="wla" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F0821E" stopOpacity="0.3" />
              <stop offset="0.8" stopColor="#F0821E" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="wlb" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1FC2D4" stopOpacity="0.26" />
              <stop offset="0.8" stopColor="#1FC2D4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g style={{ filter: 'blur(28px)' }}>
            <polygon points="430,-40 560,-40 830,740 160,740" fill="url(#wla)" />
            <polygon points="880,-40 1010,-40 1280,740 610,740" fill="url(#wlb)" />
          </g>
        </svg>
        <h1 className="ldp-h1">{t('landH1')}</h1>
        <p className="ldp-sub">{t('wlHeroSub')}</p>
        <EmailCapture />
      </section>

      {/* ---- the product, shown not described ---- */}
      <section className="ldp-shot">
        <ProductShot />
      </section>

      {/* ---- how a match works ---- */}
      <section className="ldp-sec">
        <h2 className="ldp-h2">{t('wlHowTitle')}</h2>
        <ul className="ld-steps ldp-steps">
          {(['landStep1', 'landStep2', 'landStep3'] as const).map((k, i) => (
            <li key={k}>
              <span className="ld-k">{i + 1}</span>
              <span dangerouslySetInnerHTML={{ __html: t(k) }} />
            </li>
          ))}
        </ul>
      </section>

      {/* ---- the judge ---- */}
      <section className="ldp-sec ldp-alt">
        <h2 className="ldp-h2">{t('wlJudgeTitle')}</h2>
        <p className="ldp-lede">{t('wlJudgeLede')}</p>
        <div className="ldp-cats">
          {CATS.map((c) => (
            <div key={c.k} className="ldp-cat">
              <span className="ldp-cat-n">{t(c.k)}</span>
              <span className="ldp-cat-m">/{c.max}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the ladder ---- */}
      <section className="ldp-sec">
        <h2 className="ldp-h2">{t('wlLadderTitle')}</h2>
        <p className="ldp-lede">{t('wlLadderLede')}</p>
        <div className="ldp-tiers">
          {TIER_KEYS.map((k) => (
            <div key={k} className="ldp-tier">
              <TierBadge tier={k} size={46} />
              <span>{t(`tier_${k}`)}</span>
            </div>
          ))}
        </div>
        <div className="ldp-bots">
          {BOTS.map((b) => (
            <div key={b.id} className="ldp-bot">
              <BotAvatar botId={b.id} color="ink" size={56} bare />
              <span className="ldp-bot-n">{b.name}</span>
              <span className="ldp-bot-r">{b.elo}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- masks ---- */}
      <section className="ldp-sec ldp-alt">
        <h2 className="ldp-h2">{t('wlMaskTitle')}</h2>
        <p className="ldp-lede">{t('wlMaskLede')}</p>
        <div className="ldp-masks">
          {MASKS.map((id) => (
            <div key={id} className="ldp-mask">
              <Mask id={id} size={88} bare />
            </div>
          ))}
        </div>
      </section>

      {/* ---- drill + watch ---- */}
      <section className="ldp-sec ldp-duo">
        <div className="ldp-card">
          <span className="ldp-card-k">{t('wlDrillK')}</span>
          <p>{t('wlDrillLine')}</p>
        </div>
        <div className="ldp-card">
          <span className="ldp-card-k">{t('wlWatchK')}</span>
          <p>{t('wlWatchLine')}</p>
        </div>
      </section>

      {/* One email ask only, in the hero — a second one at the bottom made it
          two (his catch). No sign-in on this page at all: existing accounts
          use /auth/google directly, a URL, not a button. */}
      <footer className="ldp-foot">
        <p className="ldp-rule" dangerouslySetInnerHTML={{ __html: t('lbHouseRule') }} />
      </footer>
    </div>
  );
}
