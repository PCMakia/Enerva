import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  addRoutine,
  getRoutines,
  isRoutineActiveOn,
  isRoutineDoneOn,
  listenRoutines,
  removeRoutine,
  renameRoutine,
  toggleRoutineCompletion,
  toggleRoutineWeekday,
  type Routine,
} from "../lib/routineStore";

type RoutineWidgetProps = {
  visible: boolean;
  onClose: () => void;
};

function blockContextMenu(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function weekDays(anchor: Date) {
  const start = startOfWeek(startOfDay(anchor), { weekStartsOn: 0 });
  const end = endOfWeek(start, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export function RoutineWidget({ visible, onClose }: RoutineWidgetProps) {
  const dragControls = useDragControls();
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [routines, setRoutines] = useState<Routine[]>(() => getRoutines());
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const monthLabel = format(days[3] ?? anchor, "MMMM yyyy");

  useEffect(() => {
    if (!visible) return;
    setRoutines(getRoutines());
    return listenRoutines(() => setRoutines(getRoutines()));
  }, [visible]);

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const label = draft.trim();
    if (!label) return;
    addRoutine(label);
    setDraft("");
  };

  const commitRename = () => {
    if (!renamingId) return;
    renameRoutine(renamingId, renameValue);
    setRenamingId(null);
    setRenameValue("");
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    }
    if (event.key === "Escape") {
      setRenamingId(null);
      setRenameValue("");
    }
  };

  if (!visible) return null;

  return (
    <motion.div
      data-interactive
      className="routine-widget interactive"
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, y: 8 }}
      onContextMenu={blockContextMenu}
    >
      <div className="routine-widget__chrome">
        <button
          type="button"
          data-interactive
          className="routine-widget__grip interactive"
          aria-label="Drag routine widget"
          onPointerDown={(e) => dragControls.start(e)}
          onContextMenu={blockContextMenu}
        >
          <span className="routine-widget__dots" aria-hidden />
        </button>
        <button
          type="button"
          data-interactive
          className="routine-widget__close interactive"
          aria-label="Close routines"
          onClick={onClose}
          onContextMenu={blockContextMenu}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <header className="routine-widget__header" onContextMenu={blockContextMenu}>
        <button
          type="button"
          data-interactive
          className={`routine-widget__edit interactive${editMode ? " is-active" : ""}`}
          onClick={() => setEditMode((v) => !v)}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>{editMode ? "Done Editing" : "Edit List"}</span>
        </button>

        <div className="routine-widget__nav">
          <button
            type="button"
            data-interactive
            className="routine-widget__nav-btn interactive"
            aria-label="Previous week"
            onClick={() => setAnchor((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="routine-widget__month">{monthLabel}</span>
          <button
            type="button"
            data-interactive
            className="routine-widget__nav-btn interactive"
            aria-label="Next week"
            onClick={() => setAnchor((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {editMode ? (
        <p className="routine-widget__hint">
          Edit mode: tap a day to enable/disable that weekday. Use the trash to delete a routine.
        </p>
      ) : null}

      <div
        className={`routine-widget__grid-head${editMode ? " is-editing" : ""}`}
      >
        <span className="routine-widget__name-col" />
        {days.map((day) => {
          const current = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={`routine-widget__day-head${current ? " is-today" : ""}`}
            >
              <span className="routine-widget__day-num">{format(day, "d")}</span>
              <span className="routine-widget__day-name">{format(day, "EEE").toUpperCase()}</span>
            </div>
          );
        })}
        {editMode ? <span className="routine-widget__action-col" aria-hidden /> : null}
      </div>

      <ul className="routine-widget__rows">
        <AnimatePresence initial={false}>
          {routines.length === 0 ? (
            <li className="routine-widget__empty">No routines yet — add one below.</li>
          ) : (
            routines.map((routine) => (
              <motion.li
                key={routine.id}
                className={`routine-widget__row${editMode ? " is-editing" : ""}`}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                <div className="routine-widget__label-wrap">
                  <GripVertical className="routine-widget__handle" aria-hidden />
                  {renamingId === routine.id ? (
                    <input
                      autoFocus
                      data-interactive
                      className="routine-widget__rename interactive"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={onRenameKey}
                      onContextMenu={blockContextMenu}
                    />
                  ) : (
                    <button
                      type="button"
                      data-interactive
                      className="routine-widget__label interactive"
                      onDoubleClick={() => {
                        setRenamingId(routine.id);
                        setRenameValue(routine.label);
                      }}
                      title="Double-click to rename"
                    >
                      {routine.label}
                    </button>
                  )}
                </div>

                {days.map((day) => {
                  const weekday = day.getDay();
                  const weekdayOn = routine.activeWeekdays[weekday] ?? false;
                  const active = isRoutineActiveOn(routine, day);
                  const done = isRoutineDoneOn(routine, day);

                  if (editMode) {
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        data-interactive
                        className={`routine-widget__cell interactive${
                          weekdayOn ? "" : " is-disabled"
                        }`}
                        aria-label={`${routine.label} ${format(day, "EEE")} ${
                          weekdayOn ? "enabled" : "disabled"
                        }`}
                        onClick={() => toggleRoutineWeekday(routine.id, weekday)}
                        onContextMenu={blockContextMenu}
                      />
                    );
                  }

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      data-interactive
                      disabled={!active}
                      className={`routine-widget__cell interactive${
                        !active ? " is-disabled" : done ? " is-done" : ""
                      }`}
                      aria-label={`${routine.label} ${format(day, "MMM d")}`}
                      onClick={() => toggleRoutineCompletion(routine.id, day)}
                      onContextMenu={blockContextMenu}
                    >
                      {active && done ? (
                        <Check className="h-3 w-3" strokeWidth={3} />
                      ) : null}
                    </button>
                  );
                })}

                {editMode ? (
                  <button
                    type="button"
                    data-interactive
                    className="routine-widget__delete interactive"
                    aria-label={`Delete ${routine.label}`}
                    onClick={() => removeRoutine(routine.id)}
                    onContextMenu={blockContextMenu}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </motion.li>
            ))
          )}
        </AnimatePresence>
      </ul>

      <form className="routine-widget__add" onSubmit={onAdd} data-interactive>
        <input
          data-interactive
          className="routine-widget__add-input interactive"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New routine name"
          aria-label="New routine"
          onContextMenu={blockContextMenu}
        />
        <button
          type="submit"
          data-interactive
          className="routine-widget__add-btn interactive"
          disabled={!draft.trim()}
          onContextMenu={blockContextMenu}
        >
          <Plus className="h-4 w-4" />
          Add Routine
        </button>
      </form>
    </motion.div>
  );
}
