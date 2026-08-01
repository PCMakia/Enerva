import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as PIXI from "pixi.js";
import {
  EMPTY_CURSOR,
  type GlobalCursor,
} from "../hooks/useClickThrough";
import { listenTimerComplete } from "../lib/timeKeeperEvents";

/** Alias of Design_genius(1).model3.json; keeps parentheses out of the fetch URL. */
const MODEL_URL = "/live2d/GeniusHalo/GeniusHalo.model3.json";
/** Target on-screen height as a fraction of the window. */
const HEIGHT_RATIO = 0.72;
const POS_KEY = "enerva-mascot-pos";

/** Pixel radius for max look angle — lower = snappier tracking. */
const FOCUS_SENSITIVITY_RADIUS = 600;
/** Per-frame lerp toward the mouse target (lower = smoother, higher = snappier). */
const FOCUS_LERP_SPEED = 0.08;
/** Per-frame lerp toward intended stage position (peek / settle). */
const POS_LERP_SPEED = 0.1;
/** Faster follow while the user is actively dragging. */
const POS_DRAG_LERP_SPEED = 0.55;
/** Per-frame lerp toward targetRotation (shortest-path). */
const ROTATION_LERP_SPEED = 0.15;
/**
 * AI Director: how often to try a random-edge peek from The Void (ms).
 * 20s for testing — raise toward 60_000–180_000 for quieter idle.
 */
const AI_DIRECTOR_INTERVAL_MS = 20_000;

// --- 5-PIECE HITBOX CALIBRATION ---

// 1. Head Box (shortened to exclude neck)
const HEAD_WIDTH_RATIO = 0.22;
const HEAD_HEIGHT_RATIO = 0.19;
const HEAD_Y_OFFSET = 0.01;

// 2. Chest Box (upper torso)
const CHEST_WIDTH_RATIO = 0.3;
const CHEST_HEIGHT_RATIO = 0.13;
const CHEST_Y_OFFSET = 0.2; // Starts where the head ends

// 3. Thighs Box (lower torso / legs)
const THIGHS_WIDTH_RATIO = 0.42;
const THIGHS_HEIGHT_RATIO = 0.4;
const THIGHS_Y_OFFSET = 0.33; // Starts where the chest ends

// 4. Hand Boxes
const HAND_WIDTH_RATIO = 0.1;
const HAND_HEIGHT_RATIO = 0.06;
const HAND_Y_OFFSET = 0.42;
const LEFT_HAND_X_OFFSET = 0.2;
const RIGHT_HAND_X_OFFSET = 0.68;

// --- INTERACTION LAYER CALIBRATION (smaller precise targets) ---
// 1. Precise Head (top of head for headpats)
const INT_HEAD_WIDTH = 0.15;
const INT_HEAD_HEIGHT = 0.1;
const INT_HEAD_Y = 0.03;

// 2. Precise Chest (center of chest)
const INT_CHEST_WIDTH = 0.15;
const INT_CHEST_HEIGHT = 0.08;
const INT_CHEST_Y = 0.22;

// 3. Precise Thighs (center of legs)
const INT_THIGHS_WIDTH = 0.2;
const INT_THIGHS_HEIGHT = 0.15;
const INT_THIGHS_Y = 0.45;
// -------------------------------------------------------------

// Focus (Face Tracking) — offset upward from center pivot toward the face.
const FACE_Y_OFFSET_RATIO = 0.35;
// ----------------------------------

/** Default startup expressions from GeniusHalo.model3.json. */
const DEFAULT_EXPRESSIONS = ["hide-badge"] as const;
/** Param93 value from hide-badge.exp3.json (Blend Add / Value 30). */
const PARAM_BADGE_HIDE = { id: "Param93", value: 30 } as const;
/** Param38 value that keeps cute-eyes / tear switch off. */
const PARAM_CUTE_EYES_OFF = { id: "Param38", value: 0 } as const;

declare global {
  interface Window {
    PIXI: typeof PIXI;
  }
}

