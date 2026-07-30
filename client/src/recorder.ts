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

export function startTurnRecording(stream: MediaStream, stepIndex: number): void {
  stopTurnRecording();
  if (!recordingSupported) return;
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) return;
  try {
    // Audio only — recording the video track would make turn blobs enormous.
    const audioStream = new MediaStream(audioTracks);
    const mime = pickMime();
    recorder = new MediaRecorder(
      audioStream,
      mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 },
    );
  } catch {
    recorder = null;
    return;
  }
  recStep = stepIndex;
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
      onActive?.();
    }
  };
  recorder.onstop = () => {
    void flush();
  };
  recorder.onerror = () => {
    // Recorder died (OS suspended the page, device vanished): salvage what we
    // captured instead of silently dropping the turn.
    void flush();
  };
  recorder.start(10_000); // periodic data = bounded chunks + proof of life
}

async function flush(): Promise<void> {
  const mime = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
  const step = recStep;
  const parts = chunks;
  recorder = null;
  chunks = [];
  recStep = -1;
  if (step < 0 || parts.length === 0) return;
  const blob = new Blob(parts, { type: mime });
  // Under ~1KB is silence/noise; over the server cap gets dropped anyway.
  if (blob.size < 1000 || blob.size > 2_800_000) return;
  const data = await blob.arrayBuffer();
  socket.emit('audio:turn', { stepIndex: step, mime, data });
}

export function stopTurnRecording(): void {
  if (recorder && recorder.state !== 'inactive') {
    try {
      recorder.stop(); // onstop flushes and uploads
    } catch {
      recorder = null;
      chunks = [];
    }
  } else {
    recorder = null;
    chunks = [];
  }
}
