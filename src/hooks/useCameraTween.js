// src/hooks/useCameraTween.js
import { useRef } from "react";
import { normalizeZoomPure, scale } from "./useCamera";

function cameraFromXyZ(x, y, Z) {
  let zoomBase = Z,
    zoomExp = 0;
  while (zoomBase >= 2) {
    zoomBase /= 2;
    zoomExp += 1;
  }
  while (zoomBase < 0.5) {
    zoomBase *= 2;
    zoomExp -= 1;
  }
  return { x, y, zoomBase, zoomExp };
}
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function useCameraTween(setCamera) {
  const tweenRef = useRef(null);
  const cancelCameraTween = () => {
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current.raf);
      tweenRef.current = null;
    }
  };

  const animateToCamera = (cameraRef, targetCam, { duration = 500 } = {}) => {
    cancelCameraTween();
    const startCam = cameraRef.current;
    const startZ = scale(startCam);
    const endZ = scale(targetCam);
    const logStartZ = Math.log(Math.max(1e-9, startZ));
    const logEndZ = Math.log(Math.max(1e-9, endZ));
    const { x: startX, y: startY } = startCam;
    const { x: endX, y: endY } = targetCam;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const u = easeInOutCubic(t);
      const logZ = logStartZ + (logEndZ - logStartZ) * u;
      const Zt = Math.exp(logZ);
      const xt = startX + (endX - startX) * u;
      const yt = startY + (endY - startY) * u;
      const cam = cameraFromXyZ(xt, yt, Zt);
      setCamera(cam);
      if (t < 1 && tweenRef.current) {
        tweenRef.current.raf = requestAnimationFrame(step);
      } else {
        tweenRef.current = null;
        setCamera({ ...targetCam });
      }
    };
    tweenRef.current = { raf: requestAnimationFrame(step) };
  };

  const jumpToView = (cameraRef, viewCam, animated = true) => {
    if (animated) animateToCamera(cameraRef, viewCam, { duration: 520 });
    else setCamera({ ...viewCam });
  };

  const resetView = () => {
    const { camera } = normalizeZoomPure({
      x: 0,
      y: 0,
      zoomBase: 1,
      zoomExp: 0,
    });
    setCamera(camera);
  };

  return {
    tweenRef,
    cancelCameraTween,
    animateToCamera,
    jumpToView,
    resetView,
  };
}
