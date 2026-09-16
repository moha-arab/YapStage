/* The Privacy Policy and the Terms of Use, one component, picked by `page`.
 *
 * DRAFT FOR REVIEW. First written 2026-09-12 from a read of the code, and
 * revised twice on 2026-09-13: when match history went back to keeping the
 * transcript (judge.ts matchRowsFor, store.ts saveMatch/loadMatch, coach.ts
 * coachOnRecord), kept until the account is deleted; and when sign-in began
 * asking Google for the email (auth.ts `openid email`, kept only if
 * verified, refreshed on every sign-in, owner-only; store.ts linkAccount)
 * and Settings gained Download my data (auth.ts /auth/export, store.ts
 * exportAccountData, which leaves out reports and cheat flags). Also from
 * the code: 90 and 180 day retention for reports and cheat flags (store.ts
 * pruneRetention), relay-only ranked calls (webrtc.ts, security.ts
 * relayOnlySignal), the sharer-only share card (share.ts cardFrom), no
 * Google name or picture, and the signed yap_claim cookie. It is not legal
 * advice. The owner must have it reviewed before the public launch and
 * before the App Store submission. Nothing on the page itself says draft.
 *
 * Placeholder the owner must fill before this ships:
 *   Terms s.11      the CAD $100 liability cap is a common default, not advice.
 *
 * CONTACT_EMAIL below is the only place the contact address is written.
 * Every mailto on both pages reads it, so changing it is one line.
 *
 * This page makes promises about what the code does, and it must agree with
 * the in-app notice (i18n `consent` / `consentRanked`). When the code changes
 * what is collected, where it is sent or how long it is kept (a new provider,
 * DISPUTE_MODE switched on, a retention change, an age gate), change this
 * page in the same commit and move UPDATED.
 */
import { useEffect, type ReactNode } from 'react';
import '../legal.css';

export type LegalPage = 'privacy' | 'terms';

const UPDATED = '2026-09-13';
const UPDATED_LABEL = 'September 13, 2026';
/* The one place the contact address lives. Swap it here and every mailto on
   the privacy page and the terms follows. */
const CONTACT_EMAIL = 'zorvintt@gmail.com';

interface Part {
  id: string;
  title: string;
  body: ReactNode;
}

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

/* Every cookie and storage key the client sets, from auth.ts (the three
   cookies), player.ts, guest.ts, history.ts, i18n.tsx, App.tsx, Home.tsx,
   main.tsx and Splash.tsx. A new key means a new row here. */
const STORAGE: [keys: string[], what: string, howLong: string][] = [
  [['yap_session'], 'Keeps you signed in. Scripts on the page cannot read it.', '30 days, or until you sign out'],
  [['yap_oauth_state'], 'Stops someone from hijacking the Google sign-in step.', '10 minutes'],
  [
    ['yap_claim'],
    "Carries your device's guest ID and drill streak through Google sign-in, so your guest games move to your account. It is signed so it cannot be forged, and scripts cannot read it.",
    '10 minutes',
  ],
  [['yapstage.playerId'], "Your device's random ID, or your account's player ID once you sign in.", 'Until you sign out or clear your browser'],
  [['yapstage.guestName', 'yapstage.drill'], 'Your guest name and your guest drill streak.', 'Until you sign out or clear your browser'],
  [['yapstage.receipts'], 'Your last ten results, for the stats shown on this device.', 'Until you clear your browser'],
  [['yapstage.lang'], 'Your language choice.', 'Until you clear your browser'],
  [
    ['yap.live', 'yap.resume', 'yap.lobby', 'yap.room', 'yap.splash', 'yap.chunkReload', 'yapstage.pendingCode'],
    'Put you back in your debate or green room if the page reloads, keep your friend room and its code through a reload, recover a verdict after a refresh, reopen the lobby on the tab you were on, skip the intro you already saw, stop the page reloading in a loop while an update rolls out, and keep an invite code through sign-in.',
    'Until you close the tab',
  ],
];

/* ------------------------------------------------------------------ */
/* Privacy                                                             */
/* ------------------------------------------------------------------ */

const PRIVACY_SHORT = [
  'You can play without an account, and a room code is all a friend needs to play you. Ranked and characters need a Google sign-in. From Google we get an account ID number and your verified email address, and no other player ever sees your email.',
  'In a debate your voice goes to your opponent and to anyone watching. Each turn is recorded in short clips and sent to Cloudflare to be turned into text, and the audio is thrown away as soon as that is done.',
  'The text of the debate goes to Anthropic, whose AI (Claude) judges it and plays the bots.',
  "Your voice recording is never kept. The transcript of each debate is saved in both players' match history, so you can go back over it and get coaching, until you delete your account. Your opponent keeps their own copy, the way both players keep a chess game.",
  'Video is never recorded. Ranked and bot matches never turn on your camera.',
  'Ranked debates are public: anyone can listen live, and your yap name, rating and results can appear on public lists. Ranked calls go through a relay, so strangers never see your IP address.',
  'No ads. We do not sell your information. No third-party analytics.',
  'Signed in, you can download a copy of your data or delete your account yourself, in Settings.',
];

