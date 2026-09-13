// The daily rebuttal's ears: one recording of the whole answer, uploaded when
// it ends and transcribed on the server by the same Whisper call a match turn
// goes through (server/src/stt.ts, silence filter included). Every browser can
// record, unlike the browser's own speech recognition, which only Chrome has.
// A match turn streams five second segments over the socket because the bot
// has to hear you mid-debate; a drill has nobody waiting, so one file is
// simpler and loses nothing at the seams.

export const drillRecordingSupported = typeof MediaRecorder !== 'undefined';

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  try {
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  } catch {
    return '';
  }
}

export interface DrillClip {
  data: Blob;
  mime: string;
}

export interface DrillRecording {
  /** Stop and hand back the whole answer (null if nothing was captured). */
  stop(): Promise<DrillClip | null>;
  /** Stop and throw it away (leaving the screen mid-answer). */
  cancel(): void;
}

export function startDrillRecording(stream: MediaStream): DrillRecording | null {
  if (!drillRecordingSupported) return null;
  const tracks = stream.getAudioTracks();
  if (tracks.length === 0) return null;
  const chunks: Blob[] = [];
  let rec: MediaRecorder;
  try {
    const mime = pickMime();
    // The match's bitrate: thirty seconds is ~120 KB of opus.
    rec = new MediaRecorder(
      new MediaStream(tracks),
      mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 },
    );
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.start();
  } catch {
    return null;
  }

  const clip = (): DrillClip | null => {
    if (chunks.length === 0) return null;
    const mime = rec.mimeType || chunks[0].type || 'audio/webm';
    return { data: new Blob(chunks, { type: mime }), mime };
  };

  let stopped: Promise<DrillClip | null> | null = null;
  return {
    stop() {
      if (stopped) return stopped;
      stopped = new Promise((resolve) => {
        if (rec.state === 'inactive') return resolve(clip());
        // onstop fires after the last dataavailable; the timer is for a
        // recorder that never says it stopped.
        const timer = setTimeout(() => resolve(clip()), 3000);
        rec.onstop = () => {
          clearTimeout(timer);
          resolve(clip());
        };
        try {
          rec.stop();
        } catch {
          clearTimeout(timer);
          resolve(clip());
        }
      });
      return stopped;
    },
    cancel() {
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        // already gone
      }
      chunks.length = 0;
    },
  };
}

/** The clip as bare base64, for the JSON body of POST /drill. */
export function clipToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
