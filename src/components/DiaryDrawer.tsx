import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "framer-motion";
import { BookOpen, Bookmark } from "lucide-react";
import { startOfDay } from "date-fns";
import {
  CalendarWidget,
  type DiaryEditMode,
} from "./diary/CalendarWidget";
import { LeftPage } from "./diary/LeftPage";
import { RightPage } from "./diary/RightPage";
import { SettingsView } from "./diary/SettingsView";

const PAGE_WIDTH = 520;
const SPREAD_WIDTH = PAGE_WIDTH * 2;
const PANEL_HEIGHT = 620;
const SPINE_PEEK = 26;
const SPINE_HANDLE_HEIGHT = 176;
const PAPER_THICKNESS = 18;
const COVER_EDGE = 14;
/** Tuck cover rim under the left-page corner radius to seal curve gaps. */
const COVER_EDGE_OVERLAP = 12;
const CALENDAR_WIDTH = 240;
/** Gap between calendar and cover rim / left page. */
const CALENDAR_GAP = 28;
/** Stage: calendar + gap + cover rim + open spread. */
const OPEN_VIEW_WIDTH = CALENDAR_WIDTH + CALENDAR_GAP + COVER_EDGE + SPREAD_WIDTH;
/** Left edge of the right page inside the open stage. */
const RIGHT_PAGE_X = CALENDAR_WIDTH + CALENDAR_GAP + COVER_EDGE + PAGE_WIDTH;
/** Park the calendar over the middle of the right page while the cover opens. */
const CALENDAR_PARK_X = RIGHT_PAGE_X + (PAGE_WIDTH - CALENDAR_WIDTH) / 2;

const CLOSED_SHIFT = PAGE_WIDTH - SPINE_PEEK;

/**
 * Cursor X landmarks (from the right edge of the screen):
 * - closed: spine peek
 * - spine: middle of the open book (cover just shut)
 * - outer: left edge of the open left page (fully open)
 *
 * Open and close both scrub with the same absolute mapping so positions match.
 */
const CURSOR_SPAN = SPREAD_WIDTH - SPINE_PEEK;
/** Progress at the open-book spine — cover shut; slide still incomplete. */
const SPINE_PROGRESS = CLOSED_SHIFT / CURSOR_SPAN;

const AXIS_LOCK_PX = 8;
const SNAP_MID = SPINE_PROGRESS;
const VELOCITY_OPEN = -260;
const VELOCITY_CLOSE = 260;
const SPINE_TOP_KEY = "enerva-spine-top";

type PendingLeave =
  | { kind: "close" }
  | { kind: "settings" }
  | { kind: "date"; date: Date; mode: DiaryEditMode };

type DragMode = "open" | "close";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function panelHeight() {
  return Math.min(PANEL_HEIGHT, Math.max(320, window.innerHeight - 24));
}

function clampSpineTop(top: number) {
  return clamp(top, 8, Math.max(8, window.innerHeight - SPINE_HANDLE_HEIGHT - 8));
}

function spineOffsetInPanel(height: number) {
  return Math.max(0, (height - SPINE_HANDLE_HEIGHT) / 2);
}

function bookTopFromSpine(spineTop: number, height: number) {
  return spineTop - spineOffsetInPanel(height);
}

function readSpineTop(): number {
  try {
    const raw = localStorage.getItem(SPINE_TOP_KEY);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampSpineTop(n);
    }
  } catch {
    // ignore
  }
  return clampSpineTop(window.innerHeight * 0.5 - SPINE_HANDLE_HEIGHT * 0.5);
}

function persistSpineTop(top: number) {
  try {
    localStorage.setItem(SPINE_TOP_KEY, String(Math.round(top)));
  } catch {
    // ignore
  }
}

/**
 * Shared open/close scrub: cursor left → open, cursor right → closed.
 * Landmarks are fixed to the viewport so open and close never disagree.
 */
