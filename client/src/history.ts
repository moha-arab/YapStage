// Past bouts, kept on THIS device only (localStorage). The server keeps its
// privacy promise: it stores nothing, ever. Your laptop is the one gossiping.

export interface Bout {
  at: number;
  topic: string;
  me: string;
  them: string;
  won: boolean;
  myTotal: number;
  theirTotal: number;
}

const KEY = 'yapstage.bouts';
const MAX = 10;

export function loadBouts(): Bout[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Bout[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveBout(bout: Bout): void {
  try {
    const bouts = [bout, ...loadBouts()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(bouts));
  } catch {
    // storage full or blocked: history is a luxury, not a requirement
  }
}
