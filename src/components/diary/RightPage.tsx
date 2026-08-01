import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ImageIcon } from "lucide-react";
import { format, isAfter, startOfDay } from "date-fns";
import { hasSavedDiaryEntry, listenDiaryEntries } from "../../lib/diaryEntries";
import {
  getDisplayedFocusSeconds,
  listenFocusTime,
} from "../../lib/focusTimeStore";
import {
  getTasksForDate,
  listenTasks,
  toggleTask,
  type TaskItem,
} from "../../lib/taskStore";
import {
  getRoutineChecklistForDate,
  listenRoutines,
  toggleRoutineCompletion,
} from "../../lib/routineStore";

type ChecklistItem = { id: string; label: string; done: boolean };

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatFocus(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function HaloStamp() {
  return (
    <svg
      className="diary-stamp"
      viewBox="0 0 120 120"
      aria-label="Enerva reading stamp"
      role="img"
    >
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeDasharray="4 3"
      />
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="60" cy="52" rx="18" ry="16" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="53" cy="50" r="2.2" fill="currentColor" />
      <circle cx="67" cy="50" r="2.2" fill="currentColor" />
      <path
        d="M54 57c2.5 3 9.5 3 12 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M46 42l-6-10 12 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M74 42l6-10-12 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M42 78h36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M48 78V68h12l2 4 2-4h12v10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M60 68v10" stroke="currentColor" strokeWidth="1.6" />
      <text
        x="60"
        y="98"
        textAnchor="middle"
        fill="currentColor"
        fontSize="9"
        fontWeight="700"
        letterSpacing="2"
      >
        ENERVA
      </text>
    </svg>
  );
}

type ChecklistProps = {
  title: string;
  items: ChecklistItem[];
  locked: boolean;
  emptyLabel?: string;
  onToggle: (id: string) => void;
};

function Checklist({ title, items, locked, emptyLabel, onToggle }: ChecklistProps) {
  return (
    <div className="diary-checklist">
      <h3 className="diary-checklist__title">{title}</h3>
      {items.length === 0 ? (
        <p className="diary-checklist__empty">{emptyLabel ?? "Nothing here yet."}</p>
      ) : (
        <ul className="diary-checklist__list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-interactive
                disabled={locked}
                className={`diary-checklist__item interactive${item.done ? " is-done" : ""}`}
                onClick={() => onToggle(item.id)}
              >
                <span className="diary-checklist__mark" aria-hidden>
                  {item.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type RightPageProps = {
  selectedDate: Date;
  editable: boolean;
};

export function RightPage({ selectedDate, editable }: RightPageProps) {
  const dateKey = format(startOfDay(selectedDate), "yyyy-MM-dd");
  const [focusSeconds, setFocusSeconds] = useState(() => {
    const day = startOfDay(selectedDate);
    if (isAfter(day, startOfDay(new Date()))) return 0;
    return getDisplayedFocusSeconds(selectedDate);
  });
  const [tasks, setTasks] = useState<TaskItem[]>(() => getTasksForDate(selectedDate));
  const [routines, setRoutines] = useState(() => getRoutineChecklistForDate(selectedDate));
  const [hasStamp, setHasStamp] = useState(() => hasSavedDiaryEntry(selectedDate));
  /** Only true for the Save that first earns the stamp — not on later page opens. */
  const [playStampDrop, setPlayStampDrop] = useState(false);
  const hadStampRef = useRef(hasStamp);
  const locked = !editable;

  useEffect(() => {
    const stamped = hasSavedDiaryEntry(selectedDate);
    setTasks(getTasksForDate(selectedDate));
    setRoutines(getRoutineChecklistForDate(selectedDate));
    setHasStamp(stamped);
    setPlayStampDrop(false);
    hadStampRef.current = stamped;

    const day = startOfDay(selectedDate);
    if (isAfter(day, startOfDay(new Date()))) setFocusSeconds(0);
    else setFocusSeconds(getDisplayedFocusSeconds(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    const syncFocus = () => {
      const day = startOfDay(selectedDate);
      if (isAfter(day, startOfDay(new Date()))) {
        setFocusSeconds(0);
        return;
      }
      setFocusSeconds(getDisplayedFocusSeconds(selectedDate));
    };
    return listenFocusTime(syncFocus);
  }, [selectedDate]);

  useEffect(() => {
    const sync = () => {
      setTasks(getTasksForDate(selectedDate));
      setRoutines(getRoutineChecklistForDate(selectedDate));

      const stamped = hasSavedDiaryEntry(selectedDate);
      if (stamped && !hadStampRef.current) {
        setPlayStampDrop(true);
      }
      hadStampRef.current = stamped;
      setHasStamp(stamped);
    };
    const offTasks = listenTasks(sync);
    const offDiary = listenDiaryEntries(sync);
    const offRoutines = listenRoutines(sync);
    return () => {
      offTasks();
      offDiary();
      offRoutines();
    };
  }, [selectedDate]);

  return (
    <section className="diary-page diary-page--right" data-interactive>
      <div className="diary-dash__image" data-interactive>
        <ImageIcon className="h-8 w-8 opacity-40" strokeWidth={1.5} />
        <span>{format(selectedDate, "MMM d")} still</span>
      </div>

      <div className="diary-dash__focus">
        <p className="diary-dash__label">Focus Time</p>
        <p className="diary-dash__clock" aria-label="Focus time for selected day">
          {formatFocus(focusSeconds)}
        </p>
        <p className="diary-dash__sub">
          {format(selectedDate, "EEEE, MMM d")}
        </p>
      </div>

      <div className="diary-dash__lists">
        <Checklist
          title="Completed tasks"
          items={tasks}
          locked={locked}
          emptyLabel="Add tasks from the Tasks widget."
          onToggle={(id) => {
            if (locked) return;
            toggleTask(id, selectedDate);
          }}
        />
        <Checklist
          title="Routine"
          items={routines}
          locked={locked}
          emptyLabel="Add routines from the Routine widget."
          onToggle={(id) => {
            if (locked) return;
            toggleRoutineCompletion(id, selectedDate);
          }}
        />
      </div>

      <div className="diary-dash__stamp-wrap">
        {hasStamp ? (
          playStampDrop ? (
            <motion.div
              key={`stamp-drop-${dateKey}`}
              className="diary-dash__stamp-motion"
              initial={{
                scale: 2.6,
                y: -140,
                opacity: 0,
                rotate: -22,
              }}
              animate={{
                scale: 1,
                y: 0,
                opacity: 0.9,
                rotate: -8,
              }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 16,
                mass: 0.9,
              }}
              onAnimationComplete={() => setPlayStampDrop(false)}
            >
              <HaloStamp />
            </motion.div>
          ) : (
            <div className="diary-dash__stamp-motion diary-dash__stamp-motion--static">
              <HaloStamp />
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
