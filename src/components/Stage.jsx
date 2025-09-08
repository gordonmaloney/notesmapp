// src/components/Stage.jsx
import { useRef } from "react";
import { normalizeZoomPure, scale } from "../hooks/useCamera";
import { screenToWorld } from "../utils/math";

// Tuning
const PINCH_ZOOM_SENSITIVITY = 0.45;
const TAP_MAX_DELAY = 300;
const TAP_MAX_DIST = 28;
const PAN_ACTIVATE_PX = 6;
const CENTER_SMOOTH = 0.18;
const TWO_FINGER_PAN_GAIN = 1.12;

export default function Stage({
  containerRef,
  style,
  // from usePanZoom
  panHandlers, // { onPointerDown, onPointerMove, endPan, onPointerLeave, onKeyZoom? }
  // camera
  cameraRef,
  setCamera,
  cancelCameraTween,
  // higher-level clicks
  onDoubleClick,
  onClick,
  children,
}) {
  const activePointers = useRef(new Map());
  const touchCount = useRef(0);
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });
  const pinchState = useRef(null);
  const suppressClickUntilRef = useRef(0);

  // Single-finger pan state
  const panState = useRef({
    primaryId: null,
    startX: 0,
    startY: 0,
    isPanning: false,
  });

  const startPanIfNeeded = (e) => {
    if (pinchState.current || activePointers.current.size !== 1) return;
    if (panState.current.isPanning) return;

    const p = activePointers.current.get(panState.current.primaryId);
    if (!p) return;
    const dx = (e.clientX ?? p.x) - panState.current.startX;
    const dy = (e.clientY ?? p.y) - panState.current.startY;
    if (dx * dx + dy * dy >= PAN_ACTIVATE_PX * PAN_ACTIVATE_PX) {
      panState.current.isPanning = true;
      try {
        e.currentTarget.setPointerCapture?.(panState.current.primaryId);
      } catch {}
      panHandlers.onPointerDown?.(e);
    }
  };

  // ====== Capture-phase handlers ======
  const onPointerDownCapture = (e) => {
    if (e.pointerType === "touch") touchCount.current += 1;

    if (!activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (panState.current.primaryId == null) {
      panState.current.primaryId = e.pointerId;
      panState.current.startX = e.clientX;
      panState.current.startY = e.clientY;
      panState.current.isPanning = false;
    }

    // Synthetic double-tap (touch)
    if (e.pointerType === "touch") {
      const now = performance.now();
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { t, x: lx, y: ly } = lastTapRef.current;
      const isQuick = now - t < TAP_MAX_DELAY;
      const isClose = Math.hypot(x - lx, y - ly) < TAP_MAX_DIST;

      if (isQuick && isClose) {
        // IMPORTANT: do NOT preventDefault here (Android keyboard quirk).
        suppressClickUntilRef.current = now + 400; // swallow trailing click
        onDoubleClick?.(e); // let Canvas create + focus synchronously
        lastTapRef.current = { t: 0, x: 0, y: 0 };
        e.stopPropagation?.(); // keep children from reacting
        return;
      } else {
        lastTapRef.current = { t: now, x, y };
      }
    }

    // Two-finger pinch/pan: block children while gesturing
    if (activePointers.current.size === 2 && touchCount.current >= 2) {
      cancelCameraTween?.();

      if (panState.current.isPanning) {
        panHandlers.endPan?.(e);
        panState.current.isPanning = false;
      }

      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {}

      const pts = [...activePointers.current.values()];
      const startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const center = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      pinchState.current = {
        startDist: Math.max(0.0001, startDist),
        startCam: { ...cameraRef.current },
        prevCenter: center,
      };

      e.stopPropagation?.();
      return;
    }
  };

  const onPointerMoveCapture = (e) => {
    const events =
      typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
    const last = events[events.length - 1];

    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, {
        x: last.clientX,
        y: last.clientY,
      });
    }

    if (activePointers.current.size === 2 && pinchState.current) {
      // Prevent page scroll; OK on Android.
      e.preventDefault?.();

      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const centerNow = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];

      const { startDist, startCam, prevCenter } = pinchState.current;
      if (startDist <= 0.0001) {
        pinchState.current = {
          startDist: dist || 0.0001,
          startCam: { ...cameraRef.current },
          prevCenter: centerNow,
        };
        return;
      }

      const rawFactor = dist / startDist;
      const dampedExp =
        Math.log2(Math.max(0.02, rawFactor)) * PINCH_ZOOM_SENSITIVITY;

      setCamera(() => {
        const next = { ...startCam, zoomExp: startCam.zoomExp + dampedExp };
        const rect = containerRef.current.getBoundingClientRect();
        const centerScreen = {
          x: centerNow[0] - rect.left,
          y: centerNow[1] - rect.top,
        };

        const w0 = screenToWorld(centerScreen, startCam);
        const w1 = screenToWorld(centerScreen, next);
        next.x += w0.x - w1.x;
        next.y += w0.y - w1.y;

        // Smooth two-finger pan
        const smoothedCenter = [
          prevCenter[0] + (centerNow[0] - prevCenter[0]) * CENTER_SMOOTH,
          prevCenter[1] + (centerNow[1] - prevCenter[1]) * CENTER_SMOOTH,
        ];
        const dxPx = (smoothedCenter[0] - prevCenter[0]) * TWO_FINGER_PAN_GAIN;
        const dyPx = (smoothedCenter[1] - prevCenter[1]) * TWO_FINGER_PAN_GAIN;

        const Zc = scale(next);
        next.x -= dxPx / Zc;
        next.y -= dyPx / Zc;

        return normalizeZoomPure(next).camera;
      });

      pinchState.current.prevCenter = [
        pinchState.current.prevCenter[0] +
          (centerNow[0] - pinchState.current.prevCenter[0]) * CENTER_SMOOTH,
        pinchState.current.prevCenter[1] +
          (centerNow[1] - pinchState.current.prevCenter[1]) * CENTER_SMOOTH,
      ];

      e.stopPropagation?.();
      return;
    }

    // Single-finger pan
    if (
      activePointers.current.size === 1 &&
      e.pointerId === panState.current.primaryId &&
      !pinchState.current
    ) {
      startPanIfNeeded(last);
      if (panState.current.isPanning) {
        panHandlers.onPointerMove?.(e);
        e.stopPropagation?.();
        e.preventDefault?.();
      }
    }
  };

  const onPointerUpCapture = (e) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}

    activePointers.current.delete(e.pointerId);

    if (activePointers.current.size < 2) pinchState.current = null;

    if (e.pointerId === panState.current.primaryId) {
      if (panState.current.isPanning) panHandlers.endPan?.(e);
      panState.current.isPanning = false;
      panState.current.primaryId = null;
    }

    if (e.pointerType === "touch") {
      touchCount.current = Math.max(0, touchCount.current - 1);
    }
  };

  const onPointerCancelCapture = (e) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}

    activePointers.current.delete(e.pointerId);

    if (e.pointerId === panState.current.primaryId) {
      if (panState.current.isPanning) panHandlers.endPan?.(e);
      panState.current.isPanning = false;
      panState.current.primaryId = null;
    }

    if (activePointers.current.size < 2) pinchState.current = null;

    if (e.pointerType === "touch") {
      touchCount.current = Math.max(0, touchCount.current - 1);
    }
  };

  const onClickCapture = (e) => {
    if (performance.now() < suppressClickUntilRef.current) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
  };

  return (
    <div
      ref={containerRef}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancelCapture={onPointerCancelCapture}
      onClickCapture={onClickCapture}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#fff",
        userSelect: "none",
        touchAction: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
        overscrollBehavior: "none",
        cursor: "default",
        ...(style || {}),
      }}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      onPointerLeave={panHandlers.onPointerLeave}
    >
      {children}
    </div>
  );
}
