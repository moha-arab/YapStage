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
import Locker from './screens/Locker';
import Friends from './screens/Friends';
import TutorialDone from './screens/TutorialDone';
import TutorialIntro from './screens/TutorialIntro';
import Welcome from './screens/Welcome';
import ClaimName from './screens/ClaimName';
import BotSelect from './screens/BotSelect';
import Spectate from './screens/Spectate';
import type { Side, Verdict as VerdictData } from '../../server/src/protocol';
import TierBadge from './TierBadge';

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
      avatars={{ FOR: 'luchador', AGAINST: 'calavera' }}
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
  locker: () => (
    <Locker
      account={{ signedIn: true, google: true, name: 'zorvint', mask: 'oni', maskDefault: true }}
      onSaved={noop}
      onBack={noop}
    />
  ),
  friends: () => <Friends onBack={noop} onChallenge={() => Promise.resolve(null)} />,
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
        avatars: { FOR: 'luchador', AGAINST: 'calavera' },
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
