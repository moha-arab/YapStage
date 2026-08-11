// The home page's proof that this is a real place: finished ranked debates and
// the ladder, both pulled from the database. A landing page that DESCRIBES a
// product reads as a student project; one that shows a live artifact of it does
// not, and the artifact costs nothing to render because the data already exists.
//
// The cold-start rule: never render a zero and never render an empty list. With
// no ranked results yet, the fight card shows a ghosted example so a visitor
// learns the shape of the thing, and the ladder always has the bots on it.
import { useEffect, useState } from 'react';
import { useI18n } from './i18n';

interface Result {
  topic: string;
  winner: string;
  loser: string;
  won_total: number;
  lost_total: number;
  at: string;
}
interface Rung {
  name: string;
  rating: number;
  wins: number;
  losses: number;
  bot?: boolean;
}
interface Bot {
  name: string;
  elo: number;
  rank: number;
}

function ago(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t('agoNow');
  if (mins < 60) return t('agoMin', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('agoHour', { n: hrs });
  return t('agoDay', { n: Math.round(hrs / 24) });
}

export default function HomeFeed() {
  const { t } = useI18n();
  const [recent, setRecent] = useState<Result[] | null>(null);
  const [top, setTop] = useState<Rung[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);

  useEffect(() => {
    void fetch('/feed')
      .then((r) => r.json())
      .then((d: { recent?: Result[]; top?: Rung[] }) => {
        setRecent(d.recent ?? []);
        setTop(d.top ?? []);
      })
      .catch(() => setRecent([]));
    void fetch('/bots')
      .then((r) => r.json())
      .then((d: { bots?: Bot[] }) => setBots(d.bots ?? []))
      .catch(() => {});
  }, []);

  // One ladder, humans and bots together, sorted by rating. The bots are the
  // reason it is never empty, and they are the only fixed points on it: their
  // ratings never move, so "I beat Ozzy" means the same thing next year.
  const ladder: Rung[] = [
    ...top,
    ...bots.map((b) => ({ name: b.name, rating: b.elo, wins: 0, losses: 0, bot: true })),
  ]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 10);

  const headline = recent && recent.length > 0 ? recent[0]! : null;

  return (
    <section className="feed">
      <div className="feed-main">
        <h2 className="feed-head">{t('feedHead')}</h2>
        {headline ? (
          <>
            <article className="fight-card">
              <p className="fight-motion">{headline.topic}</p>
              <div className="fight-row">
                <span className="fight-name fight-win">{headline.winner}</span>
                <span className="fight-vs">{t('vsShort')}</span>
                <span className="fight-name fight-lose">{headline.loser}</span>
              </div>
              <p className="fight-meta">
                <span className="score">
                  {headline.won_total} - {headline.lost_total}
                </span>
                <span className="fight-dot" aria-hidden="true">
                  ·
                </span>
                {ago(headline.at, t)}
              </p>
            </article>
            {recent!.length > 1 ? (
              <ul className="feed-list">
                {recent!.slice(1, 5).map((r, i) => (
                  <li key={i}>
                    <span className="feed-winner">{r.winner}</span>
                    <span className="feed-beat">{t('feedBeat')}</span>
                    <span className="feed-loser">{r.loser}</span>
                    <span className="feed-topic">{r.topic}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          // First-run empty state: a ghosted real card teaches the shape of the
          // content better than an illustration or an apology ever could.
          <article className="fight-card fight-ghost" aria-hidden="true">
            <p className="fight-motion">{t('ghostMotion')}</p>
            <div className="fight-row">
              <span className="fight-name fight-win">{t('ghostA')}</span>
              <span className="fight-vs">{t('vsShort')}</span>
              <span className="fight-name fight-lose">{t('ghostB')}</span>
            </div>
            <p className="fight-meta">
              <span className="score">78 - 71</span>
            </p>
          </article>
        )}
        {recent && recent.length === 0 ? <p className="feed-empty">{t('feedEmptyLine')}</p> : null}
      </div>

      <div className="feed-side">
        <h2 className="feed-head">{t('ladderHead')}</h2>
        <ol className="ladder">
          {ladder.map((r, i) => (
            <li key={`${r.name}-${i}`} className={r.bot ? 'ladder-bot' : ''}>
              <span className="ladder-pos tabular">{i + 1}</span>
              <span className="ladder-name">{r.name}</span>
              {r.bot ? <span className="ladder-tag">{t('botTag')}</span> : null}
              <span className="ladder-elo elo">{r.rating}</span>
            </li>
          ))}
        </ol>
        <p className="ladder-note">{t('ladderNote')}</p>
      </div>
    </section>
  );
}
