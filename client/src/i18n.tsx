import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'ar';

const KEY = 'yapstage.lang';

export function getStoredLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

type Dict = Record<string, string>;

const en: Dict = {
  kicker: '1v1 video debates · ai judge · no accounts',
  homeSubtitle: 'one friend. one topic you both agree on. the judge hears everything and crowns a YapMaster.',
  yourYapName: 'your yap name',
  namePlaceholder: 'pizzamaster',
  startDebate: 'start a debate',
  joinOne: 'join one',
  codePlaceholder: 'CODE',
  errBadName: 'yap names are 3 to 16 characters. letters, numbers, underscores.',
  errNotFound: "that code doesn't exist. double-check it with your friend.",
  errFull: 'lobby is full. debates are strictly 1v1.',
  errInProgress: 'that debate already started without you. get a new code.',
  errCodeLen: 'codes are 6 characters. count again.',
  footChrome: 'works best in chrome on a laptop. the judge needs ears.',
  smallPrint: 'sanctioned by the yapstage athletic commission · the judge cannot be bribed (we tried)',
  marquee: 'tonight · yapstage · settle it on camera · loser buys shawarma · ',
  receipts: 'receipts',
  receiptsNote: 'saved on this device only. we keep nothing.',
  greenRoom: 'green room',
  ticketLabel: 'yapstage · admit two',
  ticketFine: 'section yap · row 1 · no refunds',
  copyInvite: 'copy invite link',
  copied: 'copied.',
  sendToOne: 'send it to exactly one friend. the confident one.',
  micCheck: 'mic check',
  cameraWarming: 'camera warming up',
  cameraBlocked: 'camera blocked',
  yourMic: 'your mic',
  peerMic: '{x} mic',
  micHint: 'say something. flat bar = the judge hears nothing.',
  you: 'you',
  live: 'live',
  confirmed: 'confirmed',
  connectingTheirCamera: 'connecting their camera',
  consent: 'the ai judge reads a transcript of this debate. nothing is recorded, nothing is stored. it all burns after the verdict.',
  pickTopic: 'pick a topic',
  waitSameTopic: 'waiting for {x} to pick the same topic',
  pickSide: 'pick your side',
  waitSide: 'waiting for {x} to pick a side',
  sameSide: 'you both picked {x}. one of you has to switch.',
  confirm: 'confirm',
  confirmedWaiting: 'confirmed. waiting for {x}.',
  connectingVideo: 'connecting video...',
  videoFailed: 'video link failed',
  bothMark: 'both ✓',
  netFail: 'your networks refuse to shake hands. hotspot one phone and rematch.',
  noSpeech: "this browser can't transcribe you, so the judge can't score you. use chrome on a laptop.",
  retry: 'retry',
  mediaError: 'the judge needs your camera and mic. allow them in the address bar, then retry.',
  FOR: 'FOR',
  AGAINST: 'AGAINST',
  tonightsMotion: "tonight's motion",
  youArgue: 'you argue {x}',
  noTakebacks: 'you picked this. no takebacks. {x} opens in {n}...',
  openings: 'openings',
  rebuttals: 'rebuttals',
  closings: 'closings',
  turnOf: 'turn {n} of 6',
  goSuffix: '. go.',
  hasTheMic: ' has the mic',
  micHears: 'mic live · the judge hears you',
  micLouder: 'mic live · say it louder',
  micLive: 'mic live',
  micOff: 'mic off. be wrong quietly.',
  reconnecting: 'opponent reconnecting... {n}s. the clock does not care.',
  videoDropped: 'video link dropped. trying to get it back.',
  theyFroze: 'they froze. hold on.',
  onTheMic: 'ON THE MIC',
  emptyCorner: 'empty corner',
  deliberating: 'the judge is deliberating',
  deliberatingSub: "yes, it heard what you said. yes, it's counting that.",
  judgeFailed: 'the judge dropped the gavel',
  judgeFailedSub: 'technical difficulty. your debate is safe.',
  callJudgeBack: 'call the judge back',
  scoresIn: 'the scores are in',
  outOf: 'out of {n}',
  totalsHidden: 'totals hidden. the judge has the envelope.',
  yapmasterIs: 'THE YAPMASTER IS…',
  yapmaster: 'YAPMASTER',
  youWon: "that's you. well argued.",
  youLost: 'good yap though. run it back.',
  injection: 'someone tried to sweet-talk the judge. it did not go well for them.',
  runItBack: 'run it back',
  muteStage: 'mute stage sound',
  unmuteStage: 'unmute stage sound',
  condolences: 'condolences to {x}. the transcript has already been deleted.',
  catArgument: 'made your case',
  catArgumentDesc: 'clear reasons for your side',
  catEvidence: 'backed it up',
  catEvidenceDesc: 'facts and real examples',
  catClash: 'fought back',
  catClashDesc: 'answered their actual points',
  catDelivery: 'used your time',
  catDeliveryDesc: 'substance, not rambling',
  stillLive: "you're both still live. cameras and mics stay on until you leave.",
  leaveCall: 'leave the call',
  youLeft: "you left the call. they can't see or hear you.",
  leftCall: 'left the call',
  cancelled: 'debate cancelled',
  backHome: 'back to the stage door',
  connDied: 'the connection died. the debate died with it.',
  lostLobby: 'lost that lobby. make a new one.',
};

