import { useEffect, useState, type KeyboardEvent } from "react";
import { motion, useDragControls } from "framer-motion";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  useTimeKeeper,
  parseClockInput,
  formatClock,
  type TimeKeeperMode,
} from "../hooks/useTimeKeeper";
import { listenTimerComplete } from "../lib/timeKeeperEvents";

type WatchWidgetProps = {
  visible: boolean;
  mode: TimeKeeperMode;
  onClose: () => void;
};

type EditField = "active" | "focus" | "break" | "loops" | null;

const RING_RADIUS = 66;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function blockContextMenu(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function WatchWidget({ visible, mode, onClose }: WatchWidgetProps) {
  const dragControls = useDragControls();
  const [editField, setEditField] = useState<EditField>(null);
  const [editingValue, setEditingValue] = useState("");
  /** Pomodoro: setup rows until first Play; then single countdown until Reset. */
  const [pomodoroStarted, setPomodoroStarted] = useState(false);
  const {
    canEditTime,
    isRunning,
    progressRatio,
    formatted,
    guideline,
    pomodoroPhase,
    focusDuration,
    breakDuration,
    pomodoroLoops,
    completedLoops,
    play,
    pause,
    reset,
    setEditableSeconds,
    setFocusSeconds,
    setBreakSeconds,
    setPomodoroLoops,
  } = useTimeKeeper(mode);

  const pomodoroSetup = mode === "pomodoro" && !pomodoroStarted;
  const pomodoroActive = mode === "pomodoro" && pomodoroStarted;

  useEffect(() => {
    setEditField(null);
    setEditingValue("");
    setPomodoroStarted(false);
  }, [mode, visible]);

  const dashOffset = CIRCUMFERENCE * (1 - progressRatio);

  useEffect(() => {
    return listenTimerComplete((detail) => {
      if (detail.setComplete) setPomodoroStarted(false);

      const title =
        detail.mode === "pomodoro"
          ? detail.setComplete
            ? "Pomodoro set complete"
            : `Pomodoro ${detail.phase ?? "phase"} complete`
          : "Countdown complete";
      void (async () => {
        let permission = await isPermissionGranted();
        if (!permission) {
          const requested = await requestPermission();
          permission = requested === "granted";
        }
        if (permission) await sendNotification({ title, body: detail.message });
      })();
    });
  }, []);

  const commitEdit = () => {
    if (editField === "loops") {
      const n = Number(editingValue.trim());
      if (Number.isFinite(n)) setPomodoroLoops(n);
      setEditField(null);
      return;
    }
    const parsed = parseClockInput(editingValue);
    if (parsed != null) {
      if (editField === "focus") setFocusSeconds(parsed);
      else if (editField === "break") setBreakSeconds(parsed);
      else setEditableSeconds(parsed);
    }
    setEditField(null);
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit();
    }
    if (event.key === "Escape") setEditField(null);
  };

  const startEdit = (field: Exclude<EditField, null>, value: string) => {
    if (!canEditTime) return;
    setEditField(field);
    setEditingValue(value);
  };

  const onPlayPause = () => {
    if (isRunning) {
      pause();
      return;
    }
    if (mode === "pomodoro") {
      setEditField(null);
      setPomodoroStarted(true);
    }
    play();
  };

  const onReset = () => {
    reset();
    setEditField(null);
    setPomodoroStarted(false);
  };

  if (!visible) return null;

  return (
    <motion.div
      data-interactive
      className={`watch-widget interactive${mode === "pomodoro" ? " watch-widget--pomodoro" : ""}${
        pomodoroSetup ? " watch-widget--setup" : ""
      }`}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      onContextMenu={blockContextMenu}
    >
      <button
        type="button"
        data-interactive
        aria-label="Drag watch widget"
        className="watch-widget__ring interactive"
        onPointerDown={(event) => dragControls.start(event)}
        onContextMenu={blockContextMenu}
      >
        <svg className="watch-widget__svg" viewBox="0 0 160 160" aria-hidden>
          <circle className="watch-widget__track" cx="80" cy="80" r={RING_RADIUS} />
          <circle
            className="watch-widget__progress"
            cx="80"
            cy="80"
            r={RING_RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>
      </button>

      <div className="watch-widget__center" onContextMenu={blockContextMenu}>
        {pomodoroSetup ? (
          <div className="watch-widget__meta">
            <label className="watch-widget__row">
              <span>Focus</span>
              {editField === "focus" ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={onEditKeyDown}
                  onContextMenu={blockContextMenu}
                  data-interactive
                  className="watch-widget__mini-input interactive"
                />
              ) : (
                <button
                  type="button"
                  data-interactive
                  className="watch-widget__mini interactive"
                  onClick={() => startEdit("focus", formatClock(focusDuration))}
                  onContextMenu={blockContextMenu}
                >
                  {formatClock(focusDuration)}
                </button>
              )}
            </label>

            <label className="watch-widget__row">
              <span>Break</span>
              {editField === "break" ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={onEditKeyDown}
                  onContextMenu={blockContextMenu}
                  data-interactive
                  className="watch-widget__mini-input interactive"
                />
              ) : (
                <button
                  type="button"
                  data-interactive
                  className="watch-widget__mini interactive"
                  onClick={() => startEdit("break", formatClock(breakDuration))}
                  onContextMenu={blockContextMenu}
                >
                  {formatClock(breakDuration)}
                </button>
              )}
            </label>

            <label className="watch-widget__row">
              <span>Loops</span>
              {editField === "loops" ? (
                <input
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={onEditKeyDown}
                  onContextMenu={blockContextMenu}
                  data-interactive
                  className="watch-widget__mini-input interactive"
                  inputMode="numeric"
                />
              ) : (
                <button
                  type="button"
                  data-interactive
                  className="watch-widget__mini interactive"
                  onClick={() => startEdit("loops", String(pomodoroLoops))}
                  onContextMenu={blockContextMenu}
                >
                  {pomodoroLoops}
                </button>
              )}
            </label>
          </div>
        ) : (
          <>
            {editField === "active" && !pomodoroActive ? (
              <input
                autoFocus
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={onEditKeyDown}
                onContextMenu={blockContextMenu}
                data-interactive
                className="watch-widget__input interactive"
              />
            ) : (
              <button
                type="button"
                data-interactive
                className="watch-widget__time interactive"
                onClick={() => {
                  if (pomodoroActive) return;
                  startEdit("active", formatted);
                }}
                onContextMenu={blockContextMenu}
                style={pomodoroActive ? { cursor: "default" } : undefined}
              >
                {formatted}
              </button>
            )}
            {pomodoroActive ? (
              <p className="watch-widget__hint">
                {pomodoroPhase === "focus" ? "Use Focus time to work." : "Break time to reflect."}
                {" · "}
                {completedLoops}/{pomodoroLoops}
              </p>
            ) : (
              <p className="watch-widget__hint">{guideline}</p>
            )}
          </>
        )}
      </div>

      <div className="watch-widget__actions" onContextMenu={blockContextMenu}>
        <button
          type="button"
          data-interactive
          className="watch-widget__action interactive"
          onClick={onPlayPause}
          onContextMenu={blockContextMenu}
        >
          {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          data-interactive
          className="watch-widget__action interactive"
          onClick={onReset}
          onContextMenu={blockContextMenu}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-interactive
          className="watch-widget__action interactive"
          onClick={onClose}
          onContextMenu={blockContextMenu}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
