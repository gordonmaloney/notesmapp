// src/components/ShapesLayer.jsx
import { useRef, useState, useEffect } from "react";

const BLUE = "#3b82f6";
const RING = 2;
const HANDLE = 10;
const EDGE_HIT = 14; // how close to the outline counts as a hit (screen px)
const DELETE_R = 6;

export default function ShapesLayer({
  shapes,
  camera,
  Z,
  selectedId,
  onSelect, // (id)
  onMoveByScreen, // (id, dxScreen, dyScreen)
  onResize, // (id, patchGeom in WORLD units)
  onDelete, // (id)
  onBackgroundClickAway, // () => void
  onSetNodeSelection, // (ids: number[])
}) {
  const svgRef = useRef(null);

  // screen → world
  const screenToWorldPt = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { wx: (sx - camera.x) / Z, wy: (sy - camera.y) / Z };
  };

  // shape drag/resize state
  const startRef = useRef(null); // { id, mode:'drag'|'resize', which:'a'|'b'|null, last:{x,y} }

  const startDrag = (e, shape, mode, which = null) => {
    if (e.button !== 0) return;
    onSelect?.(shape.id);
    startRef.current = {
      id: shape.id,
      mode,
      which,
      last: { x: e.clientX, y: e.clientY },
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    e.preventDefault();
    e.stopPropagation();
  };

  const onMove = (ev) => {
    const s = startRef.current;
    if (!s) return;

    if (s.mode === "drag") {
      const dx = ev.clientX - s.last.x;
      const dy = ev.clientY - s.last.y;
      s.last = { x: ev.clientX, y: ev.clientY };
      onMoveByScreen?.(s.id, dx, dy);
      return;
    }

    const { wx, wy } = screenToWorldPt(ev.clientX, ev.clientY);
    const sh = shapes.find((p) => p.id === s.id);
    if (!sh) return;

    if (sh.type === "rect" && s.mode === "resize") {
      onResize?.(s.id, {
        w: Math.max(0.5, wx - sh.x),
        h: Math.max(0.5, wy - sh.y),
      });
      return;
    }
    if (sh.type === "circle" && s.mode === "resize") {
      const r = Math.max(0.25, Math.hypot(wx - sh.cx, wy - sh.cy));
      onResize?.(s.id, { r });
      return;
    }
    if (sh.type === "line" && s.mode === "resize") {
      if (s.which === "a") onResize?.(s.id, { x1: wx, y1: wy });
      else onResize?.(s.id, { x2: wx, y2: wy });
      return;
    }
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    startRef.current = null;
  };

  const onDeleteClick = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(id);
  };

  // -------- empty-space marquee (screen coords) --------
  const CLICK_EPS = 3;
  const [marquee, setMarquee] = useState(null); // {x0,y0,x1,y1}
  const bgDownRef = useRef(null);
  const capturingRef = useRef(false);

  const onSvgPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target !== svgRef.current) return; // only blank SVG, not shape edges/handles

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    bgDownRef.current = { sx: e.clientX, sy: e.clientY, x0: x, y0: y };
    setMarquee({ x0: x, y0: y, x1: x, y1: y });

    svgRef.current.setPointerCapture?.(e.pointerId);
    capturingRef.current = true;
    e.preventDefault();
  };

  const onSvgPointerMove = (e) => {
    if (!bgDownRef.current || !capturingRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMarquee((m) => (m ? { ...m, x1: x, y1: y } : m));
  };

  const onSvgPointerUp = (e) => {
    if (!bgDownRef.current) return;

    svgRef.current.releasePointerCapture?.(e.pointerId);
    capturingRef.current = false;

    const rect = svgRef.current.getBoundingClientRect();
    const x1 = e.clientX - rect.left;
    const y1 = e.clientY - rect.top;

    const { sx, sy, x0, y0 } = bgDownRef.current;
    bgDownRef.current = null;

    const dx = Math.abs(e.clientX - sx);
    const dy = Math.abs(e.clientY - sy);

    if (dx < CLICK_EPS && dy < CLICK_EPS) {
      onBackgroundClickAway?.();
      setMarquee(null);
      return;
    }

    const xMin = Math.min(x0, x1);
    const xMax = Math.max(x0, x1);
    const yMin = Math.min(y0, y1);
    const yMax = Math.max(y0, y1);

    const ids = [];
    const wrappers = document.querySelectorAll("[data-node-wrapper][data-id]");
    wrappers.forEach((el) => {
      const r = el.getBoundingClientRect();
      const intersects =
        r.right >= rect.left + xMin &&
        r.left <= rect.left + xMax &&
        r.bottom >= rect.top + yMin &&
        r.top <= rect.top + yMax;
      if (intersects) {
        const idAttr = el.getAttribute("data-id");
        const id = idAttr ? Number(idAttr) : null;
        if (id != null) ids.push(id);
      }
    });

    if (ids.length > 0) onSetNodeSelection?.(ids);
    else onBackgroundClickAway?.();

    setMarquee(null);
  };

  useEffect(() => {
    const onCancel = () => setMarquee(null);
    window.addEventListener("blur", onCancel);
    return () => window.removeEventListener("blur", onCancel);
  }, []);

  return (
    <svg
      ref={svgRef}
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 6,
        pointerEvents: "auto",
      }}
    >
      {/* World space: x' = Z*x + camX, y' = Z*y + camY */}
      <g transform={`matrix(${Z} 0 0 ${Z} ${camera.x} ${camera.y})`}>
        {shapes.map((s) => {
          const selected = s.id === selectedId;

          if (s.type === "rect") {
            const x = s.x,
              y = s.y,
              w = s.w ?? 0,
              h = s.h ?? 0;
            return (
              <g key={s.id}>
                {/* ✅ edge-only hit: transparent stroke, no fill */}
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={EDGE_HIT}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  onPointerDown={(e) => startDrag(e, s, "drag")}
                  style={{ cursor: selected ? "move" : "pointer" }}
                />
                {/* visible shape (non-interactive) */}
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="#111"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {selected && (
                  <>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill="none"
                      stroke={BLUE}
                      strokeWidth={RING}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    {/* delete (TL) */}
                    <g transform={`translate(${x - 0.6},${y - 0.6})`}>
                      <circle
                        cx={0}
                        cy={0}
                        r={DELETE_R}
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(e) => onDeleteClick(e, s.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </g>
                    {/* resize (BR) */}
                    <g transform={`translate(${x + w + 0.6},${y + h + 0.6})`}>
                      <rect
                        x={-HANDLE / 2 / Z}
                        y={-HANDLE / 2 / Z}
                        width={HANDLE / Z}
                        height={HANDLE / Z}
                        fill="#fff"
                        stroke={BLUE}
                        strokeWidth={2 / Z}
                        rx={2 / Z}
                        onPointerDown={(e) => startDrag(e, s, "resize")}
                        style={{ cursor: "nwse-resize" }}
                      />
                    </g>
                  </>
                )}
              </g>
            );
          }

          if (s.type === "circle") {
            const { cx, cy, r = 0 } = s;
            return (
              <g key={s.id}>
                {/* ✅ edge-only hit */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={Math.max(r, 0.5)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={EDGE_HIT}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  onPointerDown={(e) => startDrag(e, s, "drag")}
                  style={{ cursor: selected ? "move" : "pointer" }}
                />
                {/* visible */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#111"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {selected && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={BLUE}
                      strokeWidth={RING}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    {/* delete (approx TL) */}
                    <g transform={`translate(${cx - r - 0.6},${cy - r - 0.6})`}>
                      <circle
                        cx={0}
                        cy={0}
                        r={DELETE_R}
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(e) => onDeleteClick(e, s.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </g>
                    {/* resize on right rim */}
                    <g transform={`translate(${cx + r + 0.6},${cy})`}>
                      <rect
                        x={-HANDLE / 2 / Z}
                        y={-HANDLE / 2 / Z}
                        width={HANDLE / Z}
                        height={HANDLE / Z}
                        fill="#fff"
                        stroke={BLUE}
                        strokeWidth={2 / Z}
                        rx={2 / Z}
                        onPointerDown={(e) => startDrag(e, s, "resize")}
                        style={{ cursor: "ew-resize" }}
                      />
                    </g>
                  </>
                )}
              </g>
            );
          }

          if (s.type === "line") {
            const { x1, y1, x2, y2 } = s;
            const mx = (x1 + x2) / 2,
              my = (y1 + y2) / 2;
            return (
              <g key={s.id}>
                {/* ✅ fat stroke-only hit */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={EDGE_HIT}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="stroke"
                  onPointerDown={(e) => startDrag(e, s, "drag")}
                  style={{ cursor: selected ? "move" : "pointer" }}
                />
                {/* visible */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#111"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {selected && (
                  <>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={BLUE}
                      strokeWidth={RING}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                    {/* delete at midpoint */}
                    <g transform={`translate(${mx},${my})`}>
                      <circle
                        cx={0}
                        cy={0}
                        r={DELETE_R}
                        fill="#ef4444"
                        stroke="#fff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        onPointerDown={(e) => onDeleteClick(e, s.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </g>
                    {/* end handles */}
                    <g transform={`translate(${x1},${y1})`}>
                      <rect
                        x={-HANDLE / 2 / Z}
                        y={-HANDLE / 2 / Z}
                        width={HANDLE / Z}
                        height={HANDLE / Z}
                        fill="#fff"
                        stroke={BLUE}
                        strokeWidth={2 / Z}
                        rx={2 / Z}
                        onPointerDown={(e) => startDrag(e, s, "resize", "a")}
                        style={{ cursor: "move" }}
                      />
                    </g>
                    <g transform={`translate(${x2},${y2})`}>
                      <rect
                        x={-HANDLE / 2 / Z}
                        y={-HANDLE / 2 / Z}
                        width={HANDLE / Z}
                        height={HANDLE / Z}
                        fill="#fff"
                        stroke={BLUE}
                        strokeWidth={2 / Z}
                        rx={2 / Z}
                        onPointerDown={(e) => startDrag(e, s, "resize", "b")}
                        style={{ cursor: "move" }}
                      />
                    </g>
                  </>
                )}
              </g>
            );
          }

          return null;
        })}
      </g>

      {/* screen-space marquee */}
      {marquee && (
        <rect
          x={Math.min(marquee.x0, marquee.x1)}
          y={Math.min(marquee.y0, marquee.y1)}
          width={Math.abs(marquee.x1 - marquee.x0)}
          height={Math.abs(marquee.y1 - marquee.y0)}
          fill="rgba(59,130,246,0.12)"
          stroke={BLUE}
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
