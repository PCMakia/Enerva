import { format, startOfDay } from "date-fns";

export type DiaryEntry = {
  title: string;
  html: string;
  savedAt: number;
};

const STORAGE_KEY = "enerva-diary-entries";
const CHANGE = "diary:entries-changed";
const emitter = new EventTarget();

function dateKey(date: Date) {
  return format(startOfDay(date), "yyyy-MM-dd");
}

function readAll(): Record<string, DiaryEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DiaryEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, DiaryEntry>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
  emitter.dispatchEvent(new Event(CHANGE));
}

export function getDiaryEntry(date: Date): DiaryEntry | null {
  return readAll()[dateKey(date)] ?? null;
}

export function hasSavedDiaryEntry(date: Date): boolean {
  return getDiaryEntry(date) != null;
}

/** Set of yyyy-MM-dd keys that have a saved diary entry. */
export function getSavedDiaryDateKeys(): Set<string> {
  return new Set(Object.keys(readAll()));
}

export function getAllDiaryEntries(): Record<string, DiaryEntry> {
  return readAll();
}

/** Merge or replace imported entries. Returns count of imported rows. */
export function importDiaryEntries(
  entries: Record<string, DiaryEntry>,
  merge = true,
): number {
  const current = merge ? readAll() : {};
  let count = 0;
  for (const [key, entry] of Object.entries(entries)) {
    current[key] = entry;
    count += 1;
  }
  writeAll(current);
  return count;
}

export function saveDiaryEntry(date: Date, title: string, html: string) {
  const entries = readAll();
  entries[dateKey(date)] = {
    title: title.trim() || "Untitled",
    html,
    savedAt: Date.now(),
  };
  writeAll(entries);
}

export function listenDiaryEntries(listener: () => void) {
  emitter.addEventListener(CHANGE, listener);
  return () => emitter.removeEventListener(CHANGE, listener);
}
