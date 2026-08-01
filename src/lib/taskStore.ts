import { format, startOfDay } from "date-fns";

export type TaskItem = {
  id: string;
  label: string;
  done: boolean;
};

const STORAGE_KEY = "enerva-day-tasks";
const CHANGE = "tasks:changed";
const emitter = new EventTarget();

function dateKey(date: Date = new Date()) {
  return format(startOfDay(date), "yyyy-MM-dd");
}

function readAll(): Record<string, TaskItem[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TaskItem[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, TaskItem[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
  emitter.dispatchEvent(new Event(CHANGE));
}

export function getTasksForDate(date: Date): TaskItem[] {
  return readAll()[dateKey(date)] ?? [];
}

export function setTasksForDate(date: Date, tasks: TaskItem[]) {
  const map = readAll();
  map[dateKey(date)] = tasks;
  writeAll(map);
}

export function addTask(label: string, date: Date = new Date()): TaskItem {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("Task label required");
  }
  const task: TaskItem = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    done: false,
  };
  const tasks = [...getTasksForDate(date), task];
  setTasksForDate(date, tasks);
  return task;
}

export function toggleTask(id: string, date: Date = new Date()) {
  const tasks = getTasksForDate(date).map((task) =>
    task.id === id ? { ...task, done: !task.done } : task,
  );
  setTasksForDate(date, tasks);
}

export function removeTask(id: string, date: Date = new Date()) {
  setTasksForDate(
    date,
    getTasksForDate(date).filter((task) => task.id !== id),
  );
}

export function listenTasks(listener: () => void) {
  emitter.addEventListener(CHANGE, listener);
  return () => emitter.removeEventListener(CHANGE, listener);
}

/** Import gogh-style completed task labels for a date (creates missing tasks as done). */
export function importCompletedTasksForDate(date: Date, labels: string[]) {
  const existing = getTasksForDate(date);
  const byLabel = new Map(
    existing.map((task) => [task.label.toLowerCase(), task]),
  );
  const next = [...existing];

  for (const label of labels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const found = byLabel.get(key);
    if (found) {
      if (!found.done) {
        const index = next.findIndex((task) => task.id === found.id);
        if (index >= 0) next[index] = { ...found, done: true };
      }
    } else {
      const task: TaskItem = {
        id: `task-import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label: trimmed,
        done: true,
      };
      next.push(task);
      byLabel.set(key, task);
    }
  }

  setTasksForDate(date, next);
}
