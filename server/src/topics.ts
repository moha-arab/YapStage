import type { TopicCategory } from './protocol.js';

// The deck. Real arguments only. If nobody would raise their voice about it
// at 1am, it doesn't belong here.
export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    key: 'mideast',
    label: 'middle east',
    topics: [
      'Kurdistan should be an independent country',
      "Israel's war in Gaza is justified",
      'Bashar al-Assad was good for Syria',
      'Arab countries should normalize relations with Israel',
      'Western intervention in the Middle East has done more harm than good',
      'The Gulf states own the future of the Arab world',
    ],
  },
  {
    key: 'america',
    label: 'america',
    topics: [
      'Trump has been good for America',
      'The US should stop funding Israel',
      'America is still the greatest country on earth',
      'The two-party system is broken beyond repair',
      'Illegal immigrants should have a path to citizenship',
      'Guns protect more Americans than they endanger',
    ],
  },
  {
    key: 'world',
    label: 'world order',
    topics: [
      'Russia was provoked into invading Ukraine',
      'China will overtake the US as the leading superpower',
      'Colonialism is still the main cause of global poverty',
      'The UN is useless',
      'Sanctions punish people, not governments',
      'Every country should have nukes, or none should',
    ],
  },
  {
    key: 'money',
    label: 'money',
    topics: [
      'Capitalism is failing this generation',
      'College is no longer worth it',
      'Money can buy happiness',
      'Landlords earn their money',
      'Crypto is a scam with extra steps',
      'Nobody should be a billionaire',
    ],
  },
  {
    key: 'modern',
    label: 'modern life',
    topics: [
      'Social media is destroying a generation',
      'AI will do more good than harm to humanity',
      'TikTok should be banned',
      'Dating apps ruined dating',
      'Marriage is an outdated institution',
      'Moving back in with your parents after college is a failure',
    ],
  },
];

export const ALL_TOPICS = new Set(TOPIC_CATEGORIES.flatMap((c) => c.topics));
