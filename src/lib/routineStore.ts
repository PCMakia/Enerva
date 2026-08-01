import { format, startOfDay } from "date-fns";

export type Routine = {
  id: string;
  label: string;
  /**
   * First day this routine applies (yyyy-MM-dd).
   * Days before this never show the routine in diary/calendar.
   * Omitted on legacy routines (treated as always existed).
   */
  startsOn?: string;
  /** Sun..Sat — false means that weekday is disabled for this routine. */
  activeWeekdays: boolean[];
  /** dateKey (yyyy-MM-dd) → completed */
  completions: Record<string, boolean>;
};

const STORAGE_KEY = "enerva-routines";
const CHANGE = "routines:changed";
const emitter = new EventTarget();

function dateKey(date: Date) {
  return format(startOfDay(date), "yyyy-MM-dd");
}

function defaultWeekdays() {
  return [true, true, true, true, true, true, true];
}

function readAll(): Routine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Routine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(routines: Routine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
  } catch {
    // ignore
  }
  emitter.dispatchEvent(new Event(CHANGE));
}

export function getRoutines(): Routine[] {
  return readAll();
}

export function addRoutine(label: string, fromDate: Date = new Date()): Routine {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Routine label required");
  const routine: Routine = {
    id: `routine-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    startsOn: dateKey(fromDate),
    activeWeekdays: defaultWeekdays(),
    completions: {},
  };
  writeAll([...readAll(), routine]);
  return routine;
}

export function renameRoutine(id: string, label: string) {
  const trimmed = label.trim();
  if (!trimmed) return;
  writeAll(
    readAll().map((r) => (r.id === id ? { ...r, label: trimmed } : r)),
  );
}

export function removeRoutine(id: string) {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function toggleRoutineCompletion(id: string, date: Date) {
  const key = dateKey(date);
  writeAll(
    readAll().map((r) => {
      if (r.id !== id) return r;
      if (!isRoutineActiveOn(r, date)) return r;
      const next = { ...r.completions };
      if (next[key]) delete next[key];
      else next[key] = true;
      return { ...r, completions: next };
    }),
  );
}

/** Edit mode: enable/disable this weekday for the routine. */
export function toggleRoutineWeekday(id: string, weekday: number) {
  const day = ((weekday % 7) + 7) % 7;
  writeAll(
    readAll().map((r) => {
      if (r.id !== id) return r;
      const activeWeekdays = [...r.activeWeekdays];
      activeWeekdays[day] = !activeWeekdays[day];
      return { ...r, activeWeekdays };
    }),
  );
}

export function isRoutineActiveOn(routine: Routine, date: Date) {
  const key = dateKey(date);
  if (routine.startsOn && key < routine.startsOn) return false;
  return routine.activeWeekdays[startOfDay(date).getDay()] ?? false;
}

export function isRoutineDoneOn(routine: Routine, date: Date) {
  return Boolean(routine.completions[dateKey(date)]);
}

/** Checklist projection for the diary right page. */
export function getRoutineChecklistForDate(date: Date) {
  return getRoutines()
    .filter((r) => isRoutineActiveOn(r, date))
    .map((r) => ({
      id: r.id,
      label: r.label,
      done: isRoutineDoneOn(r, date),
    }));
}

export type RoutineDayStats = {
  proposed: number;
  done: number;
  /** 0 = none; 1 = up to 50%; 2 = over 50%; 3 = all complete. */
  stars: 0 | 1 | 2 | 3;
};

/** Routine completion summary for a calendar day. */
export function getRoutineDayStats(date: Date): RoutineDayStats {
  const checklist = getRoutineChecklistForDate(date);
  const proposed = checklist.length;
  const done = checklist.filter((item) => item.done).length;
  if (proposed <= 0 || done <= 0) {
    return { proposed, done, stars: 0 };
  }
  if (done >= proposed) return { proposed, done, stars: 3 };
  if (done / proposed > 0.5) return { proposed, done, stars: 2 };
  return { proposed, done, stars: 1 };
}

export function listenRoutines(listener: () => void) {
  emitter.addEventListener(CHANGE, listener);
  return () => emitter.removeEventListener(CHANGE, listener);
}

/** Import gogh-style completed routine labels for a date. */
export function importCompletedRoutinesForDate(date: Date, labels: string[]) {
  const routines = readAll();
  const byLabel = new Map(
    routines.map((routine) => [routine.label.toLowerCase(), routine]),
  );
  const key = dateKey(date);
  let changed = false;

  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const lookup = trimmed.toLowerCase();
    let routine = byLabel.get(lookup);

    if (!routine) {
      routine = {
        id: `routine-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: trimmed,
        startsOn: key,
        activeWeekdays: defaultWeekdays(),
        completions: { [key]: true },
      };
      routines.push(routine);
      byLabel.set(lookup, routine);
      changed = true;
      continue;
    }

    if (!routine.completions[key]) {
      routine.completions = { ...routine.completions, [key]: true };
      if (routine.startsOn && key < routine.startsOn) {
        routine.startsOn = key;
      }
      changed = true;
    }
  }

  if (changed) writeAll(routines);
}
