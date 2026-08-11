// Choose your mask. Deliberately tiny: a row of faces, tap one, done. This is
// the only cosmetic choice ranked allows, so it should feel like picking a
// fighter, not filling a form.
import Mask, { MASK_IDS } from './Mask';
import { useI18n } from './i18n';

interface Props {
  value: string;
  onPick: (id: string) => void;
  /** Hide the label when the surrounding screen already says what this is. */
  bare?: boolean;
}

export default function MaskPicker({ value, onPick, bare }: Props) {
  const { t } = useI18n();
  return (
    <div className="mask-picker">
      {bare ? null : <span className="field-label">{t('maskLabel')}</span>}
      <div className="mask-row">
        {MASK_IDS.map((id) => (
          <button
            key={id}
            className={`mask-chip ${value === id ? 'mask-chip-on' : ''}`}
            aria-pressed={value === id}
            aria-label={id}
            onClick={() => onPick(id)}
          >
            <Mask id={id} size={54} />
          </button>
        ))}
      </div>
    </div>
  );
}
