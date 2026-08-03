import { useI18n } from '../i18n';

interface Props {
  onBack: () => void;
}

/** The debate school. Short, skimmable, in the site's voice — a casual player
    should be able to read the whole thing in two minutes and walk into their
    first match knowing what each round is for and how the judge thinks. */
export default function Learn({ onBack }: Props) {
  const { t } = useI18n();

  const rounds = [
    { key: 'open', num: '1' },
    { key: 'rebut', num: '2' },
    { key: 'defend', num: '3' },
    { key: 'close', num: '4' },
  ];
  const scores = ['argument', 'evidence', 'clash', 'delivery'];
  const rules = ['newArgs', 'dropped', 'order'];
  const tips = ['tip1', 'tip2', 'tip3', 'tip4'];

  return (
    <div className="stage learn">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="pill">{t('learnPill')}</span>
      </header>

      <h1 className="display learn-title">{t('learnTitle')}</h1>
      <p className="learn-lede">{t('learnLede')}</p>

      <section className="learn-block">
        <span className="tape">{t('learnRoundsTape')}</span>
        <div className="learn-rounds">
          {rounds.map((r) => (
            <div className="learn-round" key={r.key}>
              <span className="learn-round-num">{r.num}</span>
              <h3 className="learn-round-name">{t(`learn_${r.key}_name`)}</h3>
              <p className="learn-round-job">{t(`learn_${r.key}_job`)}</p>
              <p className="learn-round-tip">{t(`learn_${r.key}_tip`)}</p>
            </div>
          ))}
        </div>
        <p className="small-print">{t('learnRoundsNote')}</p>
      </section>

      <section className="learn-block">
        <span className="tape">{t('learnScoreTape')}</span>
        <div className="learn-scores">
          {scores.map((s) => (
            <div className="learn-score" key={s}>
              <span className="learn-score-name">{t(`learn_score_${s}_name`)}</span>
              <span className="learn-score-max">{t(`learn_score_${s}_max`)}</span>
              <p className="learn-score-desc">{t(`learn_score_${s}_desc`)}</p>
            </div>
          ))}
        </div>
        <p className="small-print">{t('learnScoreNote')}</p>
      </section>

      <section className="learn-block">
        <span className="tape">{t('learnRulesTape')}</span>
        {rules.map((r) => (
          <div className="learn-rule" key={r}>
            <h3 className="learn-rule-name">{t(`learn_rule_${r}_name`)}</h3>
            <p className="learn-rule-body">{t(`learn_rule_${r}_body`)}</p>
          </div>
        ))}
      </section>

      <section className="learn-block">
        <span className="tape">{t('learnTipsTape')}</span>
        <ul className="learn-tips">
          {tips.map((k) => (
            <li key={k}>{t(`learn_${k}`)}</li>
          ))}
        </ul>
      </section>

      <button className="btn btn-primary btn-wide learn-go" onClick={onBack}>
        {t('learnGo')}
      </button>
    </div>
  );
}
