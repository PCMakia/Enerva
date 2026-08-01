import { useEffect, useRef, type MutableRefObject } from "react";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";

/** Global cursor sample in both desktop (physical) and window-local (logical) space. */
export type GlobalCursor = {
  /** Physical desktop coords from Tauri `cursorPosition()`. */
  screenX: number;
  screenY: number;
  /** Logical coords relative to the app window (CSS / client space). */
  clientX: number;
  clientY: number;
};

export const EMPTY_CURSOR: GlobalCursor = {
  screenX: 0,
  screenY: 0,
  clientX: 0,
  clientY: 0,
};

/**
 * Passes mouse clicks through transparent areas to windows below.
 * Interactive regions must use `data-interactive` so they can still receive input.
 *
 * Hover alone cannot re-enable hit-testing while ignore is on, so we poll the
 * OS cursor and toggle ignore based on whether it sits over an interactive node.
 *
 * Optionally mirrors each sample into `cursorRef` so other systems (e.g. Live2D
 * focus) can track the cursor even while click-through suppresses DOM events.
 */
export function useClickThrough(
  enabled = true,
  cursorRef?: MutableRefObject<GlobalCursor>,
) {
  const ignoringRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const appWindow = getCurrentWindow();
    let cancelled = false;
    let raf = 0;

    const setIgnoring = async (ignore: boolean) => {
      if (cancelled || ignoringRef.current === ignore) return;
      ignoringRef.current = ignore;
      try {
        await appWindow.setIgnoreCursorEvents(ignore);
      } catch (error) {
        console.error("setIgnoreCursorEvents failed:", error);
      }
    };

    const tick = async () => {
      try {
        const [cursor, windowPos, scale] = await Promise.all([
          cursorPosition(),
          appWindow.innerPosition(),
          appWindow.scaleFactor(),
        ]);

        const clientX = (cursor.x - windowPos.x) / scale;
        const clientY = (cursor.y - windowPos.y) / scale;

        if (cursorRef) {
          cursorRef.current = {
            screenX: cursor.x,
            screenY: cursor.y,
            clientX,
            clientY,
          };
        }

        const el = document.elementFromPoint(clientX, clientY);
        const overInteractive = Boolean(el?.closest("[data-interactive]"));
        await setIgnoring(!overInteractive);
      } catch (error) {
        console.error("click-through poll failed:", error);
      }

      if (!cancelled) {
        raf = window.setTimeout(() => {
          void tick();
        }, 32);
      }
    };

    void setIgnoring(true).then(() => {
      if (!cancelled) void tick();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(raf);
      void appWindow.setIgnoreCursorEvents(false);
    };
  }, [enabled, cursorRef]);
}