/** Runtime Live2D model treated as a Pixi Container. */
type Live2DSprite = PIXI.Container & {
  anchor: PIXI.ObservablePoint;
  autoUpdate?: boolean;
  internalModel?: {
    renderer?: {
      setIsUsingHighPrecisionMask?: (value: boolean) => void;
      _clippingManager?: { _clippingMaskBufferSize?: number };
    };
    motionManager?: {
      groups: { idle?: string };
      on: (event: "motionFinish", listener: (group: string) => void) => void;
      off: (
        event: "motionFinish",
        listener?: (group: string) => void,
      ) => void;
    };
    coreModel?: {
      setParameterValueById: (id: string, value: number) => void;
    };
    focusController?: {
      focus: (x: number, y: number, instant?: boolean) => void;
    };
    on: (event: "beforeModelUpdate", listener: () => void) => void;
    off: (event: "beforeModelUpdate", listener?: () => void) => void;
  };
  motion?: (
    group: string,
    index?: number,
    priority?: number,
  ) => Promise<unknown>;
  expression?: (id?: number | string) => Promise<boolean>;
  focus?: (x: number, y: number, instant?: boolean) => void;
  update?: (dt: number) => void;
  destroy: (options?: boolean | PIXI.IDestroyOptions) => void;
};

type SavedPos = { x: number; y: number };

type MascotProps = {
  /** OS cursor samples from useClickThrough (works under click-through). */
  cursorRef?: MutableRefObject<GlobalCursor>;
  onContextMenuRequest?: (x: number, y: number) => void;
};

function readSavedPos(): SavedPos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPos;
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function persistPos(x: number, y: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
  } catch {
    // ignore
  }
}

/**
 * Live2D mascot on a transparent Pixi canvas.
 * Center-pivot anchor (0.5, 0.5) for upright rotation; Void Engine uses
 * model.getBounds() so off-screen detection matches the visible mesh.
 * Interaction uses a structural drag layer (5 pieces) plus a smaller
 * interaction layer (head / chest / thighs) for localized click targets.
 */
