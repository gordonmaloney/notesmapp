import { useRef, useState, useEffect } from "react";
import { screenToWorld } from "../utils/math";
import { scale } from "../hooks/useCamera";

export default function DrawOverlay({ tool, camera, onDone, onCancel }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(null);
  const pid = useRef(null);
  const Z = scale(camera);

  // Esc cancels the tool
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onPointerDown = (e) => {
    if (e.button !== 0) {
      if (e.button === 2) onCancel?.(); // right-click cancels too
      return;
    }
    pid.current = e.pointerId;
    ref.current?.setPointerCapture?.(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    const start = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      camera
    );
    setDraft({ start, end: start });

    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerMove = (e) => {
    if (!draft || pid.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      camera
    );
    setDraft((d) => (d ? { ...d, end } : d));
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerUp = (e) => {
    if (pid.current !== e.pointerId) return;
    pid.current = null;
    ref.current?.releasePointerCapture?.(e.pointerId);

    let shape = null;
    if (draft) {
      const { start, end } = draft;
      if (tool === "line") {
        if (start.x !== end.x || start.y !== end.y) {
          shape = {
            type: "line",
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
          };
        }
      } else if (tool === "rect") {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        if (w > 0.01 && h > 0.01) shape = { type: "rect", x, y, w, h };
      } else if (tool === "circle") {
        const r = Math.hypot(end.x - start.x, end.y - start.y);
        if (r > 0.01) shape = { type: "circle", cx: start.x, cy: start.y, r };
      }
    }

    setDraft(null);
    onDone?.(shape);
    onCancel?.(); // 👈 auto-unselect tool after finishing (or tiny drag)

    e.preventDefault();
    e.stopPropagation();
  };

  // world → screen helpers for preview
  const w2sX = (wx) => wx * Z + camera.x;
  const w2sY = (wy) => wy * Z + camera.y;

  return (
    <div
      ref={ref}
      data-ui
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 500,
        cursor: "crosshair",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {draft && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {tool === "line" && (
            <line
              x1={w2sX(draft.start.x)}
              y1={w2sY(draft.start.y)}
              x2={w2sX(draft.end.x)}
              y2={w2sY(draft.end.y)}
              stroke="#111"
              strokeWidth={1}
            />
          )}
          {tool === "rect" && (
            <rect
              x={w2sX(Math.min(draft.start.x, draft.end.x))}
              y={w2sY(Math.min(draft.start.y, draft.end.y))}
              width={Math.abs(draft.end.x - draft.start.x) * Z}
              height={Math.abs(draft.end.y - draft.start.y) * Z}
              fill="rgba(59,130,246,0.08)"
              stroke="#111"
              strokeWidth={1}
            />
          )}
          {tool === "circle" && (
            <circle
              cx={w2sX(draft.start.x)}
              cy={w2sY(draft.start.y)}
              r={
                Math.hypot(
                  draft.end.x - draft.start.x,
                  draft.end.y - draft.start.y
                ) * Z
              }
              fill="rgba(59,130,246,0.08)"
              stroke="#111"
              strokeWidth={1}
            />
          )}
        </svg>
      )}
    </div>
  );
}
