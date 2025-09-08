// src/hooks/useCameraTween.js
import { useRef, useCallback } from "react";
import { normalizeZoomPure, scale } from "./useCamera";
import { screenToWorld } from "../utils/math";

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Tween camera to a target view WITHOUT bouncing:
 * - Interpolates world center linearly
 * - Zooms with easing
 * - Recomputes x/y each frame so the chosen world point stays at viewport center
 */
export function useCameraTween(setCamera) {
  const rafRef = useRef(0);

  const cancelCameraTween = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const jumpToView = useCallback(
    (cameraRef, containerRef, targetCam, animate = true, opts) => {
      cancelCameraTween();

      const { camera: fromNorm } = normalizeZoomPure(cameraRef.current);
      const { camera: toNorm } = normalizeZoomPure(targetCam);

      const rect = containerRef?.current?.getBoundingClientRect?.() || {
        width: window.innerWidth,
        height: window.innerHeight,
        left: 0,
        top: 0,
      };
      const cx = rect.width / 2;
      const cy = rect.height / 2;

      // World point currently under screen center (anchor)
      const anchorFrom = screenToWorld({ x: cx, y: cy }, fromNorm);
      const anchorTo = screenToWorld({ x: cx, y: cy }, toNorm);

      if (!animate) {
        // Set exactly to the target, but ensure it’s normalized
        setCamera(() => ({ ...toNorm }));
        return;
      }

      const duration = Math.max(120, Math.min(900, opts?.duration ?? 480));
      const t0 = performance.now();

      const tick = () => {
        const now = performance.now();
        let s = (now - t0) / duration;
        if (s >= 1) s = 1;
        const u = easeInOutCubic(s);

        // Interpolate the WORLD center point linearly
        const wcx = anchorFrom.x + (anchorTo.x - anchorFrom.x) * u;
        const wcy = anchorFrom.y + (anchorTo.y - anchorFrom.y) * u;

        // Interpolate zoomExp with easing
        const zExp = fromNorm.zoomExp + (toNorm.zoomExp - fromNorm.zoomExp) * u;
        const next = { ...fromNorm, zoomBase: 1, zoomExp: zExp };

        // Choose x/y so that (wcx,wcy) lands on screen center at this zoom
        const Z = scale(next);
        next.x = cx - wcx * Z;
        next.y = cy - wcy * Z;

        const { camera: normalized } = normalizeZoomPure(next);
        setCamera(() => normalized);

        if (s < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = 0;
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [cancelCameraTween, setCamera]
  );

  const resetView = useCallback(
    (cameraRef, containerRef, animate = true) => {
      // Home view target
      const home = { x: 0, y: 0, zoomBase: 1, zoomExp: 0 };
      jumpToView(cameraRef, containerRef, home, animate);
    },
    [jumpToView]
  );

  return { cancelCameraTween, jumpToView, resetView };
}

export default useCameraTween;
