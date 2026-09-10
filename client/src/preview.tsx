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
import type { Side, Verdict as VerdictData } from '../../server/src/protocol';
import TierBadge from './TierBadge';
import VideoTile from './VideoTile';
import Mask from './Mask';
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
      avatars={{ FOR: 'huckster', AGAINST: 'calavera' }}
      opponentRating={1180}
    />
  ),
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
  /* The mask sheet: the two he kept beside the four candidates, at the sizes
     they actually ship at (lobby stage, spectate, picker, friends list). */
  masks: () => (
    <div style={{ padding: 32, background: 'var(--house)', minHeight: '100vh', color: 'var(--muted)' }}>
      {[200, 110, 54, 36].map((s) => (
        <div key={s} style={{ display: 'flex', gap: s > 100 ? 28 : 16, alignItems: 'flex-end', marginBottom: 26 }}>
          {['ninja', 'oni', 'calavera', 'climber', 'gamer', 'huckster', 'alien', 'plague'].map((id) => (
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
      <VideoTile stream={null} muted label="zorvint" sub="FOR" side="FOR" maskId="luchador" level={0.85} active />
      <VideoTile stream={null} muted label="goat" sub="AGAINST" side="AGAINST" maskId="calavera" level={0} />
      <VideoTile stream={null} muted label="pizzamaster" sub="AGAINST" side="AGAINST" maskId="oni" level={0.4} active />
      <VideoTile stream={null} muted label="kenji" sub="FOR" side="FOR" maskId="ninja" level={0} active />
    </div>
  ),
  claimName: () => <ClaimName onClaimed={noop} />,
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
        avatars: { FOR: 'climber', AGAINST: 'gamer' },
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
