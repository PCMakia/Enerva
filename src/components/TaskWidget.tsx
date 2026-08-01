import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { motion, useDragControls } from "framer-motion";
import { Check, Plus, Trash2, X } from "lucide-react";
import { format, startOfDay } from "date-fns";
import {
  addTask,
  getTasksForDate,
  listenTasks,
  removeTask,
  toggleTask,
  type TaskItem,
} from "../lib/taskStore";

type TaskWidgetProps = {
  visible: boolean;
  onClose: () => void;
};

function blockContextMenu(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function TaskWidget({ visible, onClose }: TaskWidgetProps) {
  const dragControls = useDragControls();
  const dateKey = format(startOfDay(new Date()), "yyyy-MM-dd");
  const [tasks, setTasks] = useState<TaskItem[]>(() => getTasksForDate(new Date()));
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!visible) return;
    const day = startOfDay(new Date());
    setTasks(getTasksForDate(day));
    return listenTasks(() => setTasks(getTasksForDate(day)));
  }, [visible, dateKey]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const label = draft.trim();
    if (!label) return;
    try {
      addTask(label, today);
      setDraft("");
    } catch {
      // ignore empty
    }
  };

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") setDraft("");
  };

  if (!visible) return null;

  const remaining = tasks.filter((t) => !t.done).length;
  const today = startOfDay(new Date());

  return (
    <motion.div
      data-interactive
      className="task-widget interactive"
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 8 }}
      onContextMenu={blockContextMenu}
    >
      <header
        className="task-widget__header"
        onPointerDown={(event) => dragControls.start(event)}
        onContextMenu={blockContextMenu}
      >
        <div>
          <p className="task-widget__eyebrow">Today</p>
          <h2 className="task-widget__title">Tasks</h2>
          <p className="task-widget__meta">
            {format(today, "MMM d")} · {remaining} open
          </p>
        </div>
        <button
          type="button"
          data-interactive
          className="task-widget__close interactive"
          aria-label="Close tasks"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={blockContextMenu}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <form className="task-widget__compose" onSubmit={onSubmit} data-interactive>
        <input
          data-interactive
          className="task-widget__input interactive"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKeyDown}
          onContextMenu={blockContextMenu}
          placeholder="Add a task…"
          aria-label="New task"
        />
        <button
          type="submit"
          data-interactive
          className="task-widget__add interactive"
          aria-label="Add task"
          disabled={!draft.trim()}
          onContextMenu={blockContextMenu}
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      <ul className="task-widget__list" data-interactive>
        {tasks.length === 0 ? (
          <li className="task-widget__empty">No tasks yet — add one above.</li>
        ) : (
          tasks.map((task) => (
            <li key={task.id} className="task-widget__row">
              <button
                type="button"
                data-interactive
                className={`task-widget__item interactive${task.done ? " is-done" : ""}`}
                onClick={() => toggleTask(task.id, today)}
                onContextMenu={blockContextMenu}
              >
                <span className="task-widget__check" aria-hidden>
                  {task.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span>{task.label}</span>
              </button>
              <button
                type="button"
                data-interactive
                className="task-widget__trash interactive"
                aria-label={`Delete ${task.label}`}
                onClick={() => removeTask(task.id, today)}
                onContextMenu={blockContextMenu}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>
    </motion.div>
  );
}
