/* DEV-ONLY screen harness. Not part of the production bundle: vite builds
 * index.html and nothing else, so preview.html only exists under `vite dev`.
 *
 * Why it exists: half the screens in this app sit behind a signed-in session,
 * a live opponent or a finished judge run, which makes "did the redesign break
 * the verdict screen" a twenty-minute question. Here it is one URL:
 *
 *   npm run dev -w client   ->   http://localhost:5173/preview.html?s=verdict
 *
 * Add a screen to SCREENS with realistic props. Fake data only.
 */
import { createRoot } from 'react-dom/client';
import { LangProvider } from './i18n';
import './styles.css';
import './lobby.css';
import Verdict from './screens/Verdict';
import Matches from './screens/Matches';
import TutorialDone from './screens/TutorialDone';
import TutorialIntro from './screens/TutorialIntro';
import Welcome from './screens/Welcome';
import ClaimName from './screens/ClaimName';
import BotSelect from './screens/BotSelect';
import Spectate from './screens/Spectate';
import Home from './screens/Home';
import type { Side, Verdict as VerdictData } from '../../server/src/protocol';
import TierBadge from './TierBadge';
import VideoTile from './VideoTile';
import Mask, { MASK_IDS } from './Mask';
import FightCard from './FightCard';
import Splash from './Splash';
import { ARISTOTLE_200, BOT_PORTRAITS, NAPOLEON_200 } from './dev/botPortraits';

const noop = () => {};

const VERDICT: VerdictData = {
  winner: 'FOR',
  summary: 'the coin gave you the harder side and you still walked out with it.',
  scores: {
    FOR: { argument: 26, evidence: 15, clash: 24, delivery: 17 },
    AGAINST: { argument: 21, evidence: 12, clash: 19, delivery: 16 },
  },
  bestQuote: {
    FOR: 'tuition tripled while wages stayed flat, and google stopped asking for the paper anyway',
    AGAINST: 'you keep saying credential like that is all four years are',
  },
  feedback: {
    FOR: [
      'you took their strongest point first instead of the easiest one. that is the whole game.',
      'the numbers were doing the work and you let them go by too fast. slow down on the one that matters.',
    ],
    AGAINST: [
      'you defended the degree in general when they attacked the debt specifically. answer the actual claim.',
      'good closing, but it arrived as a summary. give it one new reason to land on.',
    ],
  },
  injectionDetected: false,
};

const names: Record<Side, string> = { FOR: 'zorvint', AGAINST: 'goat' };

