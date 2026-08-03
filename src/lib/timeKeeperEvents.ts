export type TimerCompleteDetail = {
  mode: "pomodoro" | "stopwatch" | "countdown";
  phase?: "focus" | "break";
  message: string;
  setComplete?: boolean;
};

export function emitTimerComplete(_detail: TimerCompleteDetail) {}

export function listenTimerComplete(_listener: (detail: TimerCompleteDetail) => void) {
  return () => {};
}
