export type TimerCompleteDetail = {
  mode: "pomodoro" | "stopwatch" | "countdown";
  phase?: "focus" | "break";
  message: string;
  /** True when an entire Pomodoro loop set has finished. */
  setComplete?: boolean;
};

const TIME_KEEPER_DONE = "timekeeper:done";
const emitter = new EventTarget();

export function emitTimerComplete(detail: TimerCompleteDetail) {
  emitter.dispatchEvent(new CustomEvent<TimerCompleteDetail>(TIME_KEEPER_DONE, { detail }));
}

export function listenTimerComplete(listener: (detail: TimerCompleteDetail) => void) {
  const wrapped = (event: Event) => {
    const customEvent = event as CustomEvent<TimerCompleteDetail>;
    listener(customEvent.detail);
  };
  emitter.addEventListener(TIME_KEEPER_DONE, wrapped);
  return () => emitter.removeEventListener(TIME_KEEPER_DONE, wrapped);
}
