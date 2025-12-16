// src/hooks/usePanZoom.js
import { useEffect, useRef } from "react";
import { screenToWorld } from "../utils/math";
import { scale, normalizeZoomPure } from "./useCamera";

const BASE_SPEED = 0.01;
const KEY_FACTOR = 1.1;
const SNAP_AT_NORMALIZE = true;
const SNAP_PX = 0.5;

export function usePanZoom(
  containerRef,
  cameraRef,
  setCamera,
  cancelCameraTween,
  interactionDep
) {
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);
  const hoverRef = useRef({ inside: false, ax: 0, ay: 0 });

  useEffect(() => {
    const kd = (e) => {
      if (e.code === "Space") spaceDown.current = true;
    };
    const ku = (e) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", kd, { passive: true });
    window.addEventListener("keyup", ku, { passive: true });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const zoomAt = (ax, ay, factor) => {
    cancelCameraTween();
    const pre = cameraRef.current;
    const W = screenToWorld({ x: ax, y: ay }, pre);
    const proposed = { ...pre, zoomBase: pre.zoomBase * factor };
    const { camera: post } = normalizeZoomPure(proposed);
    const Zpost = scale(post);
    let newX = ax - W.x * Zpost;
    let newY = ay - W.y * Zpost;
    const didNormalize = post.zoomExp !== pre.zoomExp;
    if (SNAP_AT_NORMALIZE && didNormalize) {
      const snap = (v) => Math.round(v / SNAP_PX) * SNAP_PX;
      newX = snap(newX);
      newY = snap(newY);
    }
    setCamera({ ...post, x: newX, y: newY });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev) => {
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        const deltaPx =
          ev.deltaMode === 1
            ? ev.deltaY * 16
            : ev.deltaMode === 2
            ? ev.deltaY * 800
            : ev.deltaY;
        const factor = Math.exp(-deltaPx * BASE_SPEED);
        const rect = el.getBoundingClientRect();
        const ax = ev.clientX - rect.left;
        const ay = ev.clientY - rect.top;
        zoomAt(ax, ay, factor);
        cancelCameraTween();
        return;
      }
      setCamera((c) => ({ ...c, x: c.x - ev.deltaX, y: c.y - ev.deltaY }));
      cancelCameraTween();
      ev.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, setCamera, interactionDep]);

  const onPointerDown = (e) => {
    const left = e.button === 0,
      mid = e.button === 1;
    if (mid || (left && (e.shiftKey || spaceDown.current))) {
      cancelCameraTween();
      isPanning.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };
  const onPointerMove = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    hoverRef.current = {
      inside: true,
      ax: e.clientX - rect.left,
      ay: e.clientY - rect.top,
    };
    if (!isPanning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };
  const endPan = (e) => {
    if (!isPanning.current) return;
    isPanning.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerLeave = () => {
    hoverRef.current.inside = false;
  };

  const onKeyZoom = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { inside, ax: hx, ay: hy } = hoverRef.current;
    const ax = inside ? hx : rect.width / 2;
    const ay = inside ? hy : rect.height / 2;
    if (
      e.key === "=" ||
      e.key === "+" ||
      e.code === "Equal" ||
      e.code === "NumpadAdd"
    ) {
      e.preventDefault();
      zoomAt(ax, ay, 1.1);
    }
    if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
      e.preventDefault();
      zoomAt(ax, ay, 1 / 1.1);
    }
  };

  return { onPointerDown, onPointerMove, endPan, onPointerLeave, onKeyZoom };
}
