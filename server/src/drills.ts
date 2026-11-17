// The daily rebuttal challenge: YapStage's answer to the chess puzzle.
//
// What makes a chess puzzle work is not that it is short. It is that there is
// ONE idea to find, you get thirty seconds, everyone in the world gets the same
// one today, and the feedback is instant and specific. So a debate puzzle is
// not "have a debate, but small": it is one skill, isolated, with a right
// answer shape you can be graded against.
//
// One drill type, the rebuttal, on a weekly ramp: easiest on Sunday, hardest
// on Saturday. Weighing and spotting the flaw, once drill types of their own,
// survive in here as what the harder tiers demand of a rebuttal:
// Thursday's argument cannot be answered without conceding and weighing, and
// Saturday's cannot be answered without naming what its frame leaves out.
// The score standard does not change with the tier; the material does.

export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Drill {
  id: string;
  tier: Tier;
  /** The argument the player has to answer. Shown on the card, read aloud in the head. */
  material: string;
  /** For the grader only: what a strong answer engages. Never shown to the
      player before they answer. */
  note: string;
}

/** The one instruction, the same every day. */
export const PROMPT = 'Answer this argument.';

/** Thirty seconds. Long enough for one real idea, short enough that padding
    is instantly visible to both the judge and the player. */
export const DRILL_SECONDS = 30;

/** What each day of the week asks for. `means` goes into the judge prompt as
    the tier line; `name` is for the explainer copy, never on the card (the
    names hint at what to look for, which would give away tiers 4, 6 and 7). */
export const TIER_META: Record<Tier, { name: string; means: string; grade: string; caps: string[] }> = {
  1: {
    name: 'The open goal',
    means:
      'One plain claim with an obvious hole. There is exactly one thing wrong and it is visible on first hearing: a false premise, a word doing too much work, a reason that is not a reason.',
    grade:
      'Did they point at the hole and say in one breath why it sinks the claim? Anything beyond that is style. A full score needs the hole named and one sentence of why.',
    caps: [],
  },
  2: {
    name: 'A reason attached',
    means:
      'A claim with one plausible reason behind it. The reason is not silly, so the answer has to engage the reason, not just disagree with the claim.',
    grade:
      'Did they engage the reason (show it does not deliver what it promises, or that it is true and leaves something out)? An answer that only attacks the conclusion caps at 60.',
    caps: ['attacks only the conclusion, never the reason: at most 60'],
  },
  3: {
    name: 'Evidence to unpack',
    means:
      'A claim backed by an anecdote or a statistic. The evidence is real but does not carry the conclusion: sample, direction, survivorship, what the number measures, what counts as success.',
    grade:
      "Did they unpack the evidence (one specific reason it does not prove the claim: who was counted, which way the cause runs, what the number leaves out) and then say why the conclusion no longer follows? 'One story is not data' with nothing more is half an answer.",
    caps: [],
  },
  4: {
    name: 'Two reasons, one beam',
    means:
      'Two linked reasons for one conclusion. One of them is load-bearing: the conclusion rests on it. The other sounds heavier but either supports a different conclusion or falls if the first does.',
    grade:
      'Did they hit the load-bearing reason named in the note? Hitting only the minor reason caps at 65 no matter how well. Best answers say why the other reason does not save the conclusion.',
    caps: ['hits only the minor reason: at most 65'],
  },
  5: {
    name: 'Concede and weigh',
    means:
      'A reasonable claim with a real harm or benefit behind it. Nothing in it is false. The best answer grants what is true and then shows why the claim still loses: more people, more likely, sooner, harder to undo, or who actually bears the cost.',
    grade:
      'Did they concede what is true, then compare on a named metric (scale, likelihood, reversibility, who pays)? Refusing to concede something the note calls true caps at 75. Conceding without a comparison is not a rebuttal and caps at 55.',
    caps: ['refuses to concede what the note says is true: at most 75', 'concedes but never compares: at most 55'],
  },
  6: {
    name: 'The reply is already taken',
    means:
      'A strong argument that pre-empts the obvious objection. The first reply that comes to mind has been answered inside the material.',
    grade:
      'Did they get past the pre-empt? Giving the pre-empted reply as if it had not been answered caps at 55. Showing the pre-empt fails, or landing a reply it does not cover, is the full answer. Doing both with a reason is 90 plus.',
    caps: ['gives the pre-empted reply as if it had not been answered: at most 55'],
  },
  7: {
    name: 'Wrong frame, right facts',
    means:
      'A well-built argument whose facts are fine. The flaw is in the framing or the metric: the number measures the wrong thing, the rule proves too much, or the argument decided what counts before it started.',
    grade:
      'Did they challenge the frame or the metric rather than the facts? Arguing inside the frame (the numbers must be wrong, the study is flawed) caps at 60. A full answer names what the metric misses or what the rule would also prove, and connects that to the conclusion.',
    caps: ['argues inside the frame (disputes the facts or the study): at most 60'],
  },
};

