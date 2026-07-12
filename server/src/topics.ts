import type { TopicCategory, TopicText } from './protocol.js';

// The deck, bilingual. Topics match by ID so an English-mode player and an
// Arabic-mode player land on the same debate.
export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    key: 'mideast',
    label: { en: 'middle east', ar: 'الشرق الأوسط' },
    topics: [
      { id: 'kurdistan', en: 'Kurdistan should be an independent country', ar: 'كردستان يجب أن تكون دولة مستقلة' },
      { id: 'gaza-war', en: "Israel's war in Gaza is justified", ar: 'حرب إسرائيل على غزة مبررة' },
      { id: 'assad-syria', en: 'Bashar al-Assad was good for Syria', ar: 'بشار الأسد كان جيداً لسوريا' },
      { id: 'normalize-israel', en: 'Arab countries should normalize relations with Israel', ar: 'على الدول العربية التطبيع مع إسرائيل' },
      { id: 'western-intervention', en: 'Western intervention in the Middle East has done more harm than good', ar: 'التدخل الغربي في الشرق الأوسط ضرره أكبر من نفعه' },
      { id: 'gulf-future', en: 'The Gulf states own the future of the Arab world', ar: 'دول الخليج تملك مستقبل العالم العربي' },
    ],
  },
  {
    key: 'america',
    label: { en: 'america', ar: 'أمريكا' },
    topics: [
      { id: 'trump-america', en: 'Trump has been good for America', ar: 'ترامب كان جيداً لأمريكا' },
      { id: 'us-israel-funding', en: 'The US should stop funding Israel', ar: 'على أمريكا وقف تمويل إسرائيل' },
      { id: 'america-greatest', en: 'America is still the greatest country on earth', ar: 'أمريكا ما زالت أعظم دولة على الأرض' },
      { id: 'two-party', en: 'The two-party system is broken beyond repair', ar: 'نظام الحزبين الأمريكي معطوب بلا إصلاح' },
      { id: 'immigrants-path', en: 'Illegal immigrants should have a path to citizenship', ar: 'المهاجرون غير الشرعيين يستحقون طريقاً للمواطنة' },
      { id: 'guns-protect', en: 'Guns protect more Americans than they endanger', ar: 'السلاح يحمي الأمريكيين أكثر مما يعرّضهم للخطر' },
    ],
  },
  {
    key: 'world',
    label: { en: 'world order', ar: 'النظام العالمي' },
    topics: [
      { id: 'russia-provoked', en: 'Russia was provoked into invading Ukraine', ar: 'روسيا استُفزّت لغزو أوكرانيا' },
      { id: 'china-superpower', en: 'China will overtake the US as the leading superpower', ar: 'الصين ستتجاوز أمريكا كقوة عظمى أولى' },
      { id: 'colonialism-poverty', en: 'Colonialism is still the main cause of global poverty', ar: 'الاستعمار ما زال السبب الرئيسي للفقر في العالم' },
      { id: 'un-useless', en: 'The UN is useless', ar: 'الأمم المتحدة بلا فائدة' },
      { id: 'sanctions', en: 'Sanctions punish people, not governments', ar: 'العقوبات تعاقب الشعوب لا الحكومات' },
      { id: 'nukes-all-or-none', en: 'Every country should have nukes, or none should', ar: 'إما نووي للجميع أو لا نووي لأحد' },
    ],
  },
  {
    key: 'money',
    label: { en: 'money', ar: 'المال' },
    topics: [
      { id: 'capitalism-failing', en: 'Capitalism is failing this generation', ar: 'الرأسمالية تخذل هذا الجيل' },
      { id: 'college-worth', en: 'College is no longer worth it', ar: 'الجامعة لم تعد تستحق' },
      { id: 'money-happiness', en: 'Money can buy happiness', ar: 'المال يشتري السعادة' },
      { id: 'landlords', en: 'Landlords earn their money', ar: 'أصحاب العقارات يستحقون أموالهم' },
      { id: 'crypto-scam', en: 'Crypto is a scam with extra steps', ar: 'العملات الرقمية نصبٌ بخطوات إضافية' },
      { id: 'no-billionaires', en: 'Nobody should be a billionaire', ar: 'لا يجب أن يوجد مليارديرات' },
    ],
  },
  {
    key: 'modern',
    label: { en: 'modern life', ar: 'الحياة الحديثة' },
    topics: [
      { id: 'social-media', en: 'Social media is destroying a generation', ar: 'السوشيال ميديا تدمّر جيلاً كاملاً' },
      { id: 'ai-good', en: 'AI will do more good than harm to humanity', ar: 'الذكاء الاصطناعي نفعه أكبر من ضرره للبشرية' },
      { id: 'tiktok-ban', en: 'TikTok should be banned', ar: 'يجب حظر تيك توك' },
      { id: 'dating-apps', en: 'Dating apps ruined dating', ar: 'تطبيقات التعارف أفسدت العلاقات' },
      { id: 'marriage-outdated', en: 'Marriage is an outdated institution', ar: 'الزواج مؤسسة عفا عليها الزمن' },
      { id: 'moving-back', en: 'Moving back in with your parents after college is a failure', ar: 'العودة للسكن مع الأهل بعد الجامعة فشل' },
    ],
  },
];

export const TOPIC_BY_ID = new Map<string, TopicText>(
  TOPIC_CATEGORIES.flatMap((c) => c.topics).map((t) => [t.id, t]),
);