const SCREENS: Record<string, () => JSX.Element> = {
  verdict: () => (
    <Verdict
      info={{
        verdict: VERDICT,
        names,
        heard: { FOR: 214, AGAINST: 188 },
        elo: { FOR: { before: 1104, after: 1128 }, AGAINST: { before: 1180, after: 1156 } },
      }}
      status={null}
      mySide="FOR"
      topic={{ id: 'demo', en: 'college is no longer worth it', ar: '' }}
      localStream={null}
      remoteStream={null}
      rtcConnected={false}
      peerName="goat"
      myName="zorvint"
      onLeaveCall={noop}
      onRetry={noop}
      onRematch={noop}
      rematch={null}
      ranked
      avatars={{ FOR: 'bally', AGAINST: 'marisol' }}
      opponentRating={1180}
    />
  ),
  /* The placement verdict: a starting rating, no delta, nothing gold. */
  placed: () => (
    <Verdict
      info={{
        verdict: VERDICT,
        names: { FOR: 'zorvint', AGAINST: 'Brutus' },
        heard: { FOR: 214, AGAINST: 188 },
        placement: { rating: 1512 },
      }}
      status={null}
      mySide="FOR"
      topic={{ id: 'demo', en: 'college is no longer worth it', ar: '' }}
      localStream={null}
      remoteStream={null}
      rtcConnected={false}
      peerName="Brutus"
      myName="zorvint"
      onLeaveCall={noop}
      onRetry={noop}
      onRematch={noop}
      rematch={null}
      botOpponent={{ id: 'bull', name: 'Brutus', color: 'for' }}
      avatars={{ FOR: 'bally' }}
      opponentRating={1350}
    />
  ),
  /* The lobby for a player who has not placed yet: the placement bot stands
     where a stranger would. /rating and the rest are faked in place, since
     the dev server proxies nothing but /bots and the socket. */
  placement: () => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input);
      const json = (body: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
      if (url.startsWith('/rating')) return json({ rating: 700, placed: false, placementBot: 'Brutus' });
      if (url.startsWith('/bots'))
        return json({
          bots: [
            { id: 'owl', name: 'Ozzy', color: 'against', elo: 1200, rank: 4, tagline: 'a scholarly owl', blurb: '' },
            { id: 'bull', name: 'Brutus', color: 'for', elo: 1350, rank: 5, tagline: 'a raging bull', blurb: '' },
            { id: 'giraffe', name: 'Gigi', color: 'gold', elo: 1500, rank: 6, tagline: 'THE FINAL BOSS', blurb: '' },
          ],
        });
      if (url.startsWith('/live')) return json({ live: 0, watchable: 0, featured: null });
      if (url.startsWith('/drill')) return json({});
      return real(input, init);
    };
    return (
      <Home
        account={{ signedIn: false, google: false }}
        notice={null}
        onEntered={noop}
        onSpectate={noop}
        onMatches={noop}
        onDrill={noop}
        onBotStart={noop}
        onTutorial={noop}
        onMaskSaved={noop}
      />
    );
  },
  /* Watch a match with three live bouts on the list. ?empty=1 for the
     nothing-live line, which keeps only the code box. */
  watch: () => {
    const real = window.fetch.bind(window);
    const empty = new URLSearchParams(window.location.search).has('empty');
    const now = Date.now();
    const matches = [
      {
        code: 'ABCDEF',
        topic: { id: 'early-riser', en: 'Waking up early is overrated', ar: '' },
        category: 'everyday',
        names: { FOR: 'zorvint', AGAINST: 'goat' },
        avatars: { FOR: 'napoleon', AGAINST: 'shuten' },
        phase: 'rebuttal',
        stepIndex: 2,
        watchers: 4,
        startedAt: now - 134000,
      },
      {
        code: 'GHIJKL',
        topic: { id: 'aliens', en: 'We are not alone in the universe', ar: '' },
        category: 'big',
        names: { FOR: 'pizzamaster', AGAINST: 'yapqueen' },
        avatars: { FOR: 'marisol', AGAINST: 'diogenes' },
        phase: 'opening',
        stepIndex: 1,
        watchers: 0,
        startedAt: now - 41000,
      },
      {
        code: 'MNOPQR',
        topic: { id: 'success-luck', en: 'Success is mostly luck', ar: '' },
        category: 'big',
        names: { FOR: 'corvin_x', AGAINST: 'lena' },
        avatars: { FOR: 'corvin', AGAINST: 'athena' },
        phase: null,
        stepIndex: -1,
        watchers: 1,
        startedAt: null,
      },
    ];
    const categories = ['everyday life', 'school', 'tech', 'sport', 'food', 'culture', 'money', 'big questions'].map(
      (en, i) => ({ key: ['everyday', 'school', 'tech', 'sport', 'food', 'culture', 'money', 'big'][i], label: { en, ar: '' } }),
    );
    window.fetch = (input, init) => {
      const url = String(input);
      const json = (body: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
      if (url.startsWith('/rating')) return json({ rating: 1400, placed: true, placementBot: 'Nora' });
      if (url.startsWith('/bots')) return json({ bots: [] });
      if (url.startsWith('/live'))
        return json(
          empty
            ? { live: 0, watchable: 0, featured: null, matches: [], categories, serverNow: Date.now() }
            : {
                live: 3,
                watchable: 3,
                featured: { ...matches[0] },
                matches,
                categories,
                serverNow: Date.now(),
              },
        );
      if (url.startsWith('/drill')) return json({});
      return real(input, init);
    };
    return (
      <Home
        account={{ signedIn: false, google: false }}
        notice={null}
        onEntered={noop}
        onSpectate={noop}
        onMatches={noop}
        onDrill={noop}
        onBotStart={noop}
        onTutorial={noop}
        onMaskSaved={noop}
        initialMode="watch"
      />
    );
  },
  verdictWait: () => (
    <Verdict
      info={null}
      status={{ state: 'pending' }}
      mySide="FOR"
      topic={{ id: 'demo', en: 'college is no longer worth it', ar: '' }}
      localStream={null}
      remoteStream={null}
      rtcConnected={false}
      peerName="goat"
      myName="zorvint"
      onLeaveCall={noop}
      onRetry={noop}
      onRematch={noop}
      rematch={null}
      ranked
    />
  ),
  matches: () => <Matches onBack={noop} />,
  tutorialDone: () => (
    <TutorialDone
      debrief={{
        praise: 'you never once said "um, so basically". that is rarer than you think.',
        fix: 'you answered the easy half of their point and left the hard half alone.',
        next: 'go take Pip. same shape, real opponent, nothing on the line.',
      }}
      unlocked={null}
      onTrain={noop}
      onHome={noop}
    />
  ),
  tutorialIntro: () => (
    <TutorialIntro
      localStream={null}
      mediaError={null}
      onRetryMedia={noop}
      onStart={noop}
      onBack={noop}
    />
  ),
  badges: () => (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 28 }}>
      {[72, 36, 20].map((s) => (
        <div key={s} style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          {['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'headliner'].map(
            (k) => (
              <div key={k} style={{ textAlign: 'center', color: '#9A97B0', fontSize: 11 }}>
                <TierBadge tier={k} size={s} />
                {s === 72 ? <div style={{ marginTop: 6 }}>{k}</div> : null}
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  ),
  welcome: () => <Welcome />,
  /* The Napoleon attempt at every size it would ship at. */
  napoleon: () => (
    <div style={{ padding: 32, background: 'var(--house)', minHeight: '100vh', display: 'flex', gap: 40, alignItems: 'flex-end' }}>
      {[360, 200, 110, 54, 36].map((s) => (
        <svg
          key={s}
          viewBox="0 0 200 200"
          style={{ width: s, height: s, display: 'block' }}
          dangerouslySetInnerHTML={{ __html: NAPOLEON_200 }}
        />
      ))}
    </div>
  ),
  aristotle: () => (
    <div style={{ padding: 32, background: 'var(--house)', minHeight: '100vh', display: 'flex', gap: 40, alignItems: 'flex-end' }}>
      {[360, 200, 110, 54, 36].map((s) => (
        <svg key={s} viewBox="0 0 200 200" style={{ width: s, height: s, display: 'block' }} dangerouslySetInnerHTML={{ __html: ARISTOTLE_200 }} />
      ))}
    </div>
  ),
  /* Candidate bot portraits for the arguers ladder, with a mask beside them
     so the bot/mask difference is visible at every size. */
  bots: () => {
    const cast: [string, string, number][] = [
      ['cyclops', 'Cyclops', 200],
      ['diogenes', 'Diogenes', 800],
      ['napoleon', 'Napoleon', 1400],
      ['lincoln', 'Lincoln', 2000],
      ['socrates', 'Socrates', 2600],
      ['athena', 'Athena', 2800],
    ];
    const svg = (id: string, s: number) => (
      <svg
        viewBox="0 0 100 100"
        style={{ width: s, height: s, display: 'block' }}
        dangerouslySetInnerHTML={{ __html: BOT_PORTRAITS[id] }}
      />
    );
    return (
      <div style={{ padding: 32, background: 'var(--house)', minHeight: '100vh', color: 'var(--muted)' }}>
        {[200, 110, 54, 36].map((s) => (
          <div key={s} style={{ display: 'flex', gap: s > 100 ? 26 : 16, alignItems: 'flex-end', marginBottom: 26 }}>
            {cast.map(([id, name, elo]) => (
              <div key={id} style={{ textAlign: 'center', fontSize: 12 }}>
                {svg(id, s)}
                {s === 200 ? (
                  <div style={{ marginTop: 8, fontFamily: 'Ultra, serif', fontSize: 16, color: 'var(--paper)' }}>
                    {name} <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>{elo}</span>
                  </div>
                ) : null}
              </div>
            ))}
            <div style={{ textAlign: 'center', fontSize: 12, marginInlineStart: 20 }}>
              <Mask id="ninja" size={s} bare />
              {s === 200 ? <div style={{ marginTop: 8, fontFamily: 'Ultra, serif', fontSize: 16, color: 'var(--paper)' }}>mask, for contrast</div> : null}
            </div>
          </div>
        ))}
      </div>
    );
  },
  /* The lobby bar as a signed-in player sees it: mark, rule, two buttons. */
  bar: () => (
    <div className="lb" style={{ height: 200 }}>
      <header className="lb-bar">
        <div className="lb-lock">
          <svg viewBox="0 0 64 64" width="28" height="28" aria-label="YapStage">
            <path d="M8 14 h20 v20 q0 12 -14 16 v-8 q7 -3 7 -8 h-13 z" fill="var(--amber)" />
            <path d="M56 50 h-20 v-20 q0 -12 14 -16 v8 q-7 3 -7 8 h13 z" fill="var(--turq)" />
          </svg>
          <span className="lb-word">YAPSTAGE</span>
        </div>
        <div className="lb-who">
          <button className="lb-bar-btn">Previous matches</button>
          <button className="lb-bar-btn lb-bar-btn-quiet">Sign out</button>
        </div>
      </header>
      <p className="lb-warn">
        <b>Reading off a chatbot gets you banned.</b>
      </p>
    </div>
  ),
  /* The roster sheet: every character at the sizes they actually ship at
     (lobby stage, spectate, picker, friends list). */
  masks: () => (
    <div style={{ padding: 32, background: 'var(--house)', minHeight: '100vh', color: 'var(--muted)' }}>
      {[200, 110, 54, 36].map((s) => (
        <div key={s} style={{ display: 'flex', gap: s > 100 ? 28 : 16, alignItems: 'flex-end', marginBottom: 26 }}>
          {MASK_IDS.map((id) => (
            <div key={id} style={{ textAlign: 'center', fontSize: 12 }}>
              <Mask id={id} size={s} bare />
              {s === 200 ? <div style={{ marginTop: 8, fontFamily: 'Ultra, serif', fontSize: 16, color: 'var(--paper)' }}>{id}</div> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
  /* The speaking ring at four voice levels: on the mic and loud, on the mic
     and mid-word, on the mic but silent, and listening. */
  ring: () => (
    <div
      style={{
        padding: 32,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 18,
        maxWidth: 980,
        background: 'var(--house)',
        minHeight: '100vh',
      }}
    >
      <VideoTile stream={null} muted label="zorvint" sub="FOR" side="FOR" maskId="napoleon" level={0.85} active />
      <VideoTile stream={null} muted label="goat" sub="AGAINST" side="AGAINST" maskId="marisol" level={0} />
      <VideoTile stream={null} muted label="pizzamaster" sub="AGAINST" side="AGAINST" maskId="shuten" level={0.4} active />
      <VideoTile stream={null} muted label="kenji" sub="FOR" side="FOR" maskId="diogenes" level={0} active />
    </div>
  ),
  claimName: () => <ClaimName onClaimed={noop} />,
  /* The fight card three ways: against a bot, a masked ranked match, and a
     settle-it where the sides are sentences. revealMs is frozen so the shot
     never lands on the fade-out. */
  fightBot: () => (
    <FightCard
      start={{
        topic: { id: 'demo', en: 'college is no longer worth it', ar: '' },
        yourSide: 'FOR',
        names: { FOR: 'zorvint', AGAINST: 'Cappy' },
        startsAt: Date.now() + 8000,
        serverNow: Date.now(),
        avatars: { FOR: 'bally' },
        bot: { id: 'capybara', name: 'Cappy', color: 'ink', elo: 1400 },
      }}
      localStream={null}
      remoteStream={null}
      revealMs={6400}
    />
  ),
  fightHuman: () => (
    <FightCard
      start={{
        topic: { id: 'demo', en: 'social media should be banned for under-16s', ar: '' },
        yourSide: 'AGAINST',
        names: { FOR: 'pizzamaster', AGAINST: 'goat' },
        startsAt: Date.now() + 8000,
        serverNow: Date.now(),
        avatars: { FOR: 'marisol', AGAINST: 'fuma' },
      }}
      localStream={null}
      remoteStream={null}
      revealMs={6400}
    />
  ),
  fightDispute: () => (
    <FightCard
      start={{
        topic: { id: 'dispute', en: 'the dishes are a shared job, not a favour', ar: '' },
        yourSide: 'FOR',
        names: { FOR: 'zorvint', AGAINST: 'goat' },
        startsAt: Date.now() + 8000,
        serverNow: Date.now(),
        avatars: { FOR: 'garn' },
        framing: {
          argument: 'the dishes are a shared job, not a favour',
          positions: {
            FOR: 'doing the dishes is part of living here',
            AGAINST: 'whoever cooks is off dishes that night',
          },
          said: {
            FOR: 'he never does the dishes',
            AGAINST: 'i cook, so the dishes are his',
          },
        },
      }}
      localStream={null}
      remoteStream={null}
      revealMs={6400}
    />
  ),
  /* The opening, held at the end of its run (no timer, no exit). */
  splash: () => <Splash hold />,
  botSelect: () => (
    <BotSelect
      localStream={null}
      mediaError={null}
      onRetryMedia={noop}
      onStart={noop}
      onTutorial={noop}
      onBack={noop}
    />
  ),
  spectate: () => (
    <Spectate
      code="ABCDEF"
      initial={{
        code: 'ABCDEF',
        status: 'in_debate',
        topic: { id: 'demo', en: 'college is no longer worth it', ar: '' },
        names,
        phase: {
          stepIndex: 2,
          phase: 'rebuttal',
          activeSpeaker: 'AGAINST',
          seconds: 45,
          deadline: Date.now() + 31000,
          serverNow: Date.now(),
        },
        watchers: 3,
        avatars: { FOR: 'quip', AGAINST: 'corvin' },
      }}
      onLeave={noop}
    />
  ),
};

const which = new URLSearchParams(location.search).get('s') ?? 'verdict';
const Screen = SCREENS[which];

createRoot(document.getElementById('root')!).render(
  <LangProvider>
    {Screen ? (
      <Screen />
    ) : (
      <pre style={{ color: '#EFE8D8', padding: 24 }}>
        {`?s= one of:\n${Object.keys(SCREENS).join('\n')}`}
      </pre>
    )}
  </LangProvider>,
);
