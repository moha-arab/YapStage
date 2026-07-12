interface Props {
  level: number;
  label: string;
  warn?: boolean;
}

export default function MicMeter({ level, label, warn = false }: Props) {
  return (
    <div className={`meter-row ${warn ? 'meter-warn' : ''}`}>
      <span className="meter-label">{label}</span>
      <div className="meter">
        <div className="meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
    </div>
  );
}
