import { useState, type PointerEvent } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import { BookOpen } from "lucide-react";

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 800;
const SPINE_WIDTH = 44;
const SPINE_TOP_KEY = "enerva-spine-top";

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function DiaryDrawer() {
  const x = useMotionValue(PANEL_WIDTH);
  const [open, setOpen] = useState(false);
  const [spineTop, setSpineTop] = useState(() => {
    try {
      const raw = localStorage.getItem(SPINE_TOP_KEY);
      return raw ? Number(raw) : 200;
    } catch {
      return 200;
    }
  });

  function snap(nextOpen: boolean) {
    setOpen(nextOpen);
    void animate(x, nextOpen ? 0 : PANEL_WIDTH, { type: "spring", stiffness: 380, damping: 36 });
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = x.get();
    const originTop = spineTop;

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      x.set(clamp(origin + dx, 0, PANEL_WIDTH));
      const nextTop = clamp(originTop + dy, 0, window.innerHeight - 176);
      setSpineTop(nextTop);
    }

    function up(ev: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const dx = ev.clientX - startX;
      snap(origin + dx < PANEL_WIDTH / 2);
      try {
        localStorage.setItem(SPINE_TOP_KEY, String(clamp(originTop + (ev.clientY - startY), 0, window.innerHeight - 176)));
      } catch {
        // ignore
      }
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <motion.div
      className="diary-book interactive"
      data-interactive
      style={{ x, top: spineTop, position: "fixed", right: 0, display: "flex", height: PANEL_HEIGHT }}
    >
      <button
        type="button"
        className="book-spine interactive"
        data-interactive
        onClick={() => snap(!open)}
        onPointerDown={onPointerDown}
      >
        <BookOpen className="h-4 w-4" />
        ENERVA
      </button>
      <section className="diary-panel" data-interactive style={{ width: PANEL_WIDTH }}>
        <p>Diary companion</p>
        <p>Pull the spine to open the book Halo left on the desktop edge.</p>
      </section>
    </motion.div>
  );
}