// Seven per tier, and the ORDER within a tier matters: drillOfDay walks each
// tier's pool by week number, so position i in every tier lands in the same
// Sunday-to-Saturday week. The pools are arranged so that no week serves the
// same subject twice (tipping on Wednesday and tipping again on Friday would
// read as a bug). Add new drills to the END of a tier, and keep the counts
// equal, or the columns drift.
export const DRILLS: Drill[] = [
  // ---- tier 1, Sunday: one claim, one obvious hole ----
  {
    id: 't1-libraries',
    tier: 1,
    material: 'Nobody reads books anymore, so we should stop paying for libraries.',
    note: "The hole is the premise. Plenty of people read, and libraries are not only books: internet, a quiet place to study, kids' programs, help with a job application. A strong answer names one thing a library does that the claim forgot and says the money buys that.",
  },
  {
    id: 't1-coffee',
    tier: 1,
    material: 'Coffee is bad for you. It is addictive, and anything addictive is bad for you.',
    note: 'Addictive and harmful are two different things. A strong answer pulls them apart, gives one example of something habit-forming that is harmless or good, and says the claim needs to show harm, not habit.',
  },
  {
    id: 't1-homework',
    tier: 1,
    material: 'Schools should scrap homework because students hate it.',
    note: 'Disliking a thing says nothing about whether it works. A strong answer names something useful that people dislike (practice, early mornings, the dentist) and says the argument needs a reason about learning, not about mood.',
  },
  {
    id: 't1-translate',
    tier: 1,
    material: 'There is no point learning a second language now. Your phone translates anything in a second.',
    note: 'The phone covers menus and signs, not the reasons people learn languages: talking to a grandmother, working in another country, thinking in a new way. A strong answer picks one thing a translation app cannot do and shows the claim only covers the easy case.',
  },
  {
    id: 't1-freebus',
    tier: 1,
    material: 'Make the buses free and traffic will disappear, because nobody drives if the bus costs nothing.',
    note: 'The word is disappear. People drive for time, comfort, kids, groceries, and the places the bus does not go. A strong answer says free fixes cost, cost is not the main reason people drive, so the conclusion is far bigger than the premise.',
  },
  {
    id: 't1-tattoo',
    tier: 1,
    material: 'Nobody should get a tattoo at nineteen. You will hate it at fifty, so why bother.',
    note: 'The argument assumes the regret. A strong answer says plenty of people do not regret theirs, and even if some do, thirty years of liking it counts for something too. The claim treats a guess about future you as a fact.',
  },
  {
    id: 't1-cursive',
    tier: 1,
    material: 'Schools should keep teaching cursive. We have taught it for two hundred years and that is reason enough.',
    note: 'Tradition is not a reason on its own, and the claim admits it has no other. A strong answer says lots of things were taught for centuries and dropped, and asks what cursive does for a student today. That question is the whole rebuttal.',
  },

  // ---- tier 2, Monday: a claim with one plausible reason ----
  {
    id: 't2-uniforms',
    tier: 2,
    material: 'Schools should require uniforms. When everyone wears the same thing, nobody gets picked on for their clothes.',
    note: 'The reason is plausible, so the answer has to engage it. Bullying is about status, and it moves to shoes, phones, bags, or how the same uniform fits. A strong answer says the mechanism does not deliver what it promises, and might add the cost to poorer families.',
  },
  {
    id: 't2-openplan',
    tier: 2,
    material: 'Open plan offices beat cubicles. People talk more when there is no wall between them.',
    note: 'Talking more is the reason, so ask what it buys. A strong answer says the work that matters often needs quiet, and the extra talk is interruptions, not collaboration. Bonus for noticing that people in open offices put on headphones, which is a wall.',
  },
  {
    id: 't2-streaming',
    tier: 2,
    material: 'Streaming has ruined music. When a song pays a fraction of a cent, artists write for playlists instead of for people.',
    note: 'The mechanism is plausible, so engage it. A strong answer says artists have always written for whatever paid (radio, the single, the album), and streaming let more people be heard than any system before it. Or: playlists are made of songs people chose, so writing for playlists is writing for people.',
  },
  {
    id: 't2-cashless',
    tier: 2,
    material: 'Restaurants should go cashless. The till moves faster when nobody is counting change.',
    note: 'The reason is true and small. A strong answer names who a cashless rule shuts out: people without a bank account, teenagers, anyone whose card just got declined, tourists. Speed at the till is a convenience for the business paid for by the customer who cannot get in.',
  },
  {
    id: 't2-grades',
    tier: 2,
    material: 'Universities should stop giving letter grades. Students learn better when they are not chasing an A.',
    note: "The reason does real work here. A strong answer either questions it (many people work harder with a target, and 'learn better' has to be shown) or accepts it and says grades do a second job the argument ignores: telling an employer or a grad school something in one line.",
  },
  {
    id: 't2-carfree',
    tier: 2,
    material: 'Ban cars from the city centre. Streets without cars are quieter, safer and nicer to walk on.',
    note: 'Nicer for the person walking. A strong answer asks who else uses the street: deliveries, tradespeople, anyone who cannot walk far, the shops that need all of them. The reason is true and one-sided, and the answer should say which side it leaves out.',
  },
  {
    id: 't2-earlystart',
    tier: 2,
    material: 'School should start at seven thirty. Teenagers need to learn to get up early for the rest of their lives.',
    note: 'The reason sounds like common sense and is the weak point. A strong answer says the rest of their lives mostly does not start at seven thirty, and a habit you cannot keep yet is not built by forcing it. Sleep science is a bonus, not required.',
  },

  // ---- tier 3, Tuesday: evidence that does not carry the conclusion ----
  {
    id: 't3-phonemood',
    tier: 3,
    material: 'Teenagers who use their phones over five hours a day report twice as much low mood. The phone is making them miserable.',
    note: "Direction and measurement. A strong answer says a miserable teenager may reach for the phone more, not the other way round, and 'report' means a survey question. Either point is enough if the answer says why it stops the conclusion.",
  },
  {
    id: 't3-dropouts',
    tier: 3,
    material: 'University is a scam. Look at how many of the richest people in tech dropped out.',
    note: 'Survivorship. A strong answer says you only hear about the dropouts who made it, and asks how many dropped out and did not. The famous cases were already at elite schools with an idea and money behind them. One sentence on the base rate wins this.',
  },
  {
    id: 't3-fourday',
    tier: 3,
    material: 'The four day week works. A company that tried it saw productivity go up eleven percent.',
    note: 'One company that volunteered, measured itself, and told the press. A strong answer names any of: self-selection, the novelty effect, what productivity meant, whether the eleven percent held. Then: one good result is a reason to test it, not a reason to say it works.',
  },
  {
    id: 't3-rideshare',
    tier: 3,
    material: 'Ride share apps are safer than taxis. Nobody I know has ever had a bad experience in one.',
    note: 'A friend group is not a sample. A strong answer says the people you know are a handful of similar people in one city, and safety is a rate across millions of rides. Then: the claim compares two things and offers evidence about one.',
  },
  {
    id: 't3-sugartax',
    tier: 3,
    material: 'The sugar tax failed. People bought just as much soda the year after it came in.',
    note: 'What counts as failing. A strong answer asks what would have happened without the tax, whether drinks got reformulated with less sugar, and whether one year is the horizon. The stat can be true and the word failed still does not follow.',
  },
  {
    id: 't3-degree',
    tier: 3,
    material: 'Everyone should get a degree. Graduates earn about forty percent more over a lifetime than people who never went.',
    note: 'The number is an average of people who chose to go and got in. A strong answer says the comparison is not the same person with and without a degree, the gap differs hugely by subject, and the question is about the extra person the claim wants to push in, not the average. Debt is a fair addition.',
  },
  {
    id: 't3-bikelane',
    tier: 3,
    material: 'Bike lanes are a waste of road. I drive past the one on King Street every morning and it is always empty.',
    note: 'One road, one hour, seen from a car. A strong answer unpacks the sample (mornings, one street, an observer moving at forty) and says a bike lane is used differently from a car lane: a cyclist is in and out of your view in a second. Then the point: an empty-looking lane is evidence about one glance, not about bike lanes.',
  },

  // ---- tier 4, Wednesday: two reasons, one load-bearing ----
  {
    id: 't4-esports',
    tier: 4,
    material: 'Esports belong in the Olympics. Top players train as many hours as any athlete, and the audience is bigger than most Olympic sports.',
    note: 'Load-bearing: training makes it a sport. Audience size is not how the Olympics choose anything, so the second reason is decoration. A strong answer hits the first: hours of training also describe chess, piano and poker, so the question is what a sport is, and the argument never says.',
  },
  {
    id: 't4-tipping',
    tier: 4,
    material: "Tipping should be abolished. It lets restaurants pay under a living wage, and it makes a server's income depend on a customer's mood.",
    note: 'Load-bearing: the wage. If the base wage were fixed at a living level, a tip on top is a bonus and the mood point mostly dissolves. A strong answer hits the wage reason: abolishing tips does not raise the wage, a wage law does, and prices rise either way. Spending the thirty seconds on mood alone misses the beam.',
  },
  {
    id: 't4-parking',
    tier: 4,
    material: 'Downtown parking should cost a lot more. Cheap parking fills the streets with drivers circling for a spot, and the land under a parked car is worth more as almost anything else.',
    note: 'Load-bearing: the circling. That is the reason that actually supports a higher price. The land-value point argues for less parking, not pricier parking, so it is a different conclusion wearing the same coat. A strong answer hits the circling claim (does pricing stop it or push it to the next block) or points out the second reason does not support this conclusion. Both is best.',
  },
  {
    id: 't4-primaryhw',
    tier: 4,
    material: 'Primary school kids should get no homework. The research shows it does nothing for their grades, and every hour of it comes out of play and sleep, which do help them.',
    note: "Load-bearing: does nothing. If homework does something beyond grades (a habit of finishing work, a parent seeing what the kid is learning), the trade-off point has to be argued instead of assumed. A strong answer hits the 'nothing' claim and says what it leaves out. Only defending play and sleep concedes the beam.",
  },
  {
    id: 't4-phonesclass',
    tier: 4,
    material: 'Ban phones in class. They distract the student holding one, and worse, they distract everyone sitting nearby, who never chose to be distracted.',
    note: "Load-bearing: the second reason. If the harm were only to the phone's owner you could call it their choice, so the case for a ban leans on the cost to others. A strong answer hits that: the same is true of a tapping pen or a whisper, and the fix for a cost to neighbours is enforcement and norms, not confiscation. Answering only the self-distraction point caps the score.",
  },
  {
    id: 't4-fastfashion',
    tier: 4,
    material: 'Fast fashion should be taxed. The clothes are made by people paid almost nothing, and they end up in landfill within a year.',
    note: 'Load-bearing for a tax: the landfill. A tax on buyers cuts buying, which does nothing for wages abroad and may cut the jobs. So the wage reason, though it sounds heavier, does not connect to the tax. A strong answer says which reason a tax actually addresses and hits that one: does taxing make people keep clothes longer, or just buy the same thing somewhere cheaper.',
  },
  {
    id: 't4-openbook',
    tier: 4,
    material: 'Exams should be open book. Memorising is pointless when you can look anything up, and the real world is open book anyway.',
    note: 'Load-bearing: memorising is pointless. If knowing things in your head has value (you cannot look up what you do not know exists, and fluent thinking needs it), the real-world point does not rescue the conclusion. A strong answer hits that. Arguing only that the real world has closed-book moments is the weaker target.',
  },

  // ---- tier 5, Thursday: nothing false, concede and weigh ----
  {
    id: 't5-coursework',
    tier: 5,
    material: 'Scrap final exams and grade coursework instead. One bad morning should not decide a whole year of work.',
    note: 'Concede that a single sitting is a harsh instrument, then weigh what coursework loses: it can be helped, bought or copied, it favours the student with a quiet house and a tutor, and one morning of fairness is easier to guarantee than a year of it. A strong answer takes the fairness point seriously and shows it cuts both ways.',
  },
  {
    id: 't5-zoos',
    tier: 5,
    material: 'Zoos should be phased out. Whatever they do for conservation, the animal in front of you spends its whole life in an enclosure for your afternoon out.',
    note: "The best answer grants that the animal's life is the animal's life, then weighs: the species that still exist because of breeding programs, the funding that only comes from visitors, the kid who cares about a rhino because they saw one. A strong answer concedes and compares on numbers or on what can be undone. Pretending the enclosure is fine loses.",
  },
  {
    id: 't5-idsocial',
    tier: 5,
    material: 'Social media should require ID to sign up. The harassment comes from accounts with no name attached.',
    note: 'Concede that anonymity shelters some harassers. Then weigh: it also shelters the teenager asking a question they cannot ask at home, and a database of everyone\'s ID is a target. A strong answer grants the harm and compares who is protected against who is exposed.',
  },
  {
    id: 't5-junkads',
    tier: 5,
    material: 'Ban junk food ads before nine at night. A child cannot be expected to resist something adults spent millions designing to be irresistible.',
    note: 'Grant the design point, it is true. Then weigh: how much of what kids eat is decided by an ad versus what is in the house, whether a nine pm line stops anything in a world of phones, and what else the same principle would ban. A strong answer concedes and asks whether the rule does the job it is defended by.',
  },
  {
    id: 't5-rentcap',
    tier: 5,
    material: 'Cap rent increases. A landlord raising the rent thirty percent in one year can push a family out of the street they grew up in.',
    note: 'Grant that the family is real and the harm is real. Then weigh: caps tend to cut how much housing gets built and how well it gets kept up, and the next family looking for a place pays for that. A strong answer concedes the person in front of you and argues for the people not yet in the room.',
  },
  {
    id: 't5-cameras',
    tier: 5,
    material: 'Put cameras on every corner downtown. Crimes get solved faster, and people behave better when they know they are seen.',
    note: 'Both halves are partly true and the best answer says so, then weighs. The trade is a gain in solving some crimes against a change in how everyone behaves in public all the time. A strong answer concedes the solving point, then argues on scale (everyone, always) or reversibility (you do not get the old street back). Denying that cameras help solve anything scores low.',
  },
  {
    id: 't5-gapyear',
    tier: 5,
    material: 'Everyone should take a gap year before university. You choose a degree far better at nineteen with a year of real life behind you.',
    note: "Concede that some people choose better after a year. Then weigh: a year costs money and momentum, plenty of people spend it in the same bedroom, and 'everyone' includes the student who already knows. A strong answer grants the benefit for some and hits the word everyone.",
  },

  // ---- tier 6, Friday: the obvious reply is already answered ----
  {
    id: 't6-freetransit',
    tier: 6,
    material: 'Public transit should be free. Before you say someone has to pay: we already pay for roads that nobody swipes a card to use, and on most bus routes the fare box costs more to run than it collects.',
    note: 'The obvious reply (it is not free, taxpayers pay) is already answered. Restating it caps the score. A strong answer goes past it: what fills buses is frequency and reliability, not price, so the fare money is better spent on service; or the roads analogy cuts the other way, since roads are paid through fuel tax and tolls; or free transit floods the routes that already work.',
  },
  {
    id: 't6-phonesoffice',
    tier: 6,
    material: 'Ban phones in schools. Before anyone says students need them for emergencies: the office has a phone and had one for fifty years. The ban is about six hours of attention, not two minutes of emergency.',
    note: 'The emergency reply is closed. A strong answer finds the reply that is still open: a ban does not teach anyone to manage the thing they will hold for the rest of their life; or enforcement eats the attention it was meant to save; or the research on bans and results is more mixed than the argument lets on.',
  },
  {
    id: 't6-tuition',
    tier: 6,
    material: 'University should be free. The usual reply is that graduates earn more so they should pay, and they will, in tax, for forty years. Charging up front only decides who gets to start.',
    note: "The 'graduates should pay' reply is answered. A strong answer moves on: free places in practice mean capped places or thinner teaching, so the student the argument cares about still loses; or the people who never go end up paying for those who do; or the up-front problem is solved by loans that only bite once you earn, which the argument skips.",
  },
  {
    id: 't6-carfreepermits',
    tier: 6,
    material: 'Ban cars from the centre. Yes, some people cannot walk or cycle, so give them permits. Everyone else is making a choice, and a choice that costs other people their air and their safety is one a city is allowed to price.',
    note: 'The accessibility reply is pre-empted with permits. A strong answer either shows permits fail (who decides, and the exception becomes the rule) or takes the argument at its word: it says the choice should be priced, and pricing is a charge, not a ban. The argument proves a congestion charge and concludes a ban.',
  },
  {
    id: 't6-aihomework',
    tier: 6,
    material: 'Let students use AI on homework. Yes, cheating, I know. People said the same about calculators, and the answer was to change what we asked, not to ban the tool.',
    note: 'The calculator analogy is the pre-empt and the weak joint. A strong answer breaks the analogy: a calculator does the arithmetic and leaves the thinking, while writing is the thinking. Or accepts the analogy and turns it: we changed what we asked first, then allowed the tool, and the argument wants the order reversed.',
  },
  {
    id: 't6-vote16',
    tier: 6,
    material: 'Let sixteen year olds vote. And no, contracts and drinking ages are not the point. We let them work and pay tax, and the one thing voting needs is a stake in the outcome, which they have more of than anyone.',
    note: "The maturity reply is pre-empted. A strong answer either shows the pre-empt fails (stake cannot be the test, a ten year old has a stake) or finds what it does not cover: voting is a judgement about other people's interests too, and the line has to sit somewhere. Saying 'they are not mature enough' with nothing more scores as if the pre-empt was not there.",
  },
  {
    id: 't6-tippingearn',
    tier: 6,
    material: 'Abolish tipping, and I know the reply: good servers earn more with tips. Some do. Mostly the young ones at busy places on a Friday, and a pay system that rewards that is not one anyone would design on purpose.',
    note: "The 'servers earn more' reply is met. A strong answer finds what is not: abolishing tips without a wage law is a pay cut for those same servers, and customers in tipping countries fight flat prices; or notes the argument shows tipping is unfair between servers, which argues for a different tip system, not for none.",
  },

  // ---- tier 7, Saturday: the facts are fine, the frame is not ----
  {
    id: 't7-perhour',
    tier: 7,
    material: 'The four day week is a productivity win. Output per hour rose fifteen percent at every company that tried it, and if we care about productivity, and every economist says we do, this is the easiest win there is.',
    note: 'Output per hour is the frame. Cut the slowest hours of the week and output per hour rises while total output can still fall. A strong answer says the metric was chosen to make the result, and asks about output per week. Bonus for the self-selected companies. Disputing the fifteen percent is the wrong target.',
  },
  {
    id: 't7-recycling',
    tier: 7,
    material: 'Recycling is a waste of effort. Household recycling is a tiny slice of emissions, so all that sorting achieves nothing that shows up on any chart.',
    note: "The metric is emissions, and recycling was never mainly about emissions: it is about landfill, materials and water. A strong answer says the argument picked the chart it could win on. Bonus for the 'tiny slice' framing: every individual thing is a tiny slice, which is an argument against doing anything at all.",
  },
  {
    id: 't7-testscores',
    tier: 7,
    material: 'Phone bans work. Every district that banned them saw test scores rise the next year. We judge schools by test scores, so on the measure that actually counts, this is settled.',
    note: "The trap is the metric. A strong answer does not fight the numbers, it questions what they measure: test scores are one thing a school is for, and 'the measure that counts' is what the argument decided, not what is true. Add that the districts that banned phones chose to, and the next year is one year. Arguing inside the frame (the scores must be wrong) caps the score.",
  },
  {
    id: 't7-salary',
    tier: 7,
    material: 'Pick the degree with the highest starting salary. It is the one number that is measured, published and comparable across every course, so it is the only honest basis for a decision that costs four years.',
    note: 'The frame says measurable equals meaningful. A strong answer says starting salary is the one number available, not the one that matters: it says nothing about ten years in, about whether you finish, about whether you want the job. A decision made on the easiest number is not honest, it is convenient.',
  },
  {
    id: 't7-permile',
    tier: 7,
    material: 'Self-driving cars are already safer. Per mile, they crash less than people do. Every year we wait is a year of crashes we chose.',
    note: "The metric is per mile, and miles are not equal. A strong answer asks which miles: sunny highways in a mapped city against a human's whole life of rain, night and gravel. And which crashes: a scraped bumper and a fatal one are the same count. Accepting the per-mile number and arguing about ethics misses the flaw.",
  },
  {
    id: 't7-libraryvisits',
    tier: 7,
    material: 'Close the library branches nobody uses. Visits are down forty percent in ten years, and a city should fund what people show up for.',
    note: "Two frames to break. Visits as the metric ignores the ebooks, the wifi and the kid who is there every day; and 'fund what people show up for' would close every fire station. A strong answer says the number measures the wrong thing and the rule behind it proves too much.",
  },
  {
    id: 't7-happiness',
    tier: 7,
    material: 'Money stops making you happier past a certain income. The studies are clear. So working extra hours for a raise beyond that is irrational.',
    note: 'The metric is a survey mood score, and the frame is that mood is what money is for. A strong answer says people work for security, for their kids, for options, and none of those show up in how you felt yesterday. The studies can be right and the word irrational still does not follow.',
  },
];