function progressFromCursor(clientX: number) {
  const closedX = window.innerWidth - SPINE_PEEK;
  const outerX = window.innerWidth - SPREAD_WIDTH;
  return clamp((closedX - clientX) / (closedX - outerX), 0, 1);
}

/**
 * Slide runs past the spine landmark so the book is still seating while the
 * cover opens. Most travel happens before the spine; the rest overlaps open.
 */
function slideAmount(progress: number) {
  const p = clamp(progress, 0, 1);
  const seatedAtSpine = 0.58;
  if (p <= SPINE_PROGRESS) {
    return seatedAtSpine * (p / SPINE_PROGRESS);
  }
  return seatedAtSpine + (1 - seatedAtSpine) * ((p - SPINE_PROGRESS) / (1 - SPINE_PROGRESS));
}

function openAmount(progress: number) {
  return clamp((progress - SPINE_PROGRESS) / (1 - SPINE_PROGRESS), 0, 1);
}

/** Hold calendar on the right page until the cover is past ~halfway (left page visible). */
const CALENDAR_HOLD = 0.58;

function calendarReveal(openT: number) {
  const t = clamp(openT, 0, 1);
  if (t <= CALENDAR_HOLD) return 0;
  const local = (t - CALENDAR_HOLD) / (1 - CALENDAR_HOLD);
  // Extra-slow start so it only creeps past the spine once the left page is clear.
  return local * local * local * local;
}