const PRIVACY: Part[] = [
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <>
        <h3>If you sign in with Google</h3>
        <p>
          We ask Google for two things: your Google account ID, a number that identifies your Google account and never
          changes, and your email address. We use the ID to recognize you when you sign in. We keep the email address
          only if Google has verified it. We do not ask for your Google name or your profile picture, and we never see
          your Google password.
        </p>
        <h3>Your email address</h3>
        <p>
          We use it to contact you about your account and to confirm requests about your data (section 11). It is never
          shown to other players: it is not on your profile, the leaderboard, a share card or anywhere else in the game.
          We update it each time you sign in, in case you changed it, and it is deleted when you delete your account. We
          do not sell it, and we do not send marketing email.
        </p>
        <h3>Your yap name</h3>
        <p>
          The name everyone sees. You pick it after you sign in and can change it once every 30 days. We keep the date
          you last changed it.
        </p>
        <h3>Your record</h3>
        <p>
          Your rating, wins and losses, how far you are through your placement games, how far you are up the bot
          ladder, your daily drill streak and best drill score, and the character you picked.
        </p>
        <h3>Friends</h3>
        <p>
          YapStage does not show a friends list at the moment: to play a friend, you send them a room code. If you
          added friends in an earlier version, we still keep who you added, who added you, and which requests are still
          waiting, until you delete your account, and they are in Download my data. Wherever the app shows friends, your
          friends can see your yap name, character, rating and whether you are online right now.
        </p>
        <h3>If you play as a guest</h3>
        <p>
          Your browser makes a random ID for your device and gives you a name like Guest4821. Both are kept in your
          browser. Guests appear as a plain silhouette, not a character. Games you play as a guest are saved on our
          server under that random ID (section 2). When you sign in on the same device, your browser passes the ID to our
          server in a short-lived signed cookie, never in the web address, and those games move to your account.
        </p>
        <h3>Debates</h3>
        <p>
          Your voice, the text of what you said, and the verdict. This is the heart of the app, so section 2 covers it
          on its own.
        </p>
        <h3>The daily drill</h3>
        <p>
          You answer out loud for thirty seconds. Your browser turns your answer into text (section 2), and we send the
          text to Anthropic to score it. If you are signed in, we keep your streak and best score. We do not keep your
          answer. As a guest, your streak is kept only in your browser until you sign in.
        </p>
        <h3>Reports</h3>
        <p>
          If you report someone, we keep your yap name, their yap name, the reason you picked, the room code and the
          transcript of that debate, so a person can review it. Reports are deleted after 90 days.
        </p>
        <h3>Anti-cheat numbers</h3>
        <p>
          In ranked debates we measure how each player spoke: how many words, how often they used filler words like
          "um", how often they used essay phrases like "moreover", the longest pause before they started talking, and
          how long their browser tab was hidden during their own turn. We only save these numbers when several of them
          together look like someone reading from a screen. The record holds numbers, not your words, and it is deleted
          after 180 days. It never changes a verdict by itself. A person looks at it.
        </p>
        <h3>Technical information</h3>
        <p>
          Like every website, our servers see your IP address. We use it for a few minutes at a time to slow down spam
          and abuse, and we do not store it with your account. Our hosting provider may keep standard request logs. If
          the app crashes in your browser, it sends us the error message, the page address and your browser type, and
          we keep that in our server logs to fix the bug. Our logs also record events like "a debate started" or "a turn
          was transcribed", tagged with the room code.
        </p>
      </>
    ),
  },
  {
    id: 'debates',
    title: 'Debates: your voice, the transcript and the verdict',
    body: (
      <>
        <h3>Your voice, live</h3>
        <p>
          Ranked calls always pass through a relay run by Cloudflare, so two strangers never learn each other's IP
          address. In friend rooms your microphone audio usually goes straight from your browser to your opponent's
          (a peer-to-peer connection), and through the Cloudflare relay only when a direct connection is not possible.
          Either way the call is encrypted, so the relay cannot listen to it.
        </p>
        <h3>Turning your speech into text</h3>
        <p>The judge reads words, not sound, so every turn has to become text. That happens in one of two ways.</p>
        <ul>
          <li>
            <b>On our server.</b> This is how every ranked debate works, and how the others usually work. The app records
            your turn in clips of about five seconds and uploads them to our server. We send each clip to Cloudflare
            Workers AI, which runs a speech-to-text model (Whisper) and sends back the text. The audio of each clip is
            thrown away as soon as it has been turned into text, and it is never saved. The same clips are played, a few
            seconds behind, to anyone watching the debate.
          </li>
          <li>
            <b>In your browser.</b> In friend rooms and bot matches when server transcription is not available, and
            always for the daily drill, your browser's own speech recognition does the job. In Google Chrome, that
            feature sends your audio to Google to be turned into text, under Google's privacy policy. Other browsers may
            send it to their own maker. The text then comes to us.
          </li>
        </ul>
        <h3>The transcript</h3>
        <p>
          The text of every turn from both sides, plus the bot's lines if you play a bot, is the transcript. It goes to
          Anthropic to be judged (section 3). When the verdict comes back, we save it in each player's match history
          (below), so you can read the debate again and ask the YapMaster about it later. A debate that ends without a
          verdict is not saved: its transcript is held in our server's memory only, and deleted when the room closes. If
          someone reports a debate, a separate copy of its transcript goes to our review team and is kept for 90 days
          (section 1).
        </p>
        <h3>Your match history</h3>
        <p>
          When the verdict comes back, we save a record of the debate for each human player: the motion, which side you
          were on, who won, the scores, your opponent's name, the judge's written verdict and notes for both sides, the
          one line of yours the judge quoted back to you, and the transcript of the whole debate, both sides. Your
          opponent gets their own copy of the same debate in their match history, the way both players keep a chess
          game. Only you can open your copy. If you are signed in, the record is saved to your account. As a guest, it is
          saved under your device's random ID. This applies to ranked, friend and bot matches.
        </p>
        <h3>Video</h3>
        <p>
          Your camera is only ever used in friend rooms, and only if you turn it on. Ranked matches, bot matches and the
          tutorial never turn on your camera: you appear as your character, or as a silhouette if you are a guest. Video
          goes to your opponent and nobody else.
          We never record it, it never reaches our server, and it is never sent to any AI.
        </p>
        <h3>Share cards</h3>
        <p>
          If you tap share after a verdict, we save a card with the motion, both yap names, the scores, the judge's one-line
          ruling and your own best line, and make a link to it. A card never carries your opponent's words. Anyone
          with the link can see it.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'The AI companies we send your data to',
    body: (
      <>
        <div className="lgl-callout">
          <p>
            YapStage is built on AI from other companies. The judge is the game, so there is no way to debate without
            sending the debate to them. Here is exactly what each one gets and why. None of them gets your Google
            account ID or your email address.
          </p>
        </div>
        <h3>Anthropic (Claude)</h3>
        <ul>
          <li>The transcript and the motion, so the AI judge can pick a winner, score both sides and write notes. The judge sees the two sides labeled by letter, not by your names.</li>
          <li>The transcript so far, so a bot can write its next line.</li>
          <li>The transcript, the verdict and the questions you type, when you ask the YapMaster about a debate you just finished.</li>
          <li>The saved transcript, the verdict and the questions you type, when you ask about a saved match later.</li>
          <li>Your drill answer, so it can be scored.</li>
        </ul>
        <h3>Cloudflare</h3>
        <ul>
          <li>The recorded clips of your turns, so Cloudflare Workers AI can turn them into text.</li>
          <li>The encrypted call, whenever it goes through the relay (every ranked call). The relay cannot hear or see it.</li>
        </ul>
        <h3>ElevenLabs</h3>
        <ul>
          <li>The text of each bot line, so the bot can speak out loud. A bot line can repeat something you said when the bot answers you.</li>
          <li>The judge's short spoken summary of the verdict, so it can be read aloud. It can include both yap names.</li>
          <li>Your voice is never sent to ElevenLabs.</li>
        </ul>
        <h3>Google</h3>
        <ul>
          <li>Your audio, if your browser is Chrome and it is doing the speech recognition (section 2).</li>
        </ul>
        <p>
          These companies use the data to send us back a result. Their own privacy policies explain how they handle it.
          We do not train AI models on your debates.
        </p>
      </>
    ),
  },
  {
    id: 'who-sees',
    title: 'Who else can see what',
    body: (
      <>
        <h3>Your opponent</h3>
        <p>
          Your voice, your yap name, your character (or the guest silhouette), your camera if you turn it on in a friend
          room, and everything you say. They keep the transcript of the debate in their own match history, the same
          way you keep theirs (section 2). In a friend room with a direct connection, your opponent's browser also gets
          your IP address, which can show roughly where you are. In ranked, it never does.
        </p>
        <h3>People watching</h3>
        <p>
          Ranked debates can be watched live by any signed-in player who has finished their placement games. Other rooms, including friend
          rooms, can be watched by anyone who has the room code while the host allows watchers. That is on unless the
          host turns it off. Watchers hear both players, and see your yap names, characters, the motion and the clock.
          Watchers cannot be seen or heard. You can see how many are watching.
        </p>
        <h3>Everyone</h3>
        <p>
          Public lists can show yap names with ratings, wins and losses (the leaderboard), recent ranked results (who won,
          who lost, the motion and the scores), and the ranked debates live right now (names, characters and the motion).
          Share cards can be seen by anyone with the link. Your email address never appears on any of them.
        </p>
        <h3>The companies that run things for us</h3>
        <p>
          Besides the AI companies in section 3: Railway hosts our servers and our database. Google runs sign-in. Your
          browser also loads the app's fonts from Google's servers, and in friend rooms it may use a Google server
          (called STUN) to help two browsers find each other for the call. Both of those see your IP address.
        </p>
        <h3>When the law requires it</h3>
        <p>
          We share information if the law makes us, or when it is needed to protect someone from serious harm. If
          YapStage is ever sold or merged, your information may move to the new owner, who has to keep the promises on
          this page or tell you first.
        </p>
        <p>
          <b>We never sell your information, never rent it, and never use it for advertising.</b>
        </p>
      </>
    ),
  },
  {
    id: 'storage',
    title: 'Cookies and storage on your device',
    body: (
      <>
        <p>
          We use a sign-in cookie, two short-lived cookies for the sign-in step, and a few items in your browser's
          storage. None of them are for ads or tracking, and we use no third-party analytics. The app also registers a
          small helper (a service worker) so you can add it to your home screen. It stores nothing.
        </p>
        <div className="lgl-table-wrap">
          <table className="lgl-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">What it does</th>
                <th scope="col">How long</th>
              </tr>
            </thead>
            <tbody>
              {STORAGE.map(([keys, what, howLong]) => (
                <tr key={keys.join()}>
                  <td>
                    {keys.map((k, i) => (
                      <span key={k} className="lgl-key">
                        <code>{k}</code>
                        {/* Only the cookies are spelled yap_ (auth.ts). */}
                        {i < keys.length - 1 ? ',' : k.startsWith('yap_') ? ' (cookie)' : null}
                      </span>
                    ))}
                  </td>
                  <td>{what}</td>
                  <td data-label="How long">{howLong}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'keep',
    title: 'How long we keep things',
    body: (
      <>
        <ul>
          <li>
            <b>Your voice:</b> each clip is thrown away the moment it has been turned into text. It is never saved.
          </li>
          <li>
            <b>Your chat with the YapMaster, and a debate that never reaches a verdict:</b> never saved. They are held in
            memory only and deleted when the room closes, ten minutes after the verdict at the latest. A room that goes
            quiet before a verdict is closed within 30 minutes, and everything in memory is gone whenever our server
            restarts.
          </li>
          <li>
            <b>Your account, yap name, email address, record, friends and streak:</b> until you delete your account.
            Your email address is replaced with the current one each time you sign in.
          </li>
          <li>
            <b>Your match history, including the transcript of each debate:</b> until you delete your account. Your
            opponent's copy of a debate is theirs, and stays until they delete their account.
          </li>
          <li>
            <b>Guest match history:</b> on our server under your device's random ID. If you sign in on that device, it
            moves to your account. If you sign out or clear your browser first, the ID is gone from your device and
            nobody can open those games any more, but they stay in our database. We do not currently delete them on a
            fixed schedule.
          </li>
          <li>
            <b>Reports</b>, including the reported debate's transcript: deleted automatically after 90 days.
          </li>
          <li>
            <b>Anti-cheat records:</b> deleted automatically after 180 days.
          </li>
          <li>
            <b>Share cards:</b> kept so the links keep working. We do not currently delete them on a fixed schedule.
          </li>
          <li>
            <b>Server logs:</b> kept for our hosting provider's standard log period.
          </li>
        </ul>
        <p>
          You can ask us to delete anything on this list sooner (section 11).
        </p>
      </>
    ),
  },
  {
    id: 'delete',
    title: 'Deleting your account',
    body: (
      <>
        <p>
          Go to Settings, then Delete account, and type your yap name to confirm. It happens straight away, signs you out
          on every device, and cannot be undone.
        </p>
        <h3>What gets deleted</h3>
        <ul>
          <li>Your account: your Google account ID, email address, yap name, character and drill streak.</li>
          <li>Your rating, record, bot ladder progress and your place on the leaderboard.</li>
          <li>Your match history, including the transcripts of your debates.</li>
          <li>Your friends and friend requests.</li>
        </ul>
        <h3>What changes elsewhere</h3>
        <ul>
          <li>Share cards: your yap name becomes "deleted" and your quoted line is removed.</li>
          <li>Ranked opponents' match history shows you as "deleted".</li>
          <li>Anti-cheat records about you lose their link to you: the name becomes "deleted" and your ID is removed.</li>
        </ul>
        <h3>What stays</h3>
        <ul>
          <li>
            Your opponents' own copies of debates you played, in their match history. Like a chess game, both players
            keep the record, so their copy still has the transcript, including what you said. In friend room records
            your yap name stays as it was, and the judge's written verdict may still use it.
          </li>
          <li>Reports you made or that were made about you, until they are deleted after 90 days. They store yap names, not account IDs, so we cannot find them from your account.</li>
          <li>If you played as a guest on another device before you signed in, a leftover guest record there (a random ID, the guest name and bot ladder progress).</li>
          <li>Server logs, until they expire.</li>
        </ul>
        <p>
          If you want any of these removed sooner, email <Mail /> and tell us your old yap name. We will do what we
          reasonably can.
        </p>
        <h3>If you never made an account</h3>
        <p>
          Guest data is tied to a random ID on the device, not to a person, and there is no email address to match it
          to. Signing out or clearing your browser wipes what is kept on your device. To ask us to delete guest games
          from our server, email us. We may not be able to tell which games are yours, but we will try.
        </p>
      </>
    ),
  },
  {
    id: 'why',
    title: 'Why we use your information',
    body: (
      <>
        <ul>
          <li>
            <b>To run the game:</b> find you an opponent, carry the call, turn speech into text, judge the debate, run the
            bots, and keep your record and rating. If you are in the UK or EU, the legal reason is that we need it to
            give you the service you asked for.
          </li>
          <li>
            <b>To keep it fair and safe:</b> spam limits, anti-cheat, reports and bans. The legal reason is our legitimate
            interest, and yours, in a fair game without abuse.
          </li>
          <li>
            <b>To reach you:</b> your email address, to contact you about your account and to confirm requests about your
            data. Never for marketing. The legal reason is that we need it to run your account and to answer those
            requests.
          </li>
          <li>
            <b>To fix bugs and keep it running:</b> error reports and logs. The legal reason is our legitimate interest in
            a working app.
          </li>
          <li>
            <b>Your microphone and camera</b> are only used after you allow them in your browser. You can take that
            permission back in your browser settings at any time.
          </li>
        </ul>
        <h3>Decisions made by AI</h3>
        <p>
          The AI judge decides who wins each debate and, in ranked, how much your rating moves. No person checks each
          verdict. You can ask the YapMaster to explain a verdict, and if you think something went clearly wrong, email
          us and a person will look.
        </p>
      </>
    ),
  },
  {
    id: 'where',
    title: 'Where your information goes',
    body: (
      <p>
        We are based in Canada, but the companies we use run servers in other countries, including the United States.
        Your information may be stored or processed there, and the laws there may let local authorities access it. When
        we send it abroad, we rely on each company's contract terms to protect it.
      </p>
    ),
  },
  {
    id: 'safe',
    title: 'Keeping it safe',
    body: (
      <p>
        Connections to YapStage are encrypted, and so are calls. The sign-in cookies cannot be read by scripts on the
        page. Reports and anti-cheat records sit behind a private key that only we hold. Keeping less is part of keeping
        it safe: we never store your voice, and from Google we keep only your account ID and your verified email
        address. Your match history, transcripts included, can only be opened by you, and Download my data only ever
        gives you your own account. No system is perfect. If a breach
        puts you at real risk, we will tell you and the Privacy Commissioner of Canada, as the law requires.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>Wherever you live, you can ask us to:</p>
        <ul>
          <li>tell you what information we have about you and give you a copy,</li>
          <li>correct anything that is wrong,</li>
          <li>delete it,</li>
          <li>stop using it for a particular purpose.</li>
        </ul>
        <h3>Doing it yourself</h3>
        <p>
          If you are signed in, Settings has the tools. You can change your yap name there. Download my data gives you a
          copy of what we keep under your account as a file: your account details, your ratings and placement, your
          match history with the full transcripts, and your friends list. Delete account deletes your account (section
          7).
        </p>
        <h3>Asking us</h3>
        <p>
          For anything else, email <Mail /> from the email address on your account, so we can match your request to it.
          We answer within 30 days. The download does not include reports or anti-cheat (fair-play) records. Email us for
          those.
        </p>
        <h3>If you play as a guest</h3>
        <p>
          Guest data is tied to a random ID on your device, not to you as a person, so we cannot look it up by name or
          email. Email us anyway, tell us what you can (your guest name and roughly when you played), and we will do what
          we reasonably can.
        </p>
        <p>
          If you are not happy with our answer, you can complain to the Office of the Privacy Commissioner of Canada
          (priv.gc.ca). In the UK you can complain to the Information Commissioner's Office (ico.org.uk), and in the EU to
          the data protection authority in your country. Some US states give their residents similar rights. We honor
          these requests from anyone.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        YapStage is not for children under 13, and we do not knowingly collect information from them. If you are under
        16 and live in the EU (or under the age your country sets), you need a parent's or guardian's permission to use
        YapStage. If you think a child under 13 is using YapStage, email <Mail /> and we will delete their account and
        data.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        When we change this policy, we update the date at the top. If a change is big, like sending your information to
        a new company or keeping it longer, we will tell you in the app before it takes effect.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        YapStage is run by Mohammad Arab, an independent developer in Ontario, Canada. He is the person responsible for
        privacy at YapStage. Email <Mail /> with any question about this policy or your information.
      </p>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Terms                                                               */
/* ------------------------------------------------------------------ */

const TERMS_SHORT = [
  'You must be at least 13. Be decent to the person across from you.',
  'Argue with your own brain. Reading off a chatbot gets you banned.',
  'The AI judge can be wrong, and its call stands.',
  'Ratings can change, and can be reset.',
  'YapStage is free and comes as is.',
  'The laws of Ontario, Canada apply.',
];

const TERMS: Part[] = [
  {
    id: 'who',
    title: 'Who can use YapStage',
    body: (
      <p>
        You must be at least 13. If you are under the age of majority where you live, a parent or guardian must agree to
        these terms for you. In the EU, if you are under 16 (or the age your country sets), you need a parent's or
        guardian's permission. You may not use YapStage if we have banned you.
      </p>
    ),
  },
  {
    id: 'account',
    title: 'Your account and your yap name',
    body: (
      <>
        <ul>
          <li>Ranked and characters need a Google sign-in. Playing a friend with a room code does not. Keep your Google account secure. You are responsible for what happens on your YapStage account.</li>
          <li>One person per account. Do not share, sell or trade accounts, and do not make extra accounts to dodge a ban or move ratings.</li>
          <li>
            Your yap name must not pretend to be someone else, and must not contain slurs, hate, sexual content or
            anyone's personal information. You can change it once every 30 days. We can change or take back a name that
            breaks these rules.
          </li>
          <li>You can play without an account. A guest's progress is tied to a random ID in the browser. If you clear it before signing in, that progress is lost.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'rules',
    title: 'House rules',
    body: (
      <>
        <p>
          YapStage only works if people argue in good faith. <b>Reading off a chatbot gets you banned.</b> When you use
          YapStage, you agree not to:
        </p>
        <ul>
          <li>read out answers written by a chatbot or any other AI tool during a debate, or have someone feed you lines,</li>
          <li>harass, threaten or bully anyone, or attack people for who they are,</li>
          <li>say or show anything sexual, and never anything sexual involving a minor,</li>
          <li>show nudity or violence on camera,</li>
          <li>share anyone's private information, or pressure people for theirs,</li>
          <li>record, stream or repost other players' voices or video without their permission,</li>
          <li>cheat the ladder: throw matches, farm ratings with a friend, or play from more than one account,</li>
          <li>hide instructions in what you say to trick the AI judge, or otherwise try to game the scoring,</li>
          <li>break, overload, scrape or copy the service, get around limits or bans, or use scripts or bots to play,</li>
          <li>use YapStage to break the law or anyone's rights.</li>
        </ul>
        <p>Topics can get heated. Argue with the idea, not the person.</p>
      </>
    ),
  },
  {
    id: 'enforce',
    title: 'Reports, anti-cheat and bans',
    body: (
      <>
        <ul>
          <li>You can report an opponent after a debate. The report sends us the transcript of that debate, which we keep for 90 days so a person can review it.</li>
          <li>
            In ranked, we also measure signs that someone is reading from a screen (see the{' '}
            <a href="/privacy#collect">Privacy Policy</a>). Those numbers never decide anything on their own. A person
            reviews them.
          </li>
          <li>
            If you break these terms, we may warn you, remove your results, reset or remove your rating, change your yap
            name, suspend you or ban you. When we need to protect other players, we can do this without warning first.
          </li>
          <li>If you think we got it wrong, email <Mail /> and we will take another look.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'judge',
    title: 'The AI judge',
    body: (
      <>
        <ul>
          <li>Verdicts, scores, notes and rating changes are made automatically by an AI model (Claude, made by Anthropic). No person checks each one.</li>
          <li>
            The judge can be wrong. Speech-to-text can drop or mishear your words, and the judge can miss a good point
            or score unfairly. It does not look anything up, so it does not check whether facts are true.
          </li>
          <li>
            Once a verdict is given, it stands. You can ask the YapMaster about it, and it may admit it underrated
            something, but the result does not change. If something went clearly wrong, for example it heard nothing
            you said, email us.
          </li>
          <li>A verdict is part of a game. It is not advice, and it is not a ruling on who is right in real life.</li>
          <li>Bots are AI characters. What they say is written by AI, can be wrong, strange or offensive, and is not our opinion.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ratings',
    title: 'Ratings and progress',
    body: (
      <ul>
        <li>Ratings, the bot ladder, streaks and leaderboards are for fun. They have no money value and you do not own them.</li>
        <li>We may change how ratings work, correct ratings after a bug or cheating, or reset ratings for everyone. We have done this before and may do it again.</li>
        <li>A debate can be cut off when our server restarts or something breaks. We cannot always get it back.</li>
      </ul>
    ),
  },
  {
    id: 'content',
    title: 'What you say',
    body: (
      <>
        <p>
          You own what you say on YapStage. You give us permission to use it to run the service: to carry it to your
          opponent and anyone watching, turn it into text, send it to our AI providers, judge it, keep the transcript in
          both players' match history, show the one line of yours the judge quotes on a share card if you share the
          verdict, and keep a reported debate for review. This permission lasts as long as we keep that content under the{' '}
          <a href="/privacy">Privacy Policy</a>.
        </p>
        <p>
          You are responsible for what you say. Ranked debates are public, and anyone can listen live.
        </p>
      </>
    ),
  },
  {
    id: 'ours',
    title: 'Our stuff',
    body: (
      <p>
        YapStage, its name, logo, characters, art, code and writing belong to us or to the people who licensed them to
        us. You can use the app the way it is meant to be used. You cannot copy, sell or redistribute any of it. Share
        cards are made to be shared, so go ahead with those.
      </p>
    ),
  },
  {
    id: 'service',
    title: 'Changes to the service',
    body: (
      <p>
        YapStage is new and changes often. We may add, change or remove features, or stop running the service. If we shut
        it down, we will try to give notice in the app first.
      </p>
    ),
  },
  {
    id: 'as-is',
    title: 'No promises',
    body: (
      <p>
        YapStage is free and provided "as is" and "as available". As far as the law allows, we do not promise that it
        will always work, that it will be free of errors, that verdicts will be accurate, or that your data will never be
        lost. Some places do not allow these limits, so some of them may not apply to you.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limits on our responsibility',
    body: (
      <p>
        As far as the law allows, we are not responsible for indirect losses, lost data, or anything other players say or
        do. If we are responsible for something, our total responsibility is limited to 100 Canadian dollars. Nothing in
        these terms limits anything the law does not let us limit, or takes away rights you have as a consumer where you
        live.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Ending things',
    body: (
      <ul>
        <li>You can stop using YapStage at any time, and delete your account in Settings.</li>
        <li>We can suspend or end your access if you break these terms, if the law requires it, or if we stop running YapStage.</li>
        <li>The parts of these terms that are meant to last, like What you say, No promises and Limits on our responsibility, keep applying after that.</li>
      </ul>
    ),
  },
  {
    id: 'law',
    title: 'Law and disputes',
    body: (
      <p>
        These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there.
        Any dispute goes to the courts of Ontario, unless the law where you live gives you the right to use your local
        courts. If you are a consumer in the UK or EU, you keep the protection of your own country's consumer law. Before
        going to court, please email us. Most things can be fixed with a message.
      </p>
    ),
  },
  {
    id: 'app-stores',
    title: 'App stores',
    body: (
      <p>
        If you got YapStage from Apple's App Store, these terms are between you and us, not Apple. Apple is not
        responsible for YapStage or for supporting it, and is not responsible for any claim about it. Apple and its
        subsidiaries can still enforce these terms against you as a third-party beneficiary. If an app store's own rules
        conflict with these terms, the store's rules win for that store.
      </p>
    ),
  },
  {
    id: 'updates',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms. We will change the date at the top, and if a change is important we will tell you in
        the app before it takes effect. If you keep using YapStage after that, you accept the new terms.
      </p>
    ),
  },
  {
    id: 'other',
    title: 'The rest',
    body: (
      <p>
        If part of these terms cannot be enforced, the rest still applies. If we do not enforce a rule right away, we can
        still enforce it later. These terms and the <a href="/privacy">Privacy Policy</a> are the whole agreement between
        you and us about YapStage. Questions go to <Mail />.
      </p>
    ),
  },
];

/* ------------------------------------------------------------------ */

const COPY: Record<LegalPage, { title: string; intro: ReactNode; short: string[]; parts: Part[] }> = {
  privacy: {
    title: 'Privacy Policy',
    intro: (
      <>
        <p>
          YapStage is a game where two people argue out loud and an AI judge picks the winner. This page explains what we
          collect when you play, why, who else sees it, how long we keep it, and what you can do about it.
        </p>
        <p>
          YapStage is run by Mohammad Arab, an independent developer in Ontario, Canada. When this page says "we" or
          "us", it means him. Canada's privacy law (PIPEDA) applies to us. If you live in the UK or the EU, your own law
          gives you rights too, and section 11 explains them.
        </p>
      </>
    ),
    short: PRIVACY_SHORT,
    parts: PRIVACY,
  },
  terms: {
    title: 'Terms of Use',
    intro: (
      <>
        <p>
          These are the rules for using YapStage, the website at www.yapstage.com and our app. By using YapStage you agree
          to them. If you do not agree, please do not use it.
        </p>
        <p>
          YapStage is run by Mohammad Arab, an independent developer in Ontario, Canada ("we" or "us"). Our{' '}
          <a href="/privacy">Privacy Policy</a> explains what we do with your information, and it is part of these terms.
        </p>
      </>
    ),
    short: TERMS_SHORT,
    parts: TERMS,
  },
};

/* The contents list. Drawn twice, beside the page on a wide screen and inside
   it (after the summary) on a narrow one; CSS shows exactly one, so it is
   always visible and never behind a tap. */
function Toc({ parts, className }: { parts: Part[]; className: string }) {
  return (
    <nav className={`lgl-toc ${className}`} aria-label="On this page">
      <p className="lgl-toc-h">On this page</p>
      <ol>
        {parts.map((p, i) => (
          <li key={p.id}>
            <a href={`#${p.id}`}>
              <span className="lgl-n">{String(i + 1).padStart(2, '0')}</span>
              {p.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
      <path d="M8 14 h20 v20 q0 12 -14 16 v-8 q7 -3 7 -8 h-13 z" fill="var(--amber)" />
      <path d="M56 50 h-20 v-20 q0 -12 14 -16 v8 q-7 3 -7 8 h13 z" fill="var(--turq)" />
    </svg>
  );
}

export default function Legal({ page }: { page: LegalPage }) {
  const c = COPY[page];

  useEffect(() => {
    document.title = `${c.title} · YapStage`;
    // The page renders after load, so the browser's own jump to #section has
    // nothing to land on yet. Do it once the sections exist.
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [c.title]);

  return (
    <div className="lgl" lang="en" dir="ltr">
      <header className="lgl-top">
        <a className="lgl-brand" href="/">
          <Mark />
          <span>YAPSTAGE</span>
        </a>
        <nav className="lgl-switch" aria-label="Legal pages">
          <a href="/privacy" aria-current={page === 'privacy' ? 'page' : undefined}>
            Privacy
          </a>
          <a href="/terms" aria-current={page === 'terms' ? 'page' : undefined}>
            Terms
          </a>
        </nav>
      </header>

      <div className="lgl-body">
        <aside className="lgl-side">
          <Toc parts={c.parts} className="lgl-toc-side" />
        </aside>

        <main className="lgl-main">
          <h1 className="lgl-title">{c.title}</h1>
          <p className="lgl-date">
            Last updated <time dateTime={UPDATED}>{UPDATED_LABEL}</time>
          </p>
          <div className="lgl-intro">{c.intro}</div>

          <section className="lgl-short" aria-labelledby="lgl-short-h">
            <h2 id="lgl-short-h">The short version</h2>
            <ul>
              {c.short.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>

          <Toc parts={c.parts} className="lgl-toc-inline" />

          {c.parts.map((p, i) => (
            <section key={p.id} id={p.id} className="lgl-sec" aria-labelledby={`${p.id}-h`}>
              <h2 id={`${p.id}-h`}>
                <span className="lgl-n">{String(i + 1).padStart(2, '0')}</span>
                {p.title}
              </h2>
              {p.body}
            </section>
          ))}

          <footer className="lgl-foot">
            <p>
              Questions? Email <Mail />.
            </p>
            <p className="lgl-foot-links">
              <a href={page === 'privacy' ? '/terms' : '/privacy'}>
                {page === 'privacy' ? 'Terms of Use' : 'Privacy Policy'}
              </a>
              <a href="/">Back to YapStage</a>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