function utcMidnight(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Sunday is 1, Saturday is 7. `day` is the server's YYYY-MM-DD in UTC, the
    same string the streak is keyed on, so the drill and the streak always
    agree on what day it is (a player in Toronto sees the week roll over at
    8pm, which is why the card says "Day 2 of 7" and never "Monday").
    getUTCDay, not getDay: the server's own timezone must never leak into
    which tier a date gets. */
export function tierOfDay(day: string): Tier {
  return (new Date(utcMidnight(day)).getUTCDay() + 1) as Tier;
}

/** Everyone gets the same drill on the same day, with no storage. Each tier
    walks its own pool in order by week number, so a tier never repeats a
    drill until the whole pool has been used. A week counter beats the old
    date hash here: with seven drills per tier a hash would repeat within a
    month. Weeks are counted from a Sunday (the epoch was a Thursday, hence
    the +4) so that all seven days of one calendar week share an index and the
    no-repeat arrangement in DRILLS holds. */
export function drillOfDay(day: string): Drill {
  const tier = tierOfDay(day);
  const pool = DRILLS.filter((d) => d.tier === tier);
  const week = Math.floor((utcMidnight(day) / 86_400_000 + 4) / 7);
  return pool[week % pool.length]!;
}

export function drillById(id: unknown): Drill | undefined {
  return typeof id === 'string' ? DRILLS.find((d) => d.id === id) : undefined;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
