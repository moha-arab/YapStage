import type { TopicCategory, TopicText } from './protocol.js';

// The deck, bilingual. Topics match by ID so an English-mode player and an
// Arabic-mode player land on the same debate.
//
// Rebuilt 2026-09-12 (his call: "not too much, too little, or bad topics; not
// too controversial"). Eight tabs of seven, all claims in sentence case, each
// arguable either way by a nineteen-year-old with no research. Out on
// purpose: live wars, named politicians, religion, guns, race, sexuality, and
// anything where one side is a moral floor. Ranked and random modes roll a
// category first, so with the old deck three tabs in five were geopolitics
// and most stranger matches dealt someone a side they could not honestly
// argue. Named athletes are fine; named politicians are not. The first tab is
// the default in the pickers (they index by position), so it is the lightest.
//
// Balance pass 2026-09-12: the coin deals sides, so a lopsided motion lets the
// coin pick the winner. Every motion must give BOTH sides five minutes of
// respectable argument: no absolutes ("always", "never", "nothing") that one
// counterexample sinks, no loaded words ("destroying", "scam"), no side that
// has to call people failures. Ids never change (history, smoke tests), only text.
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
      { id: 'ten-late', en: 'Ten minutes late is still on time', ar: 'التأخر عشر دقائق يُحسب في الموعد' },
      { id: 'friends-ex', en: 'You can stay friends with an ex', ar: 'يمكنك البقاء صديقاً لشريكك السابق' },
    ],
  },
  {
    key: 'school',
    label: { en: 'school and work', ar: 'الدراسة والعمل' },
    topics: [
      { id: 'college-worth', en: 'College is no longer worth it', ar: 'الجامعة لم تعد تستحق' },
      { id: 'fail-graduate', en: 'You should be able to fail a class and still graduate', ar: 'يجب أن يكون بإمكانك الرسوب في مادة والتخرج رغم ذلك' },
      { id: 'phones-class', en: 'Phones should be banned in classrooms', ar: 'يجب منع الهواتف في الصفوف الدراسية' },
      { id: 'four-day-week', en: 'The work week should be four days', ar: 'أسبوع العمل يجب أن يكون أربعة أيام' },
      { id: 'wfh-lazy', en: 'Working from home is better than working in an office', ar: 'العمل من البيت أفضل من العمل في المكتب' },
      { id: 'ai-essay', en: 'Students should be allowed to use AI on homework', ar: 'يجب السماح للطلاب باستخدام الذكاء الاصطناعي في الواجبات' },
      { id: 'passion-advice', en: 'Following your passion is bad career advice', ar: 'اتباع شغفك نصيحة مهنية سيئة' },
    ],
  },
  {
    key: 'tech',
    label: { en: 'tech', ar: 'التقنية' },
    topics: [
      { id: 'social-media', en: "Social media has made young people's lives worse", ar: 'السوشيال ميديا جعلت حياة الشباب أسوأ' },
      { id: 'ai-good', en: 'AI will do more good than harm to humanity', ar: 'الذكاء الاصطناعي نفعه أكبر من ضرره للبشرية' },
      { id: 'ai-friend', en: 'An AI can be a real friend', ar: 'الذكاء الاصطناعي يمكن أن يكون صديقاً حقيقياً' },
      { id: 'phone-16', en: 'Nobody under 16 should have a smartphone', ar: 'لا يجب أن يملك أحد دون السادسة عشرة هاتفاً ذكياً' },
      { id: 'iphone-logo', en: 'iPhone users are paying for the logo', ar: 'مستخدمو الآيفون يدفعون ثمن الشعار' },
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
      { id: 'var-ruined', en: 'VAR has made football worse', ar: 'تقنية الفار جعلت كرة القدم أسوأ' },
      { id: 'chess-sport', en: 'Chess is a sport', ar: 'الشطرنج رياضة' },
      { id: 'club-loyalty', en: 'Changing the team you support is betrayal', ar: 'تغيير الفريق الذي تشجعه خيانة' },
      { id: 'trophies-stats', en: 'Trophies matter more than stats', ar: 'البطولات أهم من الأرقام' },
    ],
  },
  {
    key: 'food',
    label: { en: 'food', ar: 'الطعام' },
    topics: [
      { id: 'cereal-soup', en: 'Cereal is a soup', ar: 'الكورن فليكس نوع من الحساء' },
      { id: 'shawarma-burger', en: 'Shawarma is better than burgers', ar: 'الشاورما أفضل من البرغر' },
      { id: 'ketchup-fridge', en: 'Ketchup belongs in the fridge', ar: 'الكاتشب مكانه في الثلاجة' },
      { id: 'tea-coffee', en: 'Tea is better than coffee', ar: 'الشاي أفضل من القهوة' },
      { id: 'cook-by-18', en: 'Everyone should know how to cook by 18', ar: 'على الجميع أن يجيدوا الطبخ قبل الثامنة عشرة' },
      { id: 'fastfood-ads', en: 'Fast food ads should be banned like cigarette ads', ar: 'يجب حظر إعلانات الوجبات السريعة كما حُظرت إعلانات السجائر' },
      { id: 'home-cooking', en: 'Home cooking beats eating out', ar: 'أكل البيت أفضل من الأكل في المطاعم' },
    ],
  },
  {
    key: 'culture',
    label: { en: 'culture', ar: 'الثقافة والترفيه' },
    topics: [
      { id: 'book-movie', en: 'Books are better than their movie adaptations', ar: 'الكتب أفضل من الأفلام المقتبسة عنها' },
      { id: 'spoilers', en: 'Spoilers are not a big deal', ar: 'حرق الأحداث ليس مشكلة كبيرة' },
      { id: 'music-old', en: 'Music was better twenty years ago', ar: 'الموسيقى كانت أفضل قبل عشرين عاماً' },
      { id: 'influencer-job', en: 'Being an influencer is a real job', ar: 'أن تكون مؤثراً وظيفة حقيقية' },
      { id: 'anime-cartoons', en: 'Anime is just cartoons', ar: 'الأنمي مجرد رسوم متحركة' },
      { id: 'subs-dubs', en: 'Subtitles are better than dubbing', ar: 'الترجمة أفضل من الدبلجة' },
      { id: 'concert-phone', en: 'Phones should be banned at concerts', ar: 'يجب منع الهواتف في الحفلات الموسيقية' },
    ],
  },
  {
    key: 'money',
    label: { en: 'money', ar: 'المال' },
    topics: [
      { id: 'money-happiness', en: 'Money can buy happiness', ar: 'المال يشتري السعادة' },
      { id: 'landlords', en: 'Landlords earn their money', ar: 'أصحاب العقارات يستحقون أموالهم' },
      { id: 'crypto-scam', en: 'Crypto is more hype than substance', ar: 'العملات الرقمية ضجة أكثر منها قيمة حقيقية' },
      { id: 'no-billionaires', en: 'Winning the lottery ruins more lives than it fixes', ar: 'الفوز باليانصيب يفسد حياةً أكثر مما يُصلح' },
      { id: 'invite-pays', en: 'Whoever invites pays', ar: 'من يدعو يدفع' },
      { id: 'rent-vs-buy', en: 'Renting for life is smarter than buying a house', ar: 'الإيجار مدى الحياة أذكى من شراء بيت' },
      { id: 'salary-public', en: "Everyone's salary should be public", ar: 'رواتب الجميع يجب أن تكون معلنة' },
    ],
  },
  {
    key: 'big',
    label: { en: 'big questions', ar: 'الأسئلة الكبيرة' },
    topics: [
      { id: 'aliens', en: 'We are not alone in the universe', ar: 'لسنا وحدنا في الكون' },
      { id: 'mars-first', en: 'Sending humans to Mars is worth the cost', ar: 'إرسال البشر إلى المريخ يستحق تكلفته' },
      { id: 'know-future', en: 'Knowing your future would ruin your life', ar: 'معرفة مستقبلك ستدمر حياتك' },
      { id: 'people-good', en: 'People are basically good', ar: 'الناس في الأصل طيبون' },
      { id: 'success-luck', en: 'Success is mostly luck', ar: 'النجاح في معظمه حظ' },
      { id: 'white-lies', en: 'White lies do more harm than good', ar: 'الكذبات البيضاء تضر أكثر مما تنفع' },
      { id: 'boring-life', en: 'A boring life is a happy life', ar: 'الحياة المملة حياة سعيدة' },
    ],
  },
];

export const TOPIC_BY_ID = new Map<string, TopicText>(
  TOPIC_CATEGORIES.flatMap((c) => c.topics).map((t) => [t.id, t]),
);
