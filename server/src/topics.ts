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
export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    key: 'everyday',
    label: { en: 'everyday life', ar: 'الحياة اليومية' },
    topics: [
      { id: 'early-riser', en: 'Waking up early is overrated', ar: 'الاستيقاظ المبكر مبالغ فيه' },
      { id: 'phone-password', en: 'Your partner should have your phone password', ar: 'شريك حياتك يجب أن يعرف كلمة سر هاتفك' },
      { id: 'moving-back', en: 'Moving back in with your parents after college is a failure', ar: 'العودة للسكن مع الأهل بعد الجامعة فشل' },
      { id: 'call-first', en: 'Calling someone without texting first is rude', ar: 'الاتصال بأحد دون رسالة مسبقة قلة ذوق' },
      { id: 'long-distance', en: 'Long-distance relationships never work', ar: 'العلاقات عن بُعد لا تنجح أبداً' },
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
      { id: 'wfh-lazy', en: 'Working from home makes people lazy', ar: 'العمل من البيت يجعل الناس كسالى' },
      { id: 'ai-essay', en: 'Using AI to write your essay is cheating', ar: 'استخدام الذكاء الاصطناعي لكتابة بحثك غش' },
      { id: 'passion-advice', en: 'Following your passion is bad career advice', ar: 'اتباع شغفك نصيحة مهنية سيئة' },
    ],
  },
  {
    key: 'tech',
    label: { en: 'tech', ar: 'التقنية' },
    topics: [
      { id: 'social-media', en: 'Social media is destroying a generation', ar: 'السوشيال ميديا تدمّر جيلاً كاملاً' },
      { id: 'ai-good', en: 'AI will do more good than harm to humanity', ar: 'الذكاء الاصطناعي نفعه أكبر من ضرره للبشرية' },
      { id: 'ai-friend', en: 'An AI can be a real friend', ar: 'الذكاء الاصطناعي يمكن أن يكون صديقاً حقيقياً' },
      { id: 'phone-16', en: 'Nobody under 16 should have a smartphone', ar: 'لا يجب أن يملك أحد دون السادسة عشرة هاتفاً ذكياً' },
      { id: 'iphone-logo', en: 'iPhone users are paying for the logo', ar: 'مستخدمو الآيفون يدفعون ثمن الشعار' },
      { id: 'self-driving', en: 'Humans should stop driving once cars can drive themselves', ar: 'يجب أن يتوقف البشر عن القيادة حين تستطيع السيارات القيادة بنفسها' },
      { id: 'no-anonymity', en: 'Nobody should be anonymous on the internet', ar: 'لا يجب أن يكون أحد مجهول الهوية على الإنترنت' },
    ],
  },
  {
    key: 'sport',
    label: { en: 'sport', ar: 'الرياضة' },
    topics: [
      { id: 'messi-ronaldo', en: 'Messi is better than Ronaldo', ar: 'ميسي أفضل من رونالدو' },
      { id: 'esports-sport', en: 'Esports are real sports', ar: 'الرياضات الإلكترونية رياضة حقيقية' },
      { id: 'athletes-overpaid', en: 'Athletes are overpaid', ar: 'الرياضيون يتقاضون أكثر مما يستحقون' },
      { id: 'var-ruined', en: 'VAR has ruined football', ar: 'تقنية الفار أفسدت كرة القدم' },
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
      { id: 'home-cooking', en: 'Home cooking always beats restaurants', ar: 'أكل البيت يتفوق على المطاعم دائماً' },
    ],
  },
  {
    key: 'culture',
    label: { en: 'culture', ar: 'الثقافة والترفيه' },
    topics: [
      { id: 'book-movie', en: 'The book is always better than the movie', ar: 'الكتاب دائماً أفضل من الفيلم' },
      { id: 'spoilers', en: 'Spoilers ruin nothing', ar: 'حرق الأحداث لا يفسد شيئاً' },
      { id: 'music-old', en: 'Music was better twenty years ago', ar: 'الموسيقى كانت أفضل قبل عشرين عاماً' },
      { id: 'influencer-job', en: 'Being an influencer is a real job', ar: 'أن تكون مؤثراً وظيفة حقيقية' },
      { id: 'anime-cartoons', en: 'Anime is just cartoons', ar: 'الأنمي مجرد رسوم متحركة' },
      { id: 'subs-dubs', en: 'Subtitles are always better than dubbing', ar: 'الترجمة دائماً أفضل من الدبلجة' },
      { id: 'concert-phone', en: 'Filming a concert on your phone ruins it for everyone', ar: 'تصوير الحفل بهاتفك يفسده على الجميع' },
    ],
  },
  {
    key: 'money',
    label: { en: 'money', ar: 'المال' },
    topics: [
      { id: 'money-happiness', en: 'Money can buy happiness', ar: 'المال يشتري السعادة' },
      { id: 'landlords', en: 'Landlords earn their money', ar: 'أصحاب العقارات يستحقون أموالهم' },
      { id: 'crypto-scam', en: 'Crypto is a scam with extra steps', ar: 'العملات الرقمية نصبٌ بخطوات إضافية' },
      { id: 'no-billionaires', en: 'Nobody should be a billionaire', ar: 'لا يجب أن يوجد مليارديرات' },
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
      { id: 'mars-first', en: 'Humanity should go to Mars before fixing Earth', ar: 'على البشرية الذهاب إلى المريخ قبل إصلاح الأرض' },
      { id: 'know-future', en: 'Knowing your future would ruin your life', ar: 'معرفة مستقبلك ستدمر حياتك' },
      { id: 'people-good', en: 'People are basically good', ar: 'الناس في الأصل طيبون' },
      { id: 'success-luck', en: 'Success is mostly luck', ar: 'النجاح في معظمه حظ' },
      { id: 'white-lies', en: 'Lying is sometimes the right thing to do', ar: 'الكذب أحياناً هو التصرف الصحيح' },
      { id: 'boring-life', en: 'A boring life is a happy life', ar: 'الحياة المملة حياة سعيدة' },
    ],
  },
];

export const TOPIC_BY_ID = new Map<string, TopicText>(
  TOPIC_CATEGORIES.flatMap((c) => c.topics).map((t) => [t.id, t]),
);
