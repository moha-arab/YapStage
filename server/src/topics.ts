import type { TopicCategory, TopicText } from './protocol.js';

// The deck, bilingual. Topics match by ID so an English-mode player and an
// Arabic-mode player land on the same debate.
//
// Eight tabs of seven, all claims in sentence case, each arguable either way
// by a nineteen-year-old with no research. Out on purpose: live wars, named
// politicians, religion, guns, race, sexuality, and anything where one side is
// a moral floor. Ranked and random modes roll a category first, so an earlier
// deck in which three tabs in five were geopolitics dealt most stranger
// matches a side the player could not honestly argue. Named athletes are fine;
// named politicians are not. The first tab is the default in the pickers (they
// index by position), so its first motion is the lightest.
//
// Balance, first pass: the coin deals sides, so a lopsided motion lets the
// coin pick the winner. Every motion must give BOTH sides five minutes of
// respectable argument: no absolutes ("always", "never", "nothing") that one
// counterexample sinks, no loaded words ("destroying", "scam"), no side that
// has to call people failures.
//
// Balance, second pass, prompted by a motion whose dealt side was nearly
// indefensible in play ("Spoilers are not a big deal", FOR). Every motion
// scored for how fair a coin deal is: 14 reworded, 11 replaced, average
// balance 3.6 to 4.3 of 5. Out:
// "can" claims one example wins, put-downs one side must defend ("boring",
// "just cartoons"), questions with a label or a statistic for an answer
// (ketchup, lottery outcomes), near-duplicates (chess and esports, concert and
// classroom phones, three AI motions), and topics that need specialist
// knowledge a random stranger may lack (VAR). A reworded motion keeps its id;
// a replaced one gets a new id (match history stores the text, not the id).
export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    key: 'everyday',
    label: { en: 'everyday life', ar: 'الحياة اليومية' },
    topics: [
      { id: 'early-riser', en: 'Waking up early is overrated', ar: 'الاستيقاظ المبكر مبالغ فيه' },
      { id: 'phone-password', en: 'Your partner should have your phone password', ar: 'شريك حياتك يجب أن يعرف كلمة سر هاتفك' },
      { id: 'moving-back', en: "You should move out of your parents' house as soon as you can afford it", ar: 'عليك أن تستقل عن بيت أهلك فور قدرتك على ذلك مادياً' },
      { id: 'call-first', en: 'Calling someone without texting first is rude', ar: 'الاتصال بأحد دون رسالة مسبقة قلة ذوق' },
      { id: 'long-distance', en: 'Long-distance relationships are not worth it', ar: 'العلاقات عن بُعد لا تستحق العناء' },
      { id: 'ten-late', en: 'Being ten minutes late to meet a friend is fine', ar: 'التأخر عشر دقائق عن موعد مع صديق أمر عادي' },
      { id: 'friends-ex', en: 'Staying friends with an ex is a bad idea', ar: 'البقاء صديقاً لشريكك السابق فكرة سيئة' },
    ],
  },
  {
    key: 'school',
    label: { en: 'school and work', ar: 'الدراسة والعمل' },
    topics: [
      { id: 'wfh-lazy', en: 'Working from home is better than working in an office', ar: 'العمل من البيت أفضل من العمل في المكتب' },
      { id: 'school-uniforms', en: 'School uniforms should be required', ar: 'يجب أن يكون الزي المدرسي إلزامياً' },
      { id: 'college-worth', en: 'Skills matter more than a degree', ar: 'المهارات أهم من الشهادة الجامعية' },
      { id: 'phones-class', en: 'Phones should be banned in classrooms', ar: 'يجب منع الهواتف في الصفوف الدراسية' },
      { id: 'four-day-week', en: 'Four ten-hour days beat five eight-hour days', ar: 'أربعة أيام عمل بعشر ساعات أفضل من خمسة أيام بثماني ساعات' },
      { id: 'ai-essay', en: 'Students should be allowed to use AI on homework', ar: 'يجب السماح للطلاب باستخدام الذكاء الاصطناعي في الواجبات' },
      { id: 'passion-advice', en: 'Following your passion is bad career advice', ar: 'اتباع شغفك نصيحة مهنية سيئة' },
    ],
  },
  {
    key: 'tech',
    label: { en: 'tech', ar: 'التقنية' },
    topics: [
      { id: 'iphone-logo', en: 'iPhone users are paying for the logo', ar: 'مستخدمو الآيفون يدفعون ثمن الشعار' },
      { id: 'social-media', en: "Social media has made young people's lives worse", ar: 'السوشيال ميديا جعلت حياة الشباب أسوأ' },
      { id: 'ai-good', en: 'AI will do more good than harm to humanity', ar: 'الذكاء الاصطناعي نفعه أكبر من ضرره للبشرية' },
      { id: 'online-friends', en: 'Online friends are as real as offline friends', ar: 'أصدقاء الإنترنت حقيقيون مثل أصدقاء الواقع' },
      { id: 'phone-16', en: 'Parents should wait until 16 to give their kids a smartphone', ar: 'على الأهل الانتظار حتى سن السادسة عشرة قبل إعطاء أطفالهم هاتفاً ذكياً' },
      { id: 'self-driving', en: 'Humans should stop driving once cars can drive themselves', ar: 'يجب أن يتوقف البشر عن القيادة حين تستطيع السيارات القيادة بنفسها' },
      { id: 'no-anonymity', en: 'Every social media account should be verified with a real ID', ar: 'يجب توثيق كل حساب على السوشيال ميديا بهوية حقيقية' },
    ],
  },
  {
    key: 'sport',
    label: { en: 'sport', ar: 'الرياضة' },
    topics: [
      { id: 'messi-ronaldo', en: 'Messi is better than Ronaldo', ar: 'ميسي أفضل من رونالدو' },
      { id: 'esports-sport', en: 'Esports are real sports', ar: 'الرياضات الإلكترونية رياضة حقيقية' },
      { id: 'athletes-overpaid', en: 'Athletes are overpaid', ar: 'الرياضيون يتقاضون أكثر مما يستحقون' },
      { id: 'live-vs-tv', en: 'Watching a match in the stadium beats watching it on TV', ar: 'مشاهدة المباراة في الملعب أفضل من مشاهدتها على التلفاز' },
      { id: 'team-vs-solo', en: 'Team sports are better than individual sports', ar: 'الرياضات الجماعية أفضل من الرياضات الفردية' },
      { id: 'club-loyalty', en: 'You should stick with one team for life', ar: 'عليك أن تشجع فريقاً واحداً طوال حياتك' },
      { id: 'trophies-stats', en: 'Trophies matter more than stats', ar: 'البطولات أهم من الأرقام' },
    ],
  },
  {
    key: 'food',
    label: { en: 'food', ar: 'الطعام' },
    topics: [
      { id: 'sweet-breakfast', en: 'A sweet breakfast beats a savory one', ar: 'الفطور الحلو أفضل من الفطور المالح' },
      { id: 'shawarma-burger', en: 'Shawarma is better than burgers', ar: 'الشاورما أفضل من البرغر' },
      { id: 'sharing-plates', en: 'Sharing dishes beats ordering your own plate', ar: 'مشاركة الأطباق أفضل من أن يطلب كل شخص طبقه' },
      { id: 'tea-coffee', en: 'Tea is better than coffee', ar: 'الشاي أفضل من القهوة' },
      { id: 'snacks-meals', en: 'Snacking through the day beats three proper meals', ar: 'الأكل الخفيف على مدار اليوم أفضل من ثلاث وجبات رئيسية' },
      { id: 'fastfood-ads', en: 'Fast food ads should be banned like cigarette ads', ar: 'يجب حظر إعلانات الوجبات السريعة كما حُظرت إعلانات السجائر' },
      { id: 'home-cooking', en: 'Home cooking beats eating out', ar: 'أكل البيت أفضل من الأكل في المطاعم' },
    ],
  },
  {
    key: 'culture',
    label: { en: 'culture', ar: 'الثقافة والترفيه' },
    topics: [
      { id: 'book-movie', en: 'Books are better than their movie adaptations', ar: 'الكتب أفضل من الأفلام المقتبسة عنها' },
      { id: 'spoilers', en: 'Knowing the ending does not ruin a good story', ar: 'معرفة النهاية لا تفسد القصة الجيدة' },
      { id: 'music-old', en: "Older music is better than today's music", ar: 'الموسيقى القديمة أفضل من موسيقى اليوم' },
      { id: 'influencer-job', en: 'Being an influencer is a real job', ar: 'أن تكون مؤثراً وظيفة حقيقية' },
      { id: 'animation-live', en: 'Animated films are better than live-action films', ar: 'أفلام الأنيميشن أفضل من الأفلام بممثلين حقيقيين' },
      { id: 'subs-dubs', en: 'Subtitles are better than dubbing', ar: 'الترجمة أفضل من الدبلجة' },
      { id: 'binge-weekly', en: 'Watching a whole season at once beats one episode a week', ar: 'مشاهدة الموسم كاملاً دفعة واحدة أفضل من حلقة كل أسبوع' },
    ],
  },
  {
    key: 'money',
    label: { en: 'money', ar: 'المال' },
    topics: [
      { id: 'cash-gifts', en: 'Money is a better gift than a present', ar: 'إعطاء المال هدية أفضل من شراء هدية' },
      { id: 'money-happiness', en: 'Money can buy happiness', ar: 'المال يشتري السعادة' },
      { id: 'save-or-spend', en: 'Saving in your twenties matters more than enjoying them', ar: 'الادخار في العشرينات أهم من الاستمتاع بها' },
      { id: 'no-billionaires', en: 'You should tell your friends if you win the lottery', ar: 'إذا ربحت اليانصيب فعليك أن تخبر أصدقاءك' },
      { id: 'invite-pays', en: 'Whoever invites pays', ar: 'من يدعو يدفع' },
      { id: 'rent-vs-buy', en: 'Renting is smarter than buying a home', ar: 'الإيجار أذكى من شراء بيت' },
      { id: 'salary-public', en: "Coworkers should be able to see each other's salaries", ar: 'يجب أن يعرف زملاء العمل رواتب بعضهم' },
    ],
  },
  {
    key: 'big',
    label: { en: 'big questions', ar: 'الأسئلة الكبيرة' },
    topics: [
      { id: 'aliens', en: 'Humans should try to contact aliens', ar: 'على البشر أن يحاولوا التواصل مع الكائنات الفضائية' },
      { id: 'mars-first', en: 'Sending humans to Mars is worth the cost', ar: 'إرسال البشر إلى المريخ يستحق تكلفته' },
      { id: 'know-future', en: 'You are better off not knowing your future', ar: 'من الأفضل لك ألا تعرف مستقبلك' },
      { id: 'people-good', en: 'People are basically good', ar: 'الناس في الأصل طيبون' },
      { id: 'success-luck', en: 'Success is mostly luck', ar: 'النجاح في معظمه حظ' },
      { id: 'white-lies', en: 'White lies do more harm than good', ar: 'الكذبات البيضاء تضر أكثر مما تنفع' },
      { id: 'boring-life', en: 'A quiet, stable life beats an exciting, risky one', ar: 'الحياة الهادئة المستقرة أفضل من الحياة المثيرة المليئة بالمخاطرة' },
    ],
  },
];

export const TOPIC_BY_ID = new Map<string, TopicText>(
  TOPIC_CATEGORIES.flatMap((c) => c.topics).map((t) => [t.id, t]),
);
