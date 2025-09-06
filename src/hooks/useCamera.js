// hooks/useCamera.js
import { useState, useCallback } from "react";

export function useCamera(initial = { x: 0, y: 0, zoomBase: 1, zoomExp: 0 }) {
  const [camera, setCamera] = useState(initial);
  const setZoom = useCallback((propose) => setCamera((c) => propose(c)), []);
  return { camera, setCamera, setZoom };
}

// Total scale
export function scale(c) {
  return c.zoomBase * Math.pow(2, c.zoomExp);
}

// HYSTERESIS normalization: widen the band to reduce flips while zooming
export function normalizeZoomPure(c) {
  let { zoomBase, zoomExp } = c;
  let k = 1;

  // widen thresholds: only normalize when clearly beyond bounds
  while (zoomBase >= 2.2) {
    zoomBase /= 2;
    zoomExp += 1;
    k *= 1; // NOTE: with your current jolt-free model we DO NOT rebase world
  }
  while (zoomBase < 0.45) {
    zoomBase *= 2;
    zoomExp -= 1;
    k *= 1; // likewise, no world rebase here
  }

  return { camera: { ...c, zoomBase, zoomExp }, scaleFactor: k }; // k stays 1
}
