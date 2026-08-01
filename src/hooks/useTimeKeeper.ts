import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emitTimerComplete } from "../lib/timeKeeperEvents";
import {
  addFocusSeconds,
  clearLiveFocusSession,
  listenFocusDayRollover,
  setLiveFocusSession,
} from "../lib/focusTimeStore";

export type TimeKeeperMode = "pomodoro" | "stopwatch" | "countdown";
export type PomodoroPhase = "focus" | "break";

const DEFAULT_FOCUS_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;
const DEFAULT_COUNTDOWN_SECONDS = 10 * 60;
const DEFAULT_POMODORO_LOOPS = 3;

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

export function parseClockInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mmss = /^(\d{1,3}):([0-5]\d)$/;
  const hhmmss = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;
  if (mmss.test(trimmed)) {
    const [, mm, ss] = trimmed.match(mmss)!;
    return Number(mm) * 60 + Number(ss);
  }
  if (hhmmss.test(trimmed)) {
    const [, hh, mm, ss] = trimmed.match(hhmmss)!;
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 60;
  return null;
}

function shouldAllowEdit(mode: TimeKeeperMode) {
  return mode !== "stopwatch";
}

export function useTimeKeeper(mode: TimeKeeperMode) {
  const [isRunning, setIsRunning] = useState(false);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>("focus");
  const [focusDuration, setFocusDuration] = useState(DEFAULT_FOCUS_SECONDS);
  const [breakDuration, setBreakDuration] = useState(DEFAULT_BREAK_SECONDS);
  const [countdownDuration, setCountdownDuration] = useState(DEFAULT_COUNTDOWN_SECONDS);
  const [pomodoroLoops, setPomodoroLoopsState] = useState(DEFAULT_POMODORO_LOOPS);
  const [completedLoops, setCompletedLoops] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_FOCUS_SECONDS);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const tickRef = useRef<number | null>(null);
  const endMsRef = useRef<number | null>(null);
  const runStartedMsRef = useRef<number | null>(null);
  const runStartOffsetRef = useRef(0);
  const phaseRef = useRef<PomodoroPhase>("focus");
  const completedLoopsRef = useRef(0);
  const pomodoroLoopsRef = useRef(DEFAULT_POMODORO_LOOPS);
  const focusDurationRef = useRef(DEFAULT_FOCUS_SECONDS);
  const breakDurationRef = useRef(DEFAULT_BREAK_SECONDS);
  const modeRef = useRef(mode);
  const remainingRef = useRef(remainingSeconds);
  const elapsedRef = useRef(elapsedSeconds);

  /** Remaining at the start of the current countable play segment. */
  const segmentStartRemainingRef = useRef(0);
  /** Stopwatch seconds already committed to the focus store this run. */
  const stopwatchBankedRef = useRef(0);

  phaseRef.current = pomodoroPhase;
  completedLoopsRef.current = completedLoops;
  pomodoroLoopsRef.current = pomodoroLoops;
  focusDurationRef.current = focusDuration;
  breakDurationRef.current = breakDuration;
  modeRef.current = mode;
  remainingRef.current = remainingSeconds;
  elapsedRef.current = elapsedSeconds;

  const isFocusCountable = useCallback((m: TimeKeeperMode, phase: PomodoroPhase) => {
    if (m === "stopwatch" || m === "countdown") return true;
    return m === "pomodoro" && phase === "focus";
  }, []);

  const readSegmentElapsed = useCallback(() => {
    const m = modeRef.current;
    const phase = phaseRef.current;
    if (!isFocusCountable(m, phase)) return 0;
    if (m === "stopwatch") {
      return Math.max(0, elapsedRef.current - stopwatchBankedRef.current);
    }
    return Math.max(0, segmentStartRemainingRef.current - remainingRef.current);
  }, [isFocusCountable]);

  const publishLive = useCallback(() => {
    if (!isFocusCountable(modeRef.current, phaseRef.current)) {
      clearLiveFocusSession();
      return;
    }
    setLiveFocusSession(readSegmentElapsed());
  }, [isFocusCountable, readSegmentElapsed]);

  const bankSegmentFocus = useCallback(() => {
    const gained = readSegmentElapsed();
    if (gained > 0) addFocusSeconds(gained);
    if (modeRef.current === "stopwatch") {
      stopwatchBankedRef.current = elapsedRef.current;
    }
    segmentStartRemainingRef.current = remainingRef.current;
    clearLiveFocusSession();
  }, [readSegmentElapsed]);

  useEffect(() => {
    setIsRunning(false);
    setPomodoroPhase("focus");
    setCompletedLoops(0);
    setElapsedSeconds(0);
    runStartedMsRef.current = null;
    endMsRef.current = null;
    runStartOffsetRef.current = 0;
    stopwatchBankedRef.current = 0;
    segmentStartRemainingRef.current = 0;
    clearLiveFocusSession();
    if (mode === "pomodoro") setRemainingSeconds(focusDurationRef.current);
    else if (mode === "countdown") setRemainingSeconds(countdownDuration);
    else setRemainingSeconds(0);
  }, [mode, countdownDuration]);

  const clearTimer = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const guideline = useMemo(() => {
    if (mode === "pomodoro") {
      return pomodoroPhase === "focus"
        ? "Use Focus time to work."
        : "Break time to reflect.";
    }
    if (mode === "countdown") return "Stay present until zero.";
    return "Track elapsed time naturally.";
  }, [mode, pomodoroPhase]);

  const reset = useCallback(() => {
    bankSegmentFocus();
    clearTimer();
    setIsRunning(false);
    runStartedMsRef.current = null;
    endMsRef.current = null;
    runStartOffsetRef.current = 0;
    stopwatchBankedRef.current = 0;
    segmentStartRemainingRef.current = 0;
    setCompletedLoops(0);
    clearLiveFocusSession();

    if (mode === "pomodoro") {
      setPomodoroPhase("focus");
      setRemainingSeconds(focusDurationRef.current);
      return;
    }
    if (mode === "countdown") {
      setRemainingSeconds(countdownDuration);
      return;
    }
    setElapsedSeconds(0);
  }, [bankSegmentFocus, clearTimer, countdownDuration, mode]);

  const finishSession = useCallback(
    (message: string) => {
      clearTimer();
      setIsRunning(false);
      endMsRef.current = null;
      clearLiveFocusSession();
      emitTimerComplete({
        mode: "pomodoro",
        phase: "focus",
        message,
        setComplete: true,
      });
      setPomodoroPhase("focus");
      setCompletedLoops(0);
      setRemainingSeconds(focusDurationRef.current);
      segmentStartRemainingRef.current = focusDurationRef.current;
    },
    [clearTimer],
  );

  const finishPomodoroPhase = useCallback(
    (phase: PomodoroPhase) => {
      if (phase === "focus") {
        bankSegmentFocus();

        const nextCompleted = completedLoopsRef.current + 1;
        setCompletedLoops(nextCompleted);
        completedLoopsRef.current = nextCompleted;

        if (nextCompleted >= pomodoroLoopsRef.current) {
          finishSession("Pomodoro set complete. Nice work.");
          return;
        }

        emitTimerComplete({
          mode: "pomodoro",
          phase: "focus",
          message: `Focus complete (${nextCompleted}/${pomodoroLoopsRef.current}). Break starts now.`,
        });

        const nextSeconds = breakDurationRef.current;
        setPomodoroPhase("break");
        phaseRef.current = "break";
        setRemainingSeconds(nextSeconds);
        remainingRef.current = nextSeconds;
        segmentStartRemainingRef.current = nextSeconds;
        endMsRef.current = Date.now() + nextSeconds * 1000;
        clearLiveFocusSession();
        return;
      }

      emitTimerComplete({
        mode: "pomodoro",
        phase: "break",
        message: "Break complete. Focus starts now.",
      });
      const nextSeconds = focusDurationRef.current;
      setPomodoroPhase("focus");
      phaseRef.current = "focus";
      setRemainingSeconds(nextSeconds);
      remainingRef.current = nextSeconds;
      segmentStartRemainingRef.current = nextSeconds;
      endMsRef.current = Date.now() + nextSeconds * 1000;
      clearLiveFocusSession();
    },
    [bankSegmentFocus, finishSession],
  );

  const tick = useCallback(() => {
    const now = Date.now();
    if (mode === "stopwatch") {
      const started = runStartedMsRef.current;
      if (!started) return;
      const diff = Math.floor((now - started) / 1000);
      const next = runStartOffsetRef.current + Math.max(0, diff);
      setElapsedSeconds(next);
      elapsedRef.current = next;
      publishLive();
      return;
    }

    const endMs = endMsRef.current;
    if (!endMs) return;
    const left = Math.max(0, Math.ceil((endMs - now) / 1000));
    setRemainingSeconds(left);
    remainingRef.current = left;
    publishLive();

    if (left > 0) return;

    if (mode === "countdown") {
      bankSegmentFocus();
      clearTimer();
      setIsRunning(false);
      emitTimerComplete({
        mode: "countdown",
        message: "Countdown finished.",
      });
      return;
    }

    finishPomodoroPhase(phaseRef.current);
  }, [bankSegmentFocus, clearTimer, finishPomodoroPhase, mode, publishLive]);

  const play = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);

    if (mode === "stopwatch") {
      runStartedMsRef.current = Date.now();
      clearTimer();
      tickRef.current = window.setInterval(tick, 200);
      publishLive();
      return;
    }

    segmentStartRemainingRef.current = remainingRef.current;
    endMsRef.current = Date.now() + Math.max(0, remainingRef.current) * 1000;
    clearTimer();
    tickRef.current = window.setInterval(tick, 250);
    publishLive();
  }, [clearTimer, isRunning, mode, publishLive, tick]);

  const pause = useCallback(() => {
    if (!isRunning) return;
    clearTimer();
    setIsRunning(false);
    if (mode === "stopwatch" && runStartedMsRef.current) {
      const total = Math.floor((Date.now() - runStartedMsRef.current) / 1000);
      runStartOffsetRef.current += Math.max(0, total);
      runStartedMsRef.current = null;
      setElapsedSeconds(runStartOffsetRef.current);
      elapsedRef.current = runStartOffsetRef.current;
    }
    // Bank what has already run; discard only the unrun remainder.
    bankSegmentFocus();
  }, [bankSegmentFocus, clearTimer, isRunning, mode]);

  const setEditableSeconds = useCallback(
    (seconds: number) => {
      if (isRunning || !shouldAllowEdit(mode)) return;
      const clamped = Math.max(1, seconds);
      if (mode === "countdown") {
        setCountdownDuration(clamped);
        setRemainingSeconds(clamped);
        remainingRef.current = clamped;
        return;
      }
      if (mode === "pomodoro") {
        if (pomodoroPhase === "focus") {
          setFocusDuration(clamped);
          focusDurationRef.current = clamped;
        } else {
          setBreakDuration(clamped);
          breakDurationRef.current = clamped;
        }
        setRemainingSeconds(clamped);
        remainingRef.current = clamped;
      }
    },
    [isRunning, mode, pomodoroPhase],
  );

  const setFocusSeconds = useCallback(
    (seconds: number) => {
      if (isRunning || mode !== "pomodoro") return;
      const clamped = Math.max(1, seconds);
      setFocusDuration(clamped);
      focusDurationRef.current = clamped;
      if (pomodoroPhase === "focus") {
        setRemainingSeconds(clamped);
        remainingRef.current = clamped;
      }
    },
    [isRunning, mode, pomodoroPhase],
  );

  const setBreakSeconds = useCallback(
    (seconds: number) => {
      if (isRunning || mode !== "pomodoro") return;
      const clamped = Math.max(1, seconds);
      setBreakDuration(clamped);
      breakDurationRef.current = clamped;
      if (pomodoroPhase === "break") {
        setRemainingSeconds(clamped);
        remainingRef.current = clamped;
      }
    },
    [isRunning, mode, pomodoroPhase],
  );

  const setPomodoroLoops = useCallback(
    (loops: number) => {
      if (isRunning || mode !== "pomodoro") return;
      const clamped = Math.max(1, Math.min(12, Math.floor(loops)));
      setPomodoroLoopsState(clamped);
      pomodoroLoopsRef.current = clamped;
    },
    [isRunning, mode],
  );

  useEffect(() => clearTimer, [clearTimer]);
  useEffect(() => () => clearLiveFocusSession(), []);

  // Midnight (or wake-after-midnight): store already committed live to the old day.
  // Re-baseline so the running timer accrues to the new day without double-counting.
  useEffect(() => {
    return listenFocusDayRollover(() => {
      if (modeRef.current === "stopwatch") {
        stopwatchBankedRef.current = elapsedRef.current;
      }
      segmentStartRemainingRef.current = remainingRef.current;
      clearLiveFocusSession();
    });
  }, []);

  const displaySeconds = mode === "stopwatch" ? elapsedSeconds : remainingSeconds;
  const progressRatio =
    mode === "stopwatch"
      ? Math.min(1, (elapsedSeconds % 3600) / 3600)
      : mode === "countdown"
        ? Math.max(0, Math.min(1, remainingSeconds / Math.max(1, countdownDuration)))
        : Math.max(
            0,
            Math.min(
              1,
              remainingSeconds /
                Math.max(1, pomodoroPhase === "focus" ? focusDuration : breakDuration),
            ),
          );
  const formatted = formatClock(displaySeconds);

  return {
    isRunning,
    canEditTime: shouldAllowEdit(mode) && !isRunning,
    mode,
    pomodoroPhase,
    focusDuration,
    breakDuration,
    pomodoroLoops,
    completedLoops,
    displaySeconds,
    progressRatio,
    formatted,
    guideline,
    play,
    pause,
    reset,
    setEditableSeconds,
    setFocusSeconds,
    setBreakSeconds,
    setPomodoroLoops,
  };
}
