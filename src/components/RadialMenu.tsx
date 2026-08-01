import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CheckSquare, Clock3, RotateCcw, Timer } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";

export type RadialMenuMode = "main" | "timers";
export type RadialMenuSelection = "pomodoro" | "stopwatch" | "countdown";

type RadialMenuProps = {
  open: boolean;
  x: number;
  y: number;
  mode: RadialMenuMode;
  onClose: () => void;
  onWheelModeChange: (mode: RadialMenuMode) => void;
  onSelectTimer: (mode: RadialMenuSelection) => void;
  onOpenTasks: () => void;
  onOpenRoutines: () => void;
};

type WheelItem = {
  key: string;
  label: string;
  onClick: () => void;
  icon: ReactNode;
};

const RADIUS = 92;

function polarOffset(index: number, total: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: Math.cos(angle) * RADIUS,
    y: Math.sin(angle) * RADIUS,
  };
}

export function RadialMenu({
  open,
  x,
  y,
  mode,
  onClose,
  onWheelModeChange,
  onSelectTimer,
  onOpenTasks,
  onOpenRoutines,
}: RadialMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const items = useMemo<WheelItem[]>(() => {
    if (mode === "timers") {
      return [
        {
          key: "pomodoro",
          label: "Pomodoro",
          onClick: () => onSelectTimer("pomodoro"),
          icon: <Clock3 className="h-4 w-4" />,
        },
        {
          key: "stopwatch",
          label: "Stopwatch",
          onClick: () => onSelectTimer("stopwatch"),
          icon: <Timer className="h-4 w-4" />,
        },
        {
          key: "countdown",
          label: "Countdown",
          onClick: () => onSelectTimer("countdown"),
          icon: <RotateCcw className="h-4 w-4" />,
        },
      ];
    }
    return [
      {
        key: "watch",
        label: "Watch",
        onClick: () => onWheelModeChange("timers"),
        icon: <Clock3 className="h-4 w-4" />,
      },
      {
        key: "tasks",
        label: "Tasks",
        onClick: onOpenTasks,
        icon: <CheckSquare className="h-4 w-4" />,
      },
      {
        key: "routines",
        label: "Routine",
        onClick: onOpenRoutines,
        icon: <CalendarDays className="h-4 w-4" />,
      },
    ];
  }, [mode, onOpenRoutines, onOpenTasks, onSelectTimer, onWheelModeChange]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          data-interactive
          className="radial-overlay interactive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            // Backdrop click dismisses; ignore presses that start on a menu button.
            if ((event.target as HTMLElement).closest("[data-radial-menu]")) return;
            onClose();
          }}
        >
          <motion.div
            data-radial-menu
            data-interactive
            className="radial-menu"
            style={{ left: x, top: y }}
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {items.map((item, index) => {
              const offset = polarOffset(index, items.length);
              return (
                <motion.button
                  key={item.key}
                  type="button"
                  data-radial-menu
                  data-interactive
                  className="radial-menu__item interactive"
                  onClick={item.onClick}
                  onContextMenu={(event) => event.preventDefault()}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.96 }}
                  initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                  animate={{
                    x: offset.x,
                    y: offset.y,
                    scale: 1,
                    opacity: 1,
                  }}
                  exit={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 28,
                    delay: index * 0.03,
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </motion.button>
              );
            })}

            <button
              type="button"
              data-radial-menu
              data-interactive
              className="radial-menu__center interactive"
              onClick={mode === "timers" ? () => onWheelModeChange("main") : onClose}
              onContextMenu={(event) => event.preventDefault()}
            >
              {mode === "timers" ? "Back" : "Close"}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