export function Mascot({ cursorRef, onContextMenuRequest }: MascotProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headHitboxRef = useRef<HTMLDivElement>(null);
  const chestHitboxRef = useRef<HTMLDivElement>(null);
  const thighsHitboxRef = useRef<HTMLDivElement>(null);
  const leftHandHitboxRef = useRef<HTMLDivElement>(null);
  const rightHandHitboxRef = useRef<HTMLDivElement>(null);
  const interactHeadRef = useRef<HTMLDivElement>(null);
  const interactChestRef = useRef<HTMLDivElement>(null);
  const interactThighsRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DSprite | null>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const fallbackCursorRef = useRef<GlobalCursor>(EMPTY_CURSOR);
  /** Latest normalized look target from cursor polling / pointer events. */
  const targetFocus = useRef({ x: 0, y: 0 });
  /** Smoothed look vector fed to focusController every Pixi frame. */
  const currentFocus = useRef({ x: 0, y: 0 });
  /** Intended stage position — ticker lerps model.x/y toward this. */
  const targetPosition = useRef({ x: 0, y: 0 });
  /** Intended rotation (radians) — 0 upright, Math.PI for top upside-down peeks. */
  const targetRotation = useRef(0);
  /** True while an autonomous peek-a-boo slide is in progress. */
  const isPeeking = useRef(false);
  /** True while culled in The Void (off-screen + renderable false). */
  const isDespawned = useRef(false);
  /** Interruptible AI Director / peek sequence timeouts. */
  const peekTimeouts = useRef<number[]>([]);

  const clearPeekTimeouts = useCallback(() => {
    for (const id of peekTimeouts.current) window.clearTimeout(id);
    peekTimeouts.current = [];
  }, []);

  const schedulePeek = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    peekTimeouts.current.push(id);
    return id;
  }, []);

  const setHitboxesVisible = useCallback((visible: boolean) => {
    const display = visible ? "block" : "none";
    for (const ref of [
      headHitboxRef,
      chestHitboxRef,
      thighsHitboxRef,
      leftHandHitboxRef,
      rightHandHitboxRef,
      interactHeadRef,
      interactChestRef,
      interactThighsRef,
    ]) {
      if (ref.current) ref.current.style.display = display;
    }
  }, []);

  /** Cancel peek / revive from Void so the user can drag normally. */
  const interruptAiDirector = useCallback(() => {
    clearPeekTimeouts();
    isPeeking.current = false;
    isDespawned.current = false;
    targetRotation.current = 0; // Smoothly upright via ticker lerp
    const model = modelRef.current;
    if (model) model.renderable = true;
    setHitboxesVisible(true);
  }, [clearPeekTimeouts, setHitboxesVisible]);

  const syncHitbox = useCallback(() => {
    if (isDespawned.current) {
      setHitboxesVisible(false);
      return;
    }

    const head = headHitboxRef.current;
    const chest = chestHitboxRef.current;
    const thighs = thighsHitboxRef.current;
    const leftHand = leftHandHitboxRef.current;
    const rightHand = rightHandHitboxRef.current;
    const intHead = interactHeadRef.current;
    const intChest = interactChestRef.current;
    const intThighs = interactThighsRef.current;
    const model = modelRef.current;
    if (
      !head ||
      !chest ||
      !thighs ||
      !leftHand ||
      !rightHand ||
      !intHead ||
      !intChest ||
      !intThighs ||
      !model
    ) {
      return;
    }

    setHitboxesVisible(true);

    const structural = [head, chest, thighs, leftHand, rightHand];
    const interactive = [intHead, intChest, intThighs];

    if (draggingRef.current) {
      // Full-window capture on structural pieces; disable interaction layer mid-drag.
      for (const el of structural) {
        el.style.left = "0px";
        el.style.top = "0px";
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.transform = "none";
        el.style.transformOrigin = "50% 50%";
      }
      for (const el of interactive) {
        el.style.pointerEvents = "none";
      }
      return;
    }

    try {
      // Layout in the model's upright local frame (center-pivot), then rotate
      // with model.rotation so hitboxes stay glued to body parts when flipped.
      const bodyW = Math.max(1, model.width);
      const bodyH = Math.max(1, model.height);
      const pivotX = model.x;
      const pivotY = model.y;
      const cos = Math.cos(model.rotation);
      const sin = Math.sin(model.rotation);
      const uprightLeft = pivotX - bodyW / 2;
      const uprightTop = pivotY - bodyH / 2;

      const applyHitbox = (
        el: HTMLDivElement,
        wRatio: number,
        hRatio: number,
        xOffsetW: number,
        yOffsetH: number,
        isCenteredX = true,
      ) => {
        const w = Math.max(1, bodyW * wRatio);
        const h = Math.max(1, bodyH * hRatio);

        const uprightX = isCenteredX
          ? uprightLeft + (bodyW - w) / 2
          : uprightLeft + bodyW * xOffsetW;
        const uprightY = uprightTop + bodyH * yOffsetH;

        // Hitbox center in upright stage space → rotate around model pivot
        const hx = uprightX + w / 2;
        const hy = uprightY + h / 2;
        const dx = hx - pivotX;
        const dy = hy - pivotY;
        const rx = pivotX + dx * cos - dy * sin;
        const ry = pivotY + dx * sin + dy * cos;

        el.style.left = "0px";
        el.style.top = "0px";
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transformOrigin = "50% 50%";
        el.style.transform = `translate(${rx - w / 2}px, ${ry - h / 2}px) rotate(${model.rotation}rad)`;
        el.style.pointerEvents = "auto";
      };

      // Structural drag / click-through layer
      applyHitbox(head, HEAD_WIDTH_RATIO, HEAD_HEIGHT_RATIO, 0, HEAD_Y_OFFSET, true);
      applyHitbox(
        chest,
        CHEST_WIDTH_RATIO,
        CHEST_HEIGHT_RATIO,
        0,
        CHEST_Y_OFFSET,
        true,
      );
      applyHitbox(
        thighs,
        THIGHS_WIDTH_RATIO,
        THIGHS_HEIGHT_RATIO,
        0,
        THIGHS_Y_OFFSET,
        true,
      );
      applyHitbox(
        leftHand,
        HAND_WIDTH_RATIO,
        HAND_HEIGHT_RATIO,
        LEFT_HAND_X_OFFSET,
        HAND_Y_OFFSET,
        false,
      );
      applyHitbox(
        rightHand,
        HAND_WIDTH_RATIO,
        HAND_HEIGHT_RATIO,
        RIGHT_HAND_X_OFFSET,
        HAND_Y_OFFSET,
        false,
      );

      // Precise interaction layer (sits above structural via z-index)
      applyHitbox(intHead, INT_HEAD_WIDTH, INT_HEAD_HEIGHT, 0, INT_HEAD_Y, true);
      applyHitbox(
        intChest,
        INT_CHEST_WIDTH,
        INT_CHEST_HEIGHT,
        0,
        INT_CHEST_Y,
        true,
      );
      applyHitbox(
        intThighs,
        INT_THIGHS_WIDTH,
        INT_THIGHS_HEIGHT,
        0,
        INT_THIGHS_Y,
        true,
      );
    } catch (e) {
      console.warn("Hitbox sync error:", e);
    }
  }, [setHitboxesVisible]);

  const placeModel = useCallback(
    (model: Live2DSprite, app: PIXI.Application) => {
      const targetH = app.screen.height * HEIGHT_RATIO;
      const scale = targetH / Math.max(1, model.height);
      model.scale.set(scale);
      // Center pivot — rotation (esp. upside-down peeks) orbits the mesh, not the feet.
      model.anchor.set(0.5, 0.5);

      const saved = readSavedPos();
      const preferred = saved ?? {
        x: app.screen.width / 2,
        // Bottom-ish spawn: center sits half a mesh above the bottom edge
        y: app.screen.height - model.height / 2,
      };

      model.x = preferred.x;
      model.y = preferred.y;
      model.rotation = 0;
      targetPosition.current = { x: preferred.x, y: preferred.y };
      targetRotation.current = 0;

      syncHitbox();
    },
    [syncHitbox],
  );

  /**
   * Map cursor → face-relative [-1, 1] look vector and store as the lerp target.
   * Actual focusController writes happen every frame in the Pixi ticker.
   * When upside-down (top peek), flip face offset + look axes so tracking
   * matches her local left/right and up/down.
   */
  const updateFocusFromClient = useCallback((clientX: number, clientY: number) => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;

    const view = app.view as HTMLCanvasElement;
    const rect = view.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const scaleX = app.screen.width / rect.width;
    const scaleY = app.screen.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    // Near π (top peek) — head sits below center in screen space
    const upsideDown = Math.cos(targetRotation.current) < -0.5;

    const faceX = model.x;
    const faceY = upsideDown
      ? model.y + model.height * FACE_Y_OFFSET_RATIO
      : model.y - model.height * FACE_Y_OFFSET_RATIO;

    const dx = canvasX - faceX;
    const dy = canvasY - faceY;

    let normalizedX = Math.max(
      -1,
      Math.min(1, dx / FOCUS_SENSITIVITY_RADIUS),
    );
    // Invert Y: DOM down is +, Live2D look-up is +.
    let normalizedY = Math.max(
      -1,
      Math.min(1, dy / FOCUS_SENSITIVITY_RADIUS),
    );
    normalizedY = -normalizedY;

    // Upside-down: her local axes are flipped vs the screen
    if (upsideDown) {
      normalizedX = -normalizedX;
      normalizedY = -normalizedY;
    }

    targetFocus.current = { x: normalizedX, y: normalizedY };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    // 1. Expose PIXI globally for the Live2D plugin (must precede Live2DModel.from)
    window.PIXI = PIXI;

    const width = Math.max(1, host.clientWidth || window.innerWidth);
    const height = Math.max(1, host.clientHeight || window.innerHeight);

    const app = new PIXI.Application({
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      width,
      height,
    });
    appRef.current = app;

    const view = app.view as HTMLCanvasElement;
    view.style.display = "block";
    view.style.width = "100%";
    view.style.height = "100%";
    view.style.pointerEvents = "none";
    host.appendChild(view);

    const activeCursor = cursorRef ?? fallbackCursorRef;

    const onTick = () => {
      const model = modelRef.current;
      const screenW = app.screen.width;
      const screenH = app.screen.height;

      const lerpRotation = (m: Live2DSprite) => {
        let diff = targetRotation.current - m.rotation;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        m.rotation += diff * ROTATION_LERP_SPEED;
      };

      // --- Void Engine: getBounds()-based 90% off-screen cull ---
      if (model && !isPeeking.current && !draggingRef.current && !isDespawned.current) {
        const bounds = model.getBounds();

        const offLeft = bounds.right < bounds.width * 0.4;
        const offRight = bounds.left > screenW - bounds.width * 0.4;
        const offTop = bounds.bottom < bounds.height * 0.4;
        const offBottom = bounds.top > screenH - bounds.height * 0.1;

        if (offLeft || offRight || offBottom || offTop) {
          // Slide further off using center-anchor targets
          if (offLeft) {
            targetPosition.current.x = -(model.width / 2) - 50;
          }
          if (offRight) {
            targetPosition.current.x = screenW + model.width / 2 + 50;
          }
          if (offTop) {
            targetPosition.current.y = -(model.height / 2) - 50;
          }
          if (offBottom) {
            targetPosition.current.y = screenH + model.height / 2 + 50;
          }

          if (
            bounds.right < 0 ||
            bounds.left > screenW ||
            bounds.bottom < 0 ||
            bounds.top > screenH
          ) {
            isDespawned.current = true;
            model.renderable = false;
            targetRotation.current = 0;
            model.rotation = 0;
            setHitboxesVisible(false);
          }
        }
      }

      // Culled in The Void — skip hitbox math / focus work
      if (isDespawned.current) {
        if (model && !draggingRef.current) {
          const speed = POS_LERP_SPEED;
          model.x += (targetPosition.current.x - model.x) * speed;
          model.y += (targetPosition.current.y - model.y) * speed;
          lerpRotation(model);
        }
        return;
      }

      syncHitbox();

      // Sample OS cursor into the lerp target (works under click-through).
      if (!draggingRef.current) {
        const { clientX, clientY } = activeCursor.current;
        updateFocusFromClient(clientX, clientY);
      }

      // Smooth toward target at display rate so low-frequency cursor polls don't jitter.
      currentFocus.current.x +=
        (targetFocus.current.x - currentFocus.current.x) * FOCUS_LERP_SPEED;
      currentFocus.current.y +=
        (targetFocus.current.y - currentFocus.current.y) * FOCUS_LERP_SPEED;

      const focusController = model?.internalModel?.focusController;
      if (focusController) {
        focusController.focus(currentFocus.current.x, currentFocus.current.y);
      }

      // Lerp stage position + rotation (drag / peek-a-boo share this path).
      if (model) {
        const speed = draggingRef.current ? POS_DRAG_LERP_SPEED : POS_LERP_SPEED;
        model.x += (targetPosition.current.x - model.x) * speed;
        model.y += (targetPosition.current.y - model.y) * speed;
        lerpRotation(model);
      }
    };

    /** Procedural breath / sway / expression locks — Live2D's own update cycle. */
    let onBeforeModelUpdate: (() => void) | null = null;
    /** Idle motionFinish listener — removed on teardown. */
    let onMotionFinish: ((group: string) => void) | null = null;
    /** AI Director interval id. */
    let aiIntervalId = 0;

    const resizeApp = () => {
      const w = Math.max(1, host.clientWidth || window.innerWidth);
      const h = Math.max(1, host.clientHeight || window.innerHeight);
      app.renderer.resize(w, h);
      const model = modelRef.current;
      if (model && !isDespawned.current) placeModel(model, app);
    };
    window.addEventListener("resize", resizeApp);

    void (async () => {
      try {
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

        // 2. Register the Ticker so the model actually advances frames
        Live2DModel.registerTicker(PIXI.Ticker);

        const model = (await Live2DModel.from(MODEL_URL, {
          autoInteract: false,
          autoHitTest: false,
          autoFocus: false,
          // Drive Cubism from the Application ticker (not only Ticker.shared).
          autoUpdate: true,
          ticker: app.ticker,
        })) as unknown as Live2DSprite;

        if (cancelled) {
          model.destroy();
          return;
        }

        // Large VTuber models need a bigger clip mask atlas or body meshes vanish.
        const clip = model.internalModel?.renderer;
        clip?.setIsUsingHighPrecisionMask?.(false);
        if (clip?._clippingManager) {
          clip._clippingManager._clippingMaskBufferSize = 1024;
        }

        modelRef.current = model;
        app.stage.addChild(model);
        placeModel(model, app);
        app.ticker.add(onTick);

        const internal = model.internalModel;
        const coreModel = internal?.coreModel;
        if (internal && coreModel) {
          onBeforeModelUpdate = () => {
            const time = Date.now() * 0.002;

            // Procedural breath only — neck/body angles owned by focusController
            const breath = (Math.sin(time) + 1) / 2;
            coreModel.setParameterValueById("ParamBreath", breath);

            // Startup parameter overrides (locked each frame)
            // hide-badge.exp3.json → Param93; cute-eyes off → Param38
            coreModel.setParameterValueById(PARAM_BADGE_HIDE.id, PARAM_BADGE_HIDE.value);
            coreModel.setParameterValueById(
              PARAM_CUTE_EYES_OFF.id,
              PARAM_CUTE_EYES_OFF.value,
            );
          };
          internal.on("beforeModelUpdate", onBeforeModelUpdate);

          // Force Idle motion loop when motion files are available.
          // Unhandled motion rejections can abort setup and freeze the model.
          try {
            if (internal.motionManager) {
              internal.motionManager.groups.idle = "Idle";
              onMotionFinish = (group: string) => {
                if (group === "Idle") {
                  void model.motion?.("Idle", 0, 1);
                }
              };
              internal.motionManager.on("motionFinish", onMotionFinish);
            }
            void model.motion?.("Idle", 0, 1);
          } catch (e) {
            console.warn(
              "Could not load Idle motion. Relying on procedural heartbeat.",
              e,
            );
          }

          // Apply default expression presets from model3.json
          for (const name of DEFAULT_EXPRESSIONS) {
            try {
              await model.expression?.(name);
            } catch {
              // Expression optional
            }
          }
        }

        // AI Director: Void peeks from Left / Right / Bottom-corners / Top (upside-down).
        aiIntervalId = window.setInterval(() => {
          if (cancelled || !isDespawned.current || isPeeking.current || draggingRef.current) {
            return;
          }

          const m = modelRef.current;
          const a = appRef.current;
          if (!m || !a) return;

          isPeeking.current = true;
          isDespawned.current = false;
          m.renderable = true;
          setHitboxesVisible(true);

          const screenW = a.screen.width;
          const screenH = a.screen.height;
          // 0 Left, 1 Right, 2 Bottom corners, 3 Top upside-down
          const edge = Math.floor(Math.random() * 4);

          let startX = 0;
          let startY = 0;
          let peekX = 0;
          let peekY = 0;
          let hopDirX = 0;
          let hopDirY = 0;
          let spawnRotation = 0;

          // Center-pivot (0.5, 0.5) spawn / peek math
          if (edge === 0) {
            // LEFT
            startX = -(m.width / 2);
            startY = screenH - m.height * 0.4;
            peekX = m.width * 0.15;
            peekY = startY;
            hopDirX = 40;
            hopDirY = -30;
          } else if (edge === 1) {
            // RIGHT
            startX = screenW + m.width / 2;
            startY = screenH - m.height * 0.4;
            peekX = screenW - m.width * 0.15;
            peekY = startY;
            hopDirX = -40;
            hopDirY = -30;
          } else if (edge === 2) {
            // BOTTOM CORNERS
            const isLeftCorner = Math.random() > 0.5;
            startX = isLeftCorner ? screenW * 0.2 : screenW * 0.8;
            startY = screenH + m.height / 2;
            peekX = startX;
            peekY = screenH - m.height * 0.03 + 150;
            hopDirX = 0;
            hopDirY = -40;
          } else {
            // TOP (UPSIDE DOWN) — hangs from ceiling about center
            startX = screenW * (0.2 + Math.random() * 0.6);
            startY = -(m.height / 2);
            peekX = startX;
            peekY = m.height * 0.15 - 220;
            hopDirX = 0;
            hopDirY = 40;
            spawnRotation = Math.PI;
          }

          // Instant spawn pose, then lerp toward peek
          m.x = startX;
          m.y = startY;
          m.rotation = spawnRotation;
          targetPosition.current = { x: peekX, y: peekY };
          targetRotation.current = spawnRotation;

          const abortable = (fn: () => void) => () => {
            if (cancelled || draggingRef.current) {
              isPeeking.current = false;
              return;
            }
            fn();
          };

          // Slide-in → diagonal/vertical double-hop → retreat to Void
          schedulePeek(
            abortable(() => {
              targetPosition.current = {
                x: peekX + hopDirX,
                y: peekY + hopDirY,
              };
              schedulePeek(
                abortable(() => {
                  targetPosition.current = { x: peekX, y: peekY };
                  schedulePeek(
                    abortable(() => {
                      targetPosition.current = {
                        x: peekX + hopDirX,
                        y: peekY + hopDirY,
                      };
                      schedulePeek(
                        abortable(() => {
                          targetPosition.current = { x: peekX, y: peekY };
                          schedulePeek(
                            abortable(() => {
                              targetPosition.current = {
                                x: startX,
                                y: startY,
                              };
                              // After slide-off, clear peek + upright for next spawn
                              schedulePeek(() => {
                                targetRotation.current = 0;
                                isPeeking.current = false;
                              }, 1000);
                            }),
                            3500,
                          );
                        }),
                        200,
                      );
                    }),
                    150,
                  );
                }),
                200,
              );
            }),
            1200,
          );
        }, AI_DIRECTOR_INTERVAL_MS);
      } catch (error) {
        console.error(
          `[Mascot] Failed to load Live2D model at ${MODEL_URL}.`,
          error,
        );
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resizeApp);
      window.clearInterval(aiIntervalId);
      clearPeekTimeouts();
      isPeeking.current = false;
      isDespawned.current = false;

      let isDestroyed = false;
      try {
        // 1. Detach Live2D listeners before tearing down WebGL
        const model = modelRef.current;
        const internal = model?.internalModel;
        if (internal) {
          if (onBeforeModelUpdate) {
            internal.off("beforeModelUpdate", onBeforeModelUpdate);
          } else {
            internal.off("beforeModelUpdate");
          }
          if (onMotionFinish) {
            internal.motionManager?.off("motionFinish", onMotionFinish);
          } else {
            internal.motionManager?.off("motionFinish");
          }
        }
        modelRef.current = null;

        // 2. Stop ticker callbacks so nothing runs against a dying context
        try {
          app.ticker.remove(onTick);
        } catch {
          // ticker may already be stopped
        }
        app.ticker.stop();

        // 3. Destroy Pixi + WebGL resources (removes canvas from DOM)
        app.destroy(true, {
          children: true,
          texture: true,
          baseTexture: true,
        });
        isDestroyed = true;
        appRef.current = null;
      } catch (e) {
        console.error("Error cleaning up Pixi Application:", e);
        // Fallback: ensure the canvas leaves the DOM even if destroy() failed
        if (!isDestroyed && view.parentNode) {
          view.parentNode.removeChild(view);
        }
        appRef.current = null;
        modelRef.current = null;
      }
    };
  }, [
    clearPeekTimeouts,
    cursorRef,
    placeModel,
    schedulePeek,
    setHitboxesVisible,
    syncHitbox,
    updateFocusFromClient,
  ]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const model = modelRef.current;
    if (!model) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    // Interrupt AI Director / revive from The Void
    interruptAiDirector();
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: targetPosition.current.x - e.clientX,
      y: targetPosition.current.y - e.clientY,
    };
    syncHitbox();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const model = modelRef.current;
    const app = appRef.current;
    if (!model || !app) return;

    updateFocusFromClient(e.clientX, e.clientY);

    if (!draggingRef.current) return;

    const nextX = e.clientX + dragOffsetRef.current.x;
    const nextY = e.clientY + dragOffsetRef.current.y;
    // Unclamped — Void Engine + getBounds() handle off-screen despawn.
    targetPosition.current = { x: nextX, y: nextY };
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;

    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    persistPos(targetPosition.current.x, targetPosition.current.y);
    syncHitbox();
  };

  const dragHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };

  /** Interaction-layer clicks: stop drag/bubble, also interrupt peek sequences. */
  const onInteract = useCallback(
    (zone: "head" | "chest" | "thighs") =>
      (e: ReactMouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();
        interruptAiDirector();
        if (zone === "head") console.log("Headpat triggered!");
        else if (zone === "chest") console.log("Chest poke triggered!");
        else console.log("Thighs touch triggered!");
      },
    [interruptAiDirector],
  );

  const blockDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const onContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      interruptAiDirector();
      onContextMenuRequest?.(e.clientX, e.clientY);
    },
    [interruptAiDirector, onContextMenuRequest],
  );

  useEffect(() => {
    return listenTimerComplete(async (detail) => {
      const model = modelRef.current;
      if (!model) return;
      interruptAiDirector();
      try {
        if (detail.mode === "pomodoro") {
          await model.expression?.(detail.phase === "focus" ? "happy" : "surprised");
          await model.motion?.("TapBody", 0, 2);
        } else if (detail.mode === "countdown") {
          await model.expression?.("surprised");
          await model.motion?.("Idle", 0, 2);
        }
      } catch {
        // Motion/expression IDs vary by model pack.
      }
      console.log("[Mascot] Timer completed:", detail.message);
    });
  }, [interruptAiDirector]);

  return (
    <div className="mascot-layer" aria-hidden={false}>
      <div ref={hostRef} className="mascot-canvas-host" />

      {/* --- Structural layer (drag + click-through) --- */}
      <div
        ref={headHitboxRef}
        data-interactive
        className="mascot-hitbox head-hitbox interactive"
        role="img"
        aria-label="Genius Halo — head"
        onContextMenu={onContextMenu}
        {...dragHandlers}
      />
      <div
        ref={chestHitboxRef}
        data-interactive
        className="mascot-hitbox chest-hitbox interactive"
        role="img"
        aria-label="Genius Halo — chest"
        onContextMenu={onContextMenu}
        {...dragHandlers}
      />
      <div
        ref={thighsHitboxRef}
        data-interactive
        className="mascot-hitbox thighs-hitbox interactive"
        role="img"
        aria-label="Genius Halo — thighs"
        onContextMenu={onContextMenu}
        {...dragHandlers}
      />
      <div
        ref={leftHandHitboxRef}
        data-interactive
        className="mascot-hitbox hand-hitbox interactive"
        role="img"
        aria-label="Genius Halo — left hand"
        onContextMenu={onContextMenu}
        {...dragHandlers}
      />
      <div
        ref={rightHandHitboxRef}
        data-interactive
        className="mascot-hitbox hand-hitbox interactive"
        role="img"
        aria-label="Genius Halo — right hand"
        onContextMenu={onContextMenu}
        {...dragHandlers}
      />

      {/* --- Interaction layer (precise clicks, above structural) --- */}
      <div
        ref={interactHeadRef}
        data-interactive
        className="mascot-hitbox interact-head interactive"
        role="button"
        aria-label="Genius Halo — headpat"
        style={{ cursor: "pointer", zIndex: 10 }}
        onPointerDown={blockDragStart}
        onClick={onInteract("head")}
        onContextMenu={onContextMenu}
      />
      <div
        ref={interactChestRef}
        data-interactive
        className="mascot-hitbox interact-chest interactive"
        role="button"
        aria-label="Genius Halo — chest poke"
        style={{ cursor: "pointer", zIndex: 10 }}
        onPointerDown={blockDragStart}
        onClick={onInteract("chest")}
        onContextMenu={onContextMenu}
      />
      <div
        ref={interactThighsRef}
        data-interactive
        className="mascot-hitbox interact-thighs interactive"
        role="button"
        aria-label="Genius Halo — thighs touch"
        style={{ cursor: "pointer", zIndex: 10 }}
        onPointerDown={blockDragStart}
        onClick={onInteract("thighs")}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
