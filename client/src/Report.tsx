// Report a human opponent (custom + ranked debates). Two taps: open, pick a
// reason. Honest about two things: what reporting shares (this debate's
// words), and whether the report actually landed.
import { useState } from 'react';
import { socket } from './socket';
import { useI18n } from './i18n';

const REASONS = ['harassment', 'hate', 'cheating', 'other'] as const;

export default function ReportFlag() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');

  if (state === 'sent') {
    return <p className="report-done">{t('reportSent')}</p>;
  }

  if (!open) {
    return (
      <button className="report-btn" onClick={() => setOpen(true)}>
        {t('reportBtn')}
      </button>
    );
  }

  return (
    <div className="report-flag">
      <span className="report-note">{t('reportNote')}</span>
      <div className="chip-row report-reasons">
        {REASONS.map((r) => (
          <button
            key={r}
            className="cat-tab"
            disabled={state === 'busy'}
            onClick={() => {
              setState('busy');
              socket.emit('report', { reason: r }, (res) => {
                setState(res.ok ? 'sent' : 'failed');
              });
            }}
          >
            {t(`reason_${r}`)}
          </button>
        ))}
        <button className="cat-tab" onClick={() => setOpen(false)}>
          {t('reportCancel')}
        </button>
      </div>
      {state === 'failed' ? (
        <p className="error" role="alert">
          {t('reportFailed')}
        </p>
      ) : null}
    </div>
  );
}
