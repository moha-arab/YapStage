// End of the lesson. No winner, no scoreboard — the YapMaster's three notes:
// what you did well, the one fix, and where to go next (Pip is waiting).
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { playBotTurn, stopBotVoice } from '../botvoice';
import BotAvatar from '../BotAvatar';

export interface DebriefInfo {
  praise: string;
  fix: string;
  next: string;
  mime?: string;
  audio?: ArrayBuffer;
}

interface Props {
  debrief: DebriefInfo;
  onTrain: () => void;
  onHome: () => void;
  /** Campaign: finishing the lesson unlocked your first real opponent. */
  unlocked?: { level: number; unlocked: string | null } | null;
}

export default function TutorialDone({ debrief, onTrain, onHome, unlocked }: Props) {
  const { lang, t } = useI18n();
  const [speaking, setSpeaking] = useState(true);

  // The YapMaster reads its notes out loud once, in its own voice.
  useEffect(() => {
    playBotTurn(
      `${debrief.praise} ${debrief.fix} ${debrief.next}`,
      debrief.audio,
      debrief.mime,
      lang,
      () => setSpeaking(false),
    );
    return () => stopBotVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stage center-col tutorial-done">
      <BotAvatar botId="tutor" color="gold" size={120} />
      <p className="kicker">{t('debriefKicker')}</p>
      <h1 className="display">{t('debriefTitle')}</h1>

      <div className="card tutorial-notes">
        <div className="note-block">
          <span className="tape">{t('debriefPraise')}</span>
          <p className="note-text">{debrief.praise}</p>
        </div>
        <div className="note-block">
          <span className="tape">{t('debriefFix')}</span>
          <p className="note-text">{debrief.fix}</p>
        </div>
        <div className="note-block">
          <span className="tape tape-gold">{t('debriefNext')}</span>
          <p className="note-text">{debrief.next}</p>
        </div>
      </div>

      {unlocked?.unlocked ? (
        <span className="tape tape-gold unlock-tape">
          {t('unlockedTape', { x: unlocked.unlocked })}
        </span>
      ) : null}

      <div className="tutorial-done-actions">
        <button className="btn btn-primary" onClick={onTrain}>
          {t('debriefTrainBtn')}
        </button>
        <button className="btn" onClick={onHome}>
          {t('backHome')}
        </button>
      </div>
    </div>
  );
}
