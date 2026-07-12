// Receipts: past debates, kept on THIS device only (localStorage). The server
// keeps its privacy promise and stores nothing. Your laptop is the one gossiping.

export interface Receipt {
  at: number;
  topic: string;
  me: string;
  them: string;
  won: boolean;
  myTotal: number;
  theirTotal: number;
}

const KEY = 'yapstage.receipts';
const LEGACY_KEY = 'yapstage.bouts';
const MAX = 10;

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Receipt[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: Receipt): void {
  try {
    const receipts = [receipt, ...loadReceipts()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(receipts));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // storage full or blocked: receipts are a luxury, not a requirement
  }
}
