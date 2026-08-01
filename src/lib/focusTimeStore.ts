import { format, startOfDay } from "date-fns";

const STORAGE_KEY = "enerva-focus-time";
const LIVE_KEY = "enerva-focus-live";
const CHANGE = "focus-time:changed";
const DAY_ROLLOVER = "focus-time:day-rollover";
const emitter = new EventTarget();

type LivePayload = { day: string; seconds: number };

/** Uncommitted focus seconds from the active timer segment. */
let liveSessionSeconds = 0;
/** Calendar day (yyyy-MM-dd) the live seconds belong to. */
let liveSessionDay = dateKey();
/** Day currently accruing committed + live focus. */
let activeFocusDay = dateKey();
let midnightTimer: number | null = null;
let watcherStarted = false;

function dateKey(date: Date = new Date()) {
  return format(startOfDay(date), "yyyy-MM-dd");
}

function readAll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  emitter.dispatchEvent(new Event(CHANGE));
}

function persistLive() {
  try {
    if (liveSessionSeconds <= 0) {
      localStorage.removeItem(LIVE_KEY);
      return;
    }
    const payload: LivePayload = {
      day: liveSessionDay,
      seconds: liveSessionSeconds,
    };
    localStorage.setItem(LIVE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function commitSecondsToDay(day: string, seconds: number) {
  const gained = Math.floor(Math.max(0, seconds));
  if (gained <= 0) return false;
  const map = readAll();
  map[day] = (map[day] ?? 0) + gained;
  writeAll(map);
  return true;
}

/** On boot: commit stale live to its day, or restore today's in-progress segment. */
function restoreOrCommitPendingLive() {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as LivePayload;
    const seconds = Math.floor(Number(parsed.seconds));
    const day = typeof parsed.day === "string" ? parsed.day : "";
    if (!day || !Number.isFinite(seconds) || seconds <= 0) {
      localStorage.removeItem(LIVE_KEY);
      return;
    }

    const today = dateKey();
    if (day < today) {
      commitSecondsToDay(day, seconds);
      localStorage.removeItem(LIVE_KEY);
      liveSessionSeconds = 0;
      liveSessionDay = today;
      return;
    }

    if (day === today) {
      liveSessionSeconds = seconds;
      liveSessionDay = day;
      return;
    }

    // Future day key — discard.
    localStorage.removeItem(LIVE_KEY);
  } catch {
    try {
      localStorage.removeItem(LIVE_KEY);
    } catch {
      // ignore
    }
  }
}

restoreOrCommitPendingLive();
activeFocusDay = dateKey();
liveSessionDay = liveSessionSeconds > 0 ? liveSessionDay : activeFocusDay;

function msUntilNextMidnight(now = new Date()) {
  const next = startOfDay(now);
  next.setDate(next.getDate() + 1);
  return Math.max(50, next.getTime() - now.getTime());
}

function scheduleMidnightRollover() {
  if (typeof window === "undefined") return;
  if (midnightTimer != null) {
    window.clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  midnightTimer = window.setTimeout(() => {
    midnightTimer = null;
    rolloverFocusDayIfNeeded();
    scheduleMidnightRollover();
  }, msUntilNextMidnight());
}

/** Committed focus seconds for a calendar day (excludes live session). */
export function getFocusSeconds(date: Date = new Date()): number {
  return readAll()[dateKey(date)] ?? 0;
}

/** Committed + in-progress focus for a day (live only for its own day). */
export function getDisplayedFocusSeconds(date: Date = new Date()): number {
  const key = dateKey(date);
  const committed = getFocusSeconds(date);
  if (key !== liveSessionDay) return committed;
  return committed + Math.max(0, liveSessionSeconds);
}

/** Day currently receiving focus accrual. */
export function getActiveFocusDayKey() {
  return activeFocusDay;
}

/** Add completed focus seconds to a day (defaults to the active focus day). */
export function addFocusSeconds(seconds: number, date?: Date) {
  const gained = Math.floor(Math.max(0, seconds));
  if (gained <= 0) return;
  const rolled = rolloverFocusDayIfNeeded();
  // Explicit date always wins. After an automatic day flip, live was already
  // committed for the ended day — skip so the same segment is not double-counted.
  if (date) {
    commitSecondsToDay(dateKey(date), gained);
    return;
  }
  if (rolled) return;
  commitSecondsToDay(activeFocusDay, gained);
}

/** Update the live in-progress focus segment (0 when idle / on break). */
export function setLiveFocusSession(seconds: number) {
  const rolled = rolloverFocusDayIfNeeded();
  // After rollover, caller may still pass pre-midnight elapsed — start the new day at 0.
  const next = rolled ? 0 : Math.floor(Math.max(0, seconds));
  const day = activeFocusDay;
  if (next === liveSessionSeconds && liveSessionDay === day) return;
  liveSessionSeconds = next;
  liveSessionDay = day;
  persistLive();
  emitter.dispatchEvent(new Event(CHANGE));
}

export function clearLiveFocusSession() {
  if (liveSessionSeconds === 0) return;
  liveSessionSeconds = 0;
  persistLive();
  emitter.dispatchEvent(new Event(CHANGE));
}

/**
 * If the calendar day advanced, commit any live seconds to the day that ended,
 * clear live, and start accruing on the new day at 0.
 * @returns true when a rollover occurred
 */
export function rolloverFocusDayIfNeeded(now: Date = new Date()): boolean {
  const today = dateKey(now);
  if (today === activeFocusDay) return false;

  const dayToCommit = liveSessionSeconds > 0 ? liveSessionDay : activeFocusDay;
  const pending = liveSessionSeconds;
  liveSessionSeconds = 0;
  persistLive();

  let wrote = false;
  if (pending > 0) {
    wrote = commitSecondsToDay(dayToCommit, pending);
  }

  activeFocusDay = today;
  liveSessionDay = today;

  if (!wrote) emitter.dispatchEvent(new Event(CHANGE));
  emitter.dispatchEvent(new Event(DAY_ROLLOVER));
  scheduleMidnightRollover();
  return true;
}

export function listenFocusTime(listener: () => void) {
  emitter.addEventListener(CHANGE, listener);
  return () => emitter.removeEventListener(CHANGE, listener);
}

/** Fires when focus accrual moves to a new calendar day. */
export function listenFocusDayRollover(listener: () => void) {
  emitter.addEventListener(DAY_ROLLOVER, listener);
  return () => emitter.removeEventListener(DAY_ROLLOVER, listener);
}

/**
 * Start midnight + visibility watchers so live focus is committed when the day ends.
 * Safe to call once from the app root.
 */
export function startFocusDayWatcher() {
  if (typeof window === "undefined") return () => {};
  rolloverFocusDayIfNeeded();
  scheduleMidnightRollover();

  if (watcherStarted) {
    return () => {};
  }
  watcherStarted = true;

  const check = () => {
    rolloverFocusDayIfNeeded();
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };

  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", check);

  return () => {
    watcherStarted = false;
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", check);
    if (midnightTimer != null) {
      window.clearTimeout(midnightTimer);
      midnightTimer = null;
    }
  };
}
