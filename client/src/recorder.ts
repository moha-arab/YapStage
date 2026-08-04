import { socket } from './socket';

// Server-STT mode: record YOUR turns as audio (every browser can do this,
// unlike speech recognition) and upload one blob per turn. The server runs
// Whisper on it. This is what makes Safari, Firefox, and phones work.

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let recStep = -1;
let onActive: (() => void) | null = null;

export const recordingSupported = typeof MediaRecorder !== 'undefined';

/** UI hook: fires when audio data is actually being captured. */
export function setOnRecordingActive(cb: (() => void) | null): void {
  onActive = cb;
}

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

// A turn is recorded as a sequence of self-contained SEGMENTS rather than one
// blob at the end. Two reasons:
//  - the server can transcribe while you are still speaking, so your words are
//    already there when your turn ends. That deletes the race the bot used to
//    lose (it generated before your audio landed and argued at a ghost).
//  - captions can come back mid-turn, which makes an invisible pipeline
//    visible: "did the judge hear me" stops being unanswerable.
// Segments must each be a COMPLETE file — a webm/opus chunk after the first has
// no header and Whisper cannot decode it alone — so the recorder is stopped and
// restarted per segment instead of using MediaRecorder's timeslice.
const SEGMENT_MS = 5000;

let segTimer: ReturnType<typeof setInterval> | null = null;
let seq = 0;
let stopping = false;

function newRecorder(audioStream: MediaStream): MediaRecorder | null {
  try {
    const mime = pickMime();
    return new MediaRecorder(
      audioStream,
      mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 },
    );
  } catch {
    return null;
  }
}

function wire(rec: MediaRecorder): void {
  chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      onActive?.();
    }
  };
  rec.onstop = () => void flush();
  rec.onerror = () => void flush(); // salvage rather than silently drop
}

export function startTurnRecording(stream: MediaStream, stepIndex: number): void {
  stopTurnRecording();
  if (!recordingSupported) return;
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;
  // Audio only — recording the video track would make turn blobs enormous.
  const audioStream = new MediaStream(audioTracks);
  const rec = newRecorder(audioStream);
  if (!rec) return;

  recStep = stepIndex;
  seq = 0;
  stopping = false;
  recorder = rec;
  wire(rec);
  rec.start();

  // Close the current segment and immediately open the next one. The gap is a
  // few milliseconds, which costs at most a syllable at the seam.
  segTimer = setInterval(() => {
    if (!recorder || recorder.state === 'inactive' || stopping) return;
    try {
      recorder.stop(); // onstop uploads this segment
    } catch {
      return;
    }
    const next = newRecorder(audioStream);
    if (!next) return;
    recorder = next;
    wire(next);
    next.start();
  }, SEGMENT_MS);
}

async function flush(): Promise<void> {
  const mime = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
  const step = recStep;
  const parts = chunks;
  const n = seq++;
  chunks = [];
  // Once the turn is over (no live recorder), this was the final segment.
  if (stopping && !recorder) recStep = -1;
  if (step < 0 || parts.length === 0) return;
  const blob = new Blob(parts, { type: mime });
  // Under ~1KB is silence/noise; over the server cap gets dropped anyway.
  if (blob.size < 1000 || blob.size > 2_800_000) return;
  const data = await blob.arrayBuffer();
  socket.emit('audio:turn', { stepIndex: step, mime, data, seq: n });
}

export function stopTurnRecording(): void {
  stopping = true;
  if (segTimer) {
    clearInterval(segTimer);
    segTimer = null;
  }
  const rec = recorder;
  recorder = null;
  if (rec && rec.state !== 'inactive') {
    // Do NOT clear recStep here: onstop fires asynchronously and flush() needs
    // it to label the final segment. flush() resets it once it has run.
    try {
      rec.stop();
      return;
    } catch {
      // fall through to the hard reset below
    }
  }
  chunks = [];
  recStep = -1;
}