export function DiaryDrawer({
  onRefreshMascot,
}: {
  onRefreshMascot?: () => void;
}) {
  const [spineTop, setSpineTop] = useState(() =>
    typeof window === "undefined" ? 200 : readSpineTop(),
  );
  const [bookHeight, setBookHeight] = useState(() =>
    typeof window === "undefined" ? PANEL_HEIGHT : panelHeight(),
  );
  const [open, setOpen] = useState(false);
  const [panelRevealed, setPanelRevealed] = useState(false);
  const [calendarLive, setCalendarLive] = useState(false);
  const [pagesLive, setPagesLive] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [editMode, setEditMode] = useState<DiaryEditMode>("editable");
  const [dirty, setDirty] = useState(false);
  const [discardNonce, setDiscardNonce] = useState(0);
  const [pendingLeave, setPendingLeave] = useState<PendingLeave | null>(null);

  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const shellRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<DragMode>("open");

  const progress = useMotionValue(0);
  const animRef = useRef<ReturnType<typeof animate> | null>(null);

  const startClientX = useRef(0);
  const startClientY = useRef(0);
  const startProgress = useRef(0);
  const startSpineTop = useRef(0);
  const didDrag = useRef(false);
  const movedX = useRef(false);
  const movedY = useRef(false);
  const lastClientX = useRef(0);
  const lastTime = useRef(0);
  const velocityX = useRef(0);

  const bookTop = bookTopFromSpine(spineTop, bookHeight);
  const spineInPanel = spineOffsetInPanel(bookHeight);

  const bookX = useTransform(progress, (p) => {
    // Slide eases across the whole range — still moving while the cover opens.
    return CLOSED_SHIFT * (1 - slideAmount(p));
  });

  const coverRotateY = useTransform(progress, (p) => {
    const openT = openAmount(p);
    const eased = openT * openT * (3 - 2 * openT);
    return -180 * eased;
  });

  /** Drop cover Z as it opens so left/right pages sit coplanar (same height). */
  const coverZ = useTransform(progress, (p) => {
    const openT = openAmount(p);
    return PAPER_THICKNESS * (1 - openT);
  });

  const coverFrontPointer = useTransform(progress, (p) =>
    openAmount(p) > 0.82 ? "none" : "auto",
  );

  const leftPagePointer = useTransform(progress, (p) =>
    openAmount(p) > 0.78 ? "auto" : "none",
  );

  const rightPagePointer = useTransform(progress, (p) =>
    openAmount(p) > 0.35 || slideAmount(p) > 0.7 ? "auto" : "none",
  );

  const coverEdgeOpacity = useTransform(progress, (p) => {
    const openT = openAmount(p);
    if (openT < 0.72) return 0;
    return clamp((openT - 0.72) / 0.2, 0, 1);
  });
  const coverEdgePointer = useTransform(progress, (p) =>
    openAmount(p) > 0.78 ? "auto" : "none",
  );

  const spineTabOpacity = useTransform(progress, (p) => {
    if (p < 0.06) return 1;
    if (p > 0.22) return 0;
    return 1 - (p - 0.06) / 0.16;
  });
  const spineTabPointer = useTransform(progress, (p) =>
    p < 0.18 ? "auto" : "none",
  );

  const bindingOpacity = useTransform(progress, (p) => {
    const openT = openAmount(p);
    if (openT <= 0.05) return 0;
    return clamp((openT - 0.05) / 0.35, 0, 1);
  });

  const paperOpacity = useTransform(progress, (p) => {
    const openT = openAmount(p);
    if (openT <= 0) return 1;
    return clamp(1 - openT / 0.25, 0, 1);
  });

  const calendarX = useTransform(progress, (p) => {
    const revealed = calendarReveal(openAmount(p));
    // Shell-local: park at mid-right page, then translate left to the bay (stage x = 0).
    return -CALENDAR_PARK_X * revealed;
  });
  const calendarOpacity = useTransform(progress, (p) => {
    const openT = openAmount(p);
    // Visible while parked on the right page and during the slide out.
    if (openT >= 0.06) return 1;
    return clamp(openT / 0.06, 0, 1);
  });
  /**
   * Parked → under the swinging cover (no premature pop through left page).
   * Sliding out → rise above the left page.
   */
  const calendarZ = useTransform(progress, (p) => {
    const revealed = calendarReveal(openAmount(p));
    if (revealed <= 0.002) return 3;
    if (revealed >= 0.98) return 20;
    return 96;
  });
  const calendarZIndex = useTransform(progress, (p) => {
    const revealed = calendarReveal(openAmount(p));
    // Cover is z-index 8; stay below while parked, above while moving.
    if (revealed <= 0.002) return 3;
    return 15;
  });

  // Keep bookmark glued to the diary; hide only when the book is fully parked.
  const bookmarkOpacity = useTransform(progress, (p) => {
    const slide = slideAmount(p);
    if (slide >= 0.12) return 1;
    return clamp(slide / 0.12, 0, 1);
  });
  const bookmarkPointer = useTransform(progress, (p) =>
    slideAmount(p) > 0.2 && openAmount(p) > 0.35 ? "auto" : "none",
  );

  const snapTo = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) setIsSettingsOpen(false);
      animRef.current?.stop();
      animRef.current = animate(progress, nextOpen ? 1 : 0, {
        type: "spring",
        stiffness: 220,
        damping: 28,
        mass: 1.05,
      });
    },
    [progress],
  );

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      snapTo(true);
      setPendingLeave({ kind: "close" });
      return;
    }
    snapTo(false);
  }, [snapTo]);

  const applyLeave = useCallback(
    (leave: PendingLeave) => {
      setDirty(false);
      setDiscardNonce((n) => n + 1);
      setPendingLeave(null);

      if (leave.kind === "close") {
        snapTo(false);
        return;
      }
      if (leave.kind === "settings") {
        setIsSettingsOpen(true);
        return;
      }
      setSelectedDate(leave.date);
      setEditMode(leave.mode);
      setIsSettingsOpen(false);
    },
    [snapTo],
  );

  useEffect(() => {
    const onResize = () => {
      setBookHeight(panelHeight());
      setSpineTop((t) => clampSpineTop(t));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useMotionValueEvent(progress, "change", (value) => {
    const openT = openAmount(value);
    const slide = slideAmount(value);
    setPanelRevealed(slide > 0.08 || openT > 0);
    setPagesLive(slide > 0.12 || openT > 0);
    setIsOpening(openT > 0.02 || slide > 0.25);
    setOpen(value > SPINE_PROGRESS + 0.08);
    setCalendarLive(openT > 0.08);
    if (openT < 0.15) setIsSettingsOpen(false);
  });

  const beginGesture = (
    e: PointerEvent<HTMLElement>,
    mode: DragMode,
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    animRef.current?.stop();
    dragMode.current = mode;
    didDrag.current = false;
    movedX.current = false;
    movedY.current = false;
    startClientX.current = e.clientX;
    startClientY.current = e.clientY;
    startProgress.current = progress.get();
    startSpineTop.current = spineTop;
    lastClientX.current = e.clientX;
    lastTime.current = performance.now();
    velocityX.current = 0;
  };

  const onOpenScrubDown = (e: PointerEvent<HTMLElement>) => {
    beginGesture(e, "open");
  };

  const onCloseEdgeDown = (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    beginGesture(e, "close");
  };

  const onGestureMove = (e: PointerEvent<HTMLElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - startClientX.current;
    const dy = e.clientY - startClientY.current;

    if (!didDrag.current) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      didDrag.current = true;
    }

    if (Math.abs(dx) >= 1) movedX.current = true;
    if (Math.abs(dy) >= 1) movedY.current = true;

    const now = performance.now();
    const dt = Math.max(1, now - lastTime.current);
    velocityX.current = ((e.clientX - lastClientX.current) / dt) * 1000;
    lastClientX.current = e.clientX;
    lastTime.current = now;

    // Same absolute cursor map for open and close — no phase mismatch.
    progress.set(progressFromCursor(e.clientX));

    // Vertical drag repositions the diary on open and close pulls alike.
    setSpineTop(clampSpineTop(startSpineTop.current + dy));
  };

  const finishGesture = (e: PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (movedY.current) {
      setSpineTop((t) => {
        const next = clampSpineTop(t);
        persistSpineTop(next);
        return next;
      });
    }

    if (movedX.current) {
      const current = progress.get();
      const v = velocityX.current;
      let nextOpen: boolean;
      if (v <= VELOCITY_OPEN) nextOpen = true;
      else if (v >= VELOCITY_CLOSE) nextOpen = false;
      else nextOpen = current >= SNAP_MID;

      if (!nextOpen && dirtyRef.current) {
        snapTo(true);
        setPendingLeave({ kind: "close" });
        return;
      }
      snapTo(nextOpen);
    }
  };

  const onOpenScrubClick = () => {
    if (didDrag.current) return;
    if (progress.get() > SPINE_PROGRESS) requestClose();
    else snapTo(true);
  };

  const onCloseEdgeClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (didDrag.current) return;
    requestClose();
  };

  const onSelectDate = (date: Date, mode: DiaryEditMode) => {
    const sameDay =
      startOfDay(date).getTime() === startOfDay(selectedDate).getTime();
    if (sameDay && mode === editMode) {
      setIsSettingsOpen(false);
      return;
    }
    if (dirtyRef.current) {
      setPendingLeave({ kind: "date", date, mode });
      return;
    }
    setSelectedDate(date);
    setEditMode(mode);
    setIsSettingsOpen(false);
  };

  const onToggleSettings = () => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      return;
    }
    if (dirtyRef.current) {
      setPendingLeave({ kind: "settings" });
      return;
    }
    setIsSettingsOpen(true);
  };

  const calendarInteractive = calendarLive && !isSettingsOpen;
  const pagesInteractive = pagesLive && panelRevealed && !isSettingsOpen;
  const settingsVisible = isSettingsOpen && open;

  const openScrubHandlers = {
    onPointerDown: onOpenScrubDown,
    onPointerMove: onGestureMove,
    onPointerUp: finishGesture,
    onPointerCancel: finishGesture,
    onClick: onOpenScrubClick,
  };

  const closeEdgeHandlers = {
    onPointerDown: onCloseEdgeDown,
    onPointerMove: onGestureMove,
    onPointerUp: finishGesture,
    onPointerCancel: finishGesture,
    onClick: onCloseEdgeClick,
  };

  return (
    <div
      className="diary-root"
      style={{
        height: bookHeight,
        top: bookTop,
        width: OPEN_VIEW_WIDTH,
      }}
    >
      <motion.button
        type="button"
        data-interactive
        className="book-spine-tab interactive"
        aria-label={open ? "Close diary" : "Open diary"}
        aria-expanded={open}
        style={{
          top: spineInPanel,
          width: SPINE_PEEK,
          height: SPINE_HANDLE_HEIGHT,
          opacity: spineTabOpacity,
          pointerEvents: spineTabPointer,
        }}
        {...openScrubHandlers}
      >
        <span aria-hidden className="book-spine-tab__stripe" />
        <BookOpen className="h-3.5 w-3.5 shrink-0 drop-shadow-sm" strokeWidth={2.25} />
        <span className="book-spine-tab__label">ENERVA</span>
        <span aria-hidden className="book-spine-tab__dot" />
      </motion.button>

      <motion.div
        className={`diary-book-stage${isOpening ? " is-opening" : ""}`}
        style={{
          width: OPEN_VIEW_WIDTH,
          height: bookHeight,
          x: bookX,
        }}
      >
        {/* Lives on the stage so it tracks the diary while closing (no relative drift). */}
        <motion.button
          type="button"
          data-interactive
          className={`diary-bookmark interactive${isSettingsOpen ? " is-active" : ""}`}
          style={{
            right: 24,
            opacity: bookmarkOpacity,
            pointerEvents: isSettingsOpen
              ? "auto"
              : bookmarkPointer,
          }}
          aria-label={isSettingsOpen ? "Close settings" : "Open settings"}
          aria-pressed={isSettingsOpen}
          onClick={onToggleSettings}
        >
          <Bookmark className="h-3.5 w-3.5" strokeWidth={2.4} />
          <span>Settings</span>
        </motion.button>

        <div className="diary-book-3d" style={{ width: OPEN_VIEW_WIDTH, height: bookHeight }}>
          {/* Flat settings sit on the open spread (not trapped under the 3D cover). */}
          <AnimatePresence>
            {settingsVisible ? (
              <motion.div
                key="settings"
                className="diary-spread-settings interactive"
                data-interactive
                style={{
                  width: SPREAD_WIDTH,
                  height: bookHeight,
                  left: CALENDAR_WIDTH + CALENDAR_GAP + COVER_EDGE,
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <SettingsView
                  onRefreshMascot={onRefreshMascot}
                  onBack={() => setIsSettingsOpen(false)}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            ref={shellRef}
            className="diary-book-shell"
            style={{
              width: PAGE_WIDTH,
              marginLeft: CALENDAR_WIDTH + CALENDAR_GAP + COVER_EDGE + PAGE_WIDTH,
            }}
          >
            <div className="book-bottom-cover" aria-hidden>
              <span className="book-bottom-cover__board" />
              <span className="book-bottom-cover__spine" />
            </div>

            <motion.div
              className="book-paper-stack"
              aria-hidden
              style={{ opacity: paperOpacity }}
            >
              <span />
              <span />
              <span />
            </motion.div>

            <motion.div
              aria-hidden
              className="diary-binding"
              style={{ opacity: bindingOpacity }}
            />

            <motion.div
              data-interactive={pagesInteractive ? true : undefined}
              className={`book-right-leaf${pagesInteractive ? " is-live interactive" : ""}`}
              style={{
                pointerEvents: settingsVisible ? "none" : rightPagePointer,
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {pagesLive && !settingsVisible ? (
                <RightPage
                  selectedDate={selectedDate}
                  editable={editMode === "editable"}
                />
              ) : null}
            </motion.div>

            {/*
              Between right page and top cover: hidden under the swinging left page
              while parked; lifted above it only while sliding out to the left bay.
            */}
            <motion.div
              className="diary-calendar-bay"
              style={{
                width: CALENDAR_WIDTH,
                left: (PAGE_WIDTH - CALENDAR_WIDTH) / 2,
                x: calendarX,
                z: calendarZ,
                zIndex: calendarZIndex,
                opacity: calendarOpacity,
                pointerEvents: calendarInteractive ? "auto" : "none",
              }}
              aria-hidden={!calendarInteractive}
            >
              {calendarLive && !isSettingsOpen ? (
                <CalendarWidget selectedDate={selectedDate} onSelectDate={onSelectDate} />
              ) : null}
            </motion.div>

            <motion.div
              className="book-top-cover"
              style={{
                rotateY: coverRotateY,
                z: coverZ,
                transformOrigin: "left center",
                opacity: settingsVisible ? 0 : 1,
                pointerEvents: settingsVisible ? "none" : "auto",
              }}
            >
              <motion.button
                type="button"
                data-interactive
                className="book-top-cover__front interactive"
                aria-label={open ? "Close diary" : "Open diary"}
                aria-expanded={open}
                style={{ pointerEvents: coverFrontPointer }}
                {...openScrubHandlers}
              >
                <span className="book-top-cover__title">ENERVA</span>
                <span className="book-top-cover__sub">Diary Companion</span>
                <BookOpen className="book-top-cover__icon" strokeWidth={2.1} />
              </motion.button>

              <motion.div
                data-interactive={pagesInteractive ? true : undefined}
                className={`book-top-cover__inside${pagesInteractive ? " is-live interactive" : ""}`}
                style={{ pointerEvents: settingsVisible ? "none" : leftPagePointer }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {pagesLive && !settingsVisible ? (
                  <LeftPage
                    selectedDate={selectedDate}
                    editMode={editMode}
                    discardNonce={discardNonce}
                    onDirtyChange={setDirty}
                  />
                ) : null}

                {/*
                  Outer cover rim on the screen-left of the open left page.
                  Click closes; drag right folds then slides the book away.
                */}
                <motion.button
                  type="button"
                  data-interactive
                  className="book-cover-edge interactive"
                  aria-label="Close diary"
                  style={{
                    width: COVER_EDGE + COVER_EDGE_OVERLAP,
                    left: -COVER_EDGE,
                    opacity: coverEdgeOpacity,
                    pointerEvents: settingsVisible ? "none" : coverEdgePointer,
                  }}
                  {...closeEdgeHandlers}
                >
                  <span aria-hidden className="book-cover-edge__grain" />
                </motion.button>
              </motion.div>
            </motion.div>

            {/* Close edge also available while settings covers the spread */}
            {settingsVisible ? (
              <motion.button
                type="button"
                data-interactive
                className="book-cover-edge book-cover-edge--flat interactive"
                aria-label="Close diary"
                style={{
                  width: COVER_EDGE,
                  left: -PAGE_WIDTH - COVER_EDGE,
                  opacity: 1,
                  pointerEvents: "auto",
                }}
                {...closeEdgeHandlers}
              >
                <span aria-hidden className="book-cover-edge__grain" />
              </motion.button>
            ) : null}
          </div>
        </div>

        <AnimatePresence>
          {pendingLeave ? (
            <motion.div
              className="diary-discard"
              data-interactive
              role="dialog"
              aria-modal="true"
              aria-labelledby="diary-discard-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <motion.div
                className="diary-discard__card interactive"
                data-interactive
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                onClick={(e) => e.stopPropagation()}
              >
                <p id="diary-discard-title" className="diary-discard__title">
                  You will lose this writing if you leave now. Do you want to discard
                  your changes?
                </p>
                <div className="diary-discard__actions">
                  <button
                    type="button"
                    data-interactive
                    className="diary-discard__btn diary-discard__btn--discard interactive"
                    onClick={() => applyLeave(pendingLeave)}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    data-interactive
                    className="diary-discard__btn diary-discard__btn--stay interactive"
                    onClick={() => setPendingLeave(null)}
                  >
                    Not leaving
                  </button>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
