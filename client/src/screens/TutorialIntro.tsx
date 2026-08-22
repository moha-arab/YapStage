// The tutorial's own green room: meet the teacher, hear what's about to
// happen, check your camera, then step on stage. The unlock calls must live
// inside the start tap (iOS unlocks audio per user gesture, per element).
import { useI18n } from '../i18n';
import { initAudio } from '../sound';
import { unlockBotVoice } from '../botvoice';
import BotAvatar from '../BotAvatar';
import VideoTile from '../VideoTile';
import Brand from '../Brand';

interface Props {
  localStream: MediaStream | null;
  mediaError: string | null;
  onRetryMedia: () => void;
  onStart: () => void;
  onBack: () => void;
  /** Your locker mask, when you chose to wear it instead of a camera. */
  selfMask?: string;
}

export default function TutorialIntro({ localStream, mediaError, onRetryMedia, onStart, onBack, selfMask }: Props) {
  const { t } = useI18n();
  const ready = Boolean(localStream) || Boolean(selfMask);

  function start() {
    if (!ready) return;
    initAudio();
    unlockBotVoice();
    onStart();
  }

  return (
    <div className="stage center-col tutorial-intro">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <Brand />
        <span className="pill">{t('tutorialPill')}</span>
      </header>

      <BotAvatar botId="tutor" color="gold" size={120} speaking />
      <p className="kicker">{t('tutorialKicker')}</p>
      <h1 className="display">{t('tutorialTitle')}</h1>
      <p className="tutorial-lore">{t('tutorialLore')}</p>

      <div className="card tutorial-brief">
        <p className="tutorial-line">{t('tutorialHow1')}</p>
        <p className="tutorial-line">{t('tutorialHow2')}</p>
        <p className="tutorial-line">{t('tutorialHow3')}</p>
        <p className="tutorial-line">{t('tutorialHow4')}</p>
      </div>

      <div className="bot-mirror">
        <VideoTile
          stream={localStream}
          muted
          mirror
          maskId={selfMask}
          label={t('you')}
          sub={t(selfMask ? 'onMask' : 'onCam')}
          placeholder={mediaError ? t('cameraBlocked') : t('cameraWarming')}
        />
      </div>

      {mediaError ? (
        <div className="banner banner-error">
          {t(mediaError)}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      <button className="btn btn-primary btn-wide" disabled={!ready} onClick={start}>
        {t('tutorialGo')}
      </button>
    </div>
  );
}