const ar: Dict = {
  kicker: 'مناظرات فيديو ١ ضد ١ · حَكَم ذكاء اصطناعي · بدون حسابات',
  homeSubtitle: 'صديق واحد. موضوع تتفقان عليه. الحكم يسمع كل شيء ويتوّج الياب ماستر.',
  yourYapName: 'اسمك في الحلبة',
  namePlaceholder: 'malek_alkalam',
  startDebate: 'ابدأ مناظرة',
  joinOne: 'انضم',
  codePlaceholder: 'الرمز',
  errBadName: 'الاسم من ٣ إلى ١٦ حرفاً: أحرف إنجليزية وأرقام و _',
  errNotFound: 'هذا الرمز غير موجود. تأكد منه مع صديقك.',
  errFull: 'الغرفة ممتلئة. المناظرة واحد ضد واحد فقط.',
  errInProgress: 'هذه المناظرة بدأت من دونك. اطلب رمزاً جديداً.',
  errCodeLen: 'الرمز ٦ أحرف.',
  footChrome: 'يعمل أفضل على كروم على اللابتوب. الحكم يحتاج أن يسمع.',
  smallPrint: 'برعاية لجنة يابستيج الرياضية · الحكم لا يقبل الرشوة (جرّبنا)',
  marquee: 'الليلة · يابستيج · احسمها على الكاميرا · الخسران يدفع الشاورما · ',
  receipts: 'السجل',
  receiptsNote: 'محفوظ على هذا الجهاز فقط. نحن لا نحفظ شيئاً.',
  greenRoom: 'الكواليس',
  ticketLabel: 'يابستيج · دخول لشخصين',
  ticketFine: 'قسم ياب · صف ١ · لا استرجاع',
  copyInvite: 'انسخ رابط الدعوة',
  copied: 'تم النسخ.',
  sendToOne: 'أرسله لصديق واحد بالضبط. الواثق منهم.',
  micCheck: 'فحص المايك',
  cameraWarming: 'الكاميرا تشتغل',
  cameraBlocked: 'الكاميرا محجوبة',
  yourMic: 'مايكك',
  peerMic: 'مايك {x}',
  micHint: 'قل شيئاً. إذا بقي الخط ثابتاً فالحكم لا يسمعك.',
  you: 'أنت',
  live: 'مباشر',
  confirmed: 'أكّد',
  connectingTheirCamera: 'جارٍ وصل كاميرتهم',
  consent: 'الحكم الذكي يقرأ نص هذه المناظرة. لا شيء يُسجَّل ولا يُحفَظ. كل شيء يُحذف بعد الحكم.',
  pickTopic: 'اختر موضوعاً',
  waitSameTopic: 'بانتظار {x} ليختار نفس الموضوع',
  pickSide: 'اختر جهتك',
  waitSide: 'بانتظار {x} ليختار جهة',
  sameSide: 'اخترتما نفس الجهة ({x}). أحدكما يغيّر.',
  confirm: 'تأكيد',
  confirmedWaiting: 'تم التأكيد. بانتظار {x}.',
  connectingVideo: 'جارٍ وصل الفيديو...',
  videoFailed: 'فشل وصل الفيديو',
  bothMark: 'كلاكما ✓',
  netFail: 'الشبكتان ترفضان التصافح. شغّل نقطة اتصال من الجوال وأعد المحاولة.',
  noSpeech: 'هذا المتصفح لا يستطيع تفريغ كلامك، فلا يستطيع الحكم تقييمك. استخدم كروم على اللابتوب.',
  retry: 'أعد المحاولة',
  mediaError: 'الحكم يحتاج الكاميرا والمايك. اسمح بهما من شريط العنوان ثم أعد المحاولة.',
  FOR: 'مع',
  AGAINST: 'ضد',
  tonightsMotion: 'موضوع الليلة',
  youArgue: 'أنت {x}',
  noTakebacks: 'أنتما اخترتماه. لا تراجع. {x} يفتتح خلال {n}...',
  openings: 'الافتتاح',
  rebuttals: 'الرد',
  closings: 'الختام',
  turnOf: 'الدور {n} من ٦',
  goSuffix: '. تفضّل.',
  hasTheMic: ' معه المايك',
  micHears: 'المايك شغال · الحكم يسمعك',
  micLouder: 'المايك شغال · ارفع صوتك',
  micLive: 'المايك شغال',
  micOff: 'المايك مقفول. اجلس واخطئ بصمت.',
  reconnecting: 'الخصم يعيد الاتصال... {n} ثانية. الساعة لا ترحم.',
  videoDropped: 'انقطع الفيديو. نحاول استرجاعه.',
  theyFroze: 'توقفت صورتهم. لحظة.',
  onTheMic: 'على المايك',
  emptyCorner: 'زاوية فارغة',
  deliberating: 'الحكم يتداول',
  deliberatingSub: 'نعم، سمع ما قلته. ونعم، سيحاسبك عليه.',
  judgeFailed: 'الحكم أسقط المطرقة',
  judgeFailedSub: 'عطل تقني. مناظرتكما بخير.',
  callJudgeBack: 'نادِ الحكم',
  scoresIn: 'النتائج وصلت',
  outOf: 'من {n}',
  totalsHidden: 'المجموع مخفي. الظرف بيد الحكم.',
  yapmasterIs: '…الياب ماستر هو',
  yapmaster: 'ياب ماستر',
  youWon: 'هذا أنت. نقاشٌ محترم.',
  youLost: 'نقاش حلو. أعدها.',
  injection: 'أحدهم حاول التلاعب بالحكم. لم تنتهِ القصة جيداً بالنسبة له.',
  runItBack: 'أعدها',
  muteStage: 'اكتم صوت المسرح',
  unmuteStage: 'شغّل صوت المسرح',
  condolences: 'تعازينا لـ{x}. النص حُذف بالفعل.',
  catArgument: 'بنيتَ حجتك',
  catArgumentDesc: 'أسباب واضحة لموقفك',
  catEvidence: 'دعمتها بالأدلة',
  catEvidenceDesc: 'حقائق وأمثلة حقيقية',
  catClash: 'رددتَ عليهم',
  catClashDesc: 'أجبت على نقاطهم الفعلية',
  catDelivery: 'استغللتَ وقتك',
  catDeliveryDesc: 'مضمون بلا لفّ ودوران',
  stillLive: 'ما زلتما على الهواء. الكاميرا والمايك شغالان حتى تغادر.',
  leaveCall: 'غادر المكالمة',
  youLeft: 'غادرتَ المكالمة. لا يسمعك ولا يراك.',
  leftCall: 'غادر المكالمة',
  cancelled: 'أُلغيت المناظرة',
  backHome: 'عودة إلى البوابة',
  connDied: 'انقطع الاتصال وماتت المناظرة معه.',
  lostLobby: 'ضاعت الغرفة. أنشئ واحدة جديدة.',
};

const DICTS: Record<Lang, Dict> = { en, ar };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getStoredLang);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // fine
    }
  };

  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  return useContext(Ctx);
}

/** The ع / EN toggle. Lives at the top of every screen. */
export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button
      className="lang-toggle"
      onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
      aria-label={lang === 'en' ? 'العربية' : 'English'}
    >
      {lang === 'en' ? 'ع' : 'EN'}
    </button>
  );
}
