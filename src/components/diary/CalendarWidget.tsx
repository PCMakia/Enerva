import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getSavedDiaryDateKeys,
  listenDiaryEntries,
} from "../../lib/diaryEntries";
import {
  getRoutineDayStats,
  listenRoutines,
  type RoutineDayStats,
} from "../../lib/routineStore";

export type DiaryEditMode = "editable" | "readonly";

type CalendarWidgetProps = {
  selectedDate: Date;
  onSelectDate: (date: Date, mode: DiaryEditMode) => void;
};

function DayStampMark() {
  return (
    <svg
      className="diary-calendar__stamp"
      viewBox="0 0 26 26"
      aria-hidden
    >
      <circle
        cx="13"
        cy="13"
        r="9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="2.2 1.6"
      />
      <circle cx="13" cy="13" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="13" cy="12.2" rx="2.9" ry="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.9" cy="11.8" r="0.5" fill="currentColor" />
      <circle cx="14.1" cy="11.8" r="0.5" fill="currentColor" />
    </svg>
  );
}

function starPoints(cx: number, cy: number, outer: number, inner: number) {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }
  return points.join(" ");
}

/** Golden stars arched above the date: 1 / 2 / 3 by routine completion. */
function RoutineStarArch({ stars }: { stars: RoutineDayStats["stars"] }) {
  if (stars <= 0) {
    return <span className="diary-calendar__stars" aria-hidden />;
  }

  // Compact arch kept inside viewBox so day-cell edges don't clip tips.
  const layout =
    stars === 1
      ? [{ x: 16, y: 8, r: 0 }]
      : stars === 2
        ? [
            { x: 9, y: 8.5, r: -26 },
            { x: 23, y: 8.5, r: 26 },
          ]
        : [
            { x: 7, y: 9.5, r: -32 },
            { x: 16, y: 6.2, r: 0 },
            { x: 25, y: 9.5, r: 32 },
          ];

  return (
    <svg
      className="diary-calendar__stars"
      viewBox="0 0 32 14"
      overflow="visible"
      aria-hidden
    >
      {layout.map((star, index) => (
        <polygon
          key={index}
          className="diary-calendar__star"
          points={starPoints(0, 0, 2.85, 1.15)}
          transform={`translate(${star.x} ${star.y}) rotate(${star.r})`}
        />
      ))}
    </svg>
  );
}

export function CalendarWidget({ selectedDate, onSelectDate }: CalendarWidgetProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate));
  const [entryKeys, setEntryKeys] = useState(() => getSavedDiaryDateKeys());
  const [routineTick, setRoutineTick] = useState(0);

  useEffect(() => {
    const sync = () => setEntryKeys(getSavedDiaryDateKeys());
    sync();
    return listenDiaryEntries(sync);
  }, []);

  useEffect(() => {
    return listenRoutines(() => setRoutineTick((n) => n + 1));
  }, []);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const today = startOfDay(new Date());

  const handleSelect = (day: Date) => {
    const normalized = startOfDay(day);
    // Only today is editable; past and future are read-only views.
    if (isToday(normalized) || isSameDay(normalized, today)) {
      onSelectDate(normalized, "editable");
      return;
    }
    onSelectDate(normalized, "readonly");
  };

  return (
    <div
      data-interactive
      data-calendar-widget
      className="diary-calendar interactive"
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="diary-calendar__header">
        <button
          type="button"
          data-interactive
          className="diary-calendar__nav interactive"
          aria-label="Previous month"
          onClick={() => setVisibleMonth((m) => startOfMonth(subMonths(m, 1)))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="diary-calendar__title">{format(visibleMonth, "MMMM yyyy")}</h2>
        <button
          type="button"
          data-interactive
          className="diary-calendar__nav interactive"
          aria-label="Next month"
          onClick={() => setVisibleMonth((m) => startOfMonth(addMonths(m, 1)))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>

      <div className="diary-calendar__weekdays">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="diary-calendar__grid">
        {days.map((day) => {
          const inMonth = isSameMonth(day, visibleMonth);
          const selected = isSameDay(day, selectedDate);
          const current = isToday(day);
          const past = isBefore(startOfDay(day), today);
          const future = isAfter(startOfDay(day), today);
          const dateKey = format(startOfDay(day), "yyyy-MM-dd");
          const hasEntry = entryKeys.has(dateKey);
          // Future days stay blank; past/today show completion stars.
          const stats =
            future || !inMonth
              ? { proposed: 0, done: 0, stars: 0 as const }
              : getRoutineDayStats(day);
          void routineTick;

          const routineLabel =
            stats.stars > 0
              ? `, routines ${stats.done}/${stats.proposed}`
              : "";

          return (
            <button
              key={day.toISOString()}
              type="button"
              data-interactive
              className={[
                "diary-calendar__day interactive",
                inMonth ? "" : "is-outside",
                selected ? "is-selected" : "",
                current ? "is-today" : "",
                past && !current ? "is-past" : "",
                future ? "is-future" : "",
                hasEntry ? "has-entry" : "",
                stats.stars > 0 ? `has-stars-${stats.stars}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={
                hasEntry
                  ? `${format(day, "MMMM d")}: diary entry saved${routineLabel}`
                  : `${format(day, "MMMM d")}${routineLabel}`
              }
              title={
                stats.proposed > 0 && !future
                  ? `Routines ${stats.done}/${stats.proposed}`
                  : undefined
              }
              onClick={() => handleSelect(day)}
            >
              <RoutineStarArch stars={stats.stars} />
              <span className="diary-calendar__day-num">{format(day, "d")}</span>
              {hasEntry ? <DayStampMark /> : <span className="diary-calendar__stamp-slot" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
