// src/components/Canvas.jsx
import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useCamera, scale, normalizeZoomPure } from "../hooks/useCamera";
import { screenToWorld } from "../utils/math";
import Grid from "./Grid";
import NodesLayer from "./NodesLayer";
import ShapesLayer from "./ShapesLayer";
import DrawOverlay from "./DrawOverlay";

const BASE_SPEED = 0.01;
const KEY_FACTOR = 1.1;
const SNAP_AT_NORMALIZE = true;
const SNAP_PX = 0.5;

const BASE_FONT_PX = 14;
const NEW_NODE_FONT_PX = 18;

export default function Canvas() {
  const { camera, setCamera } = useCamera();
  const [nodes, setNodes] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]); // nodes multi-select

  // 🔷 shapes
  const [shapes, setShapes] = useState([]); // {id,type:'line'|'rect'|'circle', ...world geom}
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [activeTool, setActiveTool] = useState(null); // 'line'|'rect'|'circle'|null

  const containerRef = useRef(null);

  // Panning state
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);

  // Hover (for key zoom anchoring)
  const hoverRef = useRef({ inside: false, ax: 0, ay: 0 });

  // live camera in ref
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Space toggles panning
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === "Space") spaceDown.current = true;
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown, { passive: true });
    window.addEventListener("keyup", onKeyUp, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Blur helper (for dropping focus from contentEditable)
  const blurActiveEditable = () => {
    const ae = document.activeElement;
    if (
      ae &&
      (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
    )
      ae.blur();
  };

  // ESC clears node selection & shape selection and blurs
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.key === "Escape" &&
        !(
          e.target?.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)
        )
      ) {
        setSelectedIds([]);
        setSelectedShapeId(null);
        blurActiveEditable();
        setActiveTool(null)
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Anchor-locked zoom helper
  const zoomAt = (ax, ay, factor) => {
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
    flushSync(() => setCamera({ ...post, x: newX, y: newY }));
  };

  // Wheel: ctrl/cmd zoom, else pan
  const handleWheelZoom = (e) => {
    const deltaPx =
      e.deltaMode === 1
        ? e.deltaY * 16
        : e.deltaMode === 2
        ? e.deltaY * 800
        : e.deltaY;
    const factor = Math.exp(-deltaPx * BASE_SPEED);
    const rect = containerRef.current.getBoundingClientRect();
    const ax = e.clientX - rect.left;
    const ay = e.clientY - rect.top;
    zoomAt(ax, ay, factor);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev) => {
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        handleWheelZoom(ev);
        return;
      }
      setCamera((c) => ({ ...c, x: c.x - ev.deltaX, y: c.y - ev.deltaY }));
      ev.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setCamera]);

  // Background pointer (panning + hover)
  const onPointerDown = (e) => {
    const left = e.button === 0,
      mid = e.button === 1;
    // DON’T deselect here; NodesLayer owns click-away (preserves marquee)
    if (mid || (left && (e.shiftKey || spaceDown.current))) {
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

  // Reset & key zoom (= / -)
  const resetView = () =>
    flushSync(() => setCamera({ x: 0, y: 0, zoomBase: 1, zoomExp: 0 }));
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.target &&
        (e.target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      )
        return;
      if (e.key === "0") {
        e.preventDefault();
        resetView();
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { inside, ax: hx, ay: hy } = hoverRef.current;
      const ax = inside ? hx : rect.width / 2,
        ay = inside ? hy : rect.height / 2;
      if (
        e.key === "=" ||
        e.key === "+" ||
        e.code === "Equal" ||
        e.code === "NumpadAdd"
      ) {
        e.preventDefault();
        zoomAt(ax, ay, KEY_FACTOR);
        return;
      }
      if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        zoomAt(ax, ay, 1 / KEY_FACTOR);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Double-click to add node
  const handleDoubleClick = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(screen, cameraRef.current);
    const id = Date.now();
    const Zc = scale(cameraRef.current);
    const nodeScale = NEW_NODE_FONT_PX / BASE_FONT_PX / Zc;
    setNodes((ns) => [
      ...ns,
      { id, x: world.x, y: world.y, text: "", scale: nodeScale },
    ]);
    setFocusId(id);
    setSelectedIds([id]);
    setSelectedShapeId(null); // deselect shape if any
  };

  // Node movement/scaling/deletion
  const moveSelectedByScreen = (dx, dy) => {
    if (!selectedIds.length) return;
    const Zc = scale(cameraRef.current);
    const dxW = dx / Zc,
      dyW = dy / Zc;
    setNodes((ns) =>
      ns.map((n) =>
        selectedIds.includes(n.id) ? { ...n, x: n.x + dxW, y: n.y + dyW } : n
      )
    );
  };
  const setNodeScale = (id, s) => {
    const clamp = (v) => Math.min(20, Math.max(0.05, v));
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, scale: clamp(s) } : n))
    );
  };
  const deleteSelectedNodes = () => {
    if (!selectedIds.length) return;
    setNodes((ns) => ns.filter((n) => !selectedIds.includes(n.id)));
    setSelectedIds([]);
    setFocusId(null);
  };
  const combineSelected = ({ ids, combinedText, avgX, avgY, avgScale }) => {
    if (!ids || ids.length < 2) return;
    const id = Date.now();
    setNodes((ns) => [
      ...ns.filter((n) => !ids.includes(n.id)),
      { id, x: avgX, y: avgY, text: combinedText, scale: avgScale },
    ]);
    setSelectedIds([id]);
    setFocusId(id);
  };

  // 🔷 Shape helpers
  const addShape = (shape) => {
    const id = Date.now();
    setShapes((ss) => [...ss, { id, ...shape }]);
    setSelectedShapeId(id);
    setSelectedIds([]); // deselect nodes when selecting a shape
    blurActiveEditable();
  };
  const updateShape = (id, updater) => {
    setShapes((ss) =>
      ss.map((s) =>
        s.id === id
          ? { ...s, ...(typeof updater === "function" ? updater(s) : updater) }
          : s
      )
    );
  };
  const deleteShape = (id) => {
    setShapes((ss) => ss.filter((s) => s.id !== id));
    setSelectedShapeId((sid) => (sid === id ? null : sid));
  };

  const Z = scale(camera);



  const clearSelectionsAndBlur = () => {
    setSelectedIds([]);
    setSelectedShapeId(null);
    const ae = document.activeElement;
    if (
      ae &&
      (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
    ) {
      ae.blur();
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        overflow: "hidden",
        background: "#fff",
        userSelect: "none",
        touchAction: "none",
        overscrollBehavior: "none",
        cursor: isPanning.current ? "grabbing" : "default",
      }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={onPointerLeave}
    >
      {/* Right-side toolbar */}
      <div
        data-ui
        style={{
          position: "absolute",
          top: "50%",
          right: 12,
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 1000,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {[
          { key: "line", label: "／" },
          { key: "rect", label: "▭" },
          { key: "circle", label: "◯" },
        ].map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveTool((t) => (t === b.key ? null : b.key))}
            title={`Draw ${b.key}`}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: activeTool === b.key ? "#eef2ff" : "#fff",
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: "36px",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      <Grid camera={camera} />

      {/* Shapes under nodes (so shapes don't block text editing) */}
      <ShapesLayer
        shapes={shapes}
        camera={camera}
        Z={Z}
        selectedId={selectedShapeId}
        onSelect={(id) => {
          setSelectedShapeId(id);
          setSelectedIds([]);
          blurActiveEditable();
        }}
        onMoveByScreen={(id, dx, dy) => {
          const Zc = scale(cameraRef.current);
          const dxW = dx / Zc,
            dyW = dy / Zc;
          updateShape(id, (s) => {
            if (s.type === "line")
              return {
                ...s,
                x1: s.x1 + dxW,
                y1: s.y1 + dyW,
                x2: s.x2 + dxW,
                y2: s.y2 + dyW,
              };
            if (s.type === "rect") return { ...s, x: s.x + dxW, y: s.y + dyW };
            if (s.type === "circle")
              return { ...s, cx: s.cx + dxW, cy: s.cy + dyW };
            return s;
          });
        }}
        onResize={(id, newGeom) => updateShape(id, newGeom)}
        onDelete={(id) => deleteShape(id)}
        onBackgroundClickAway={clearSelectionsAndBlur}
        onSetNodeSelection={setSelectedIds}
      />

      {/* Nodes on top */}
      <NodesLayer
        nodes={nodes}
        Z={Z}
        camera={camera}
        focusId={focusId}
        selectedIds={selectedIds}
        onSetSelection={setSelectedIds}
        onSelectOne={(id) => {
          setSelectedIds([id]);
          setSelectedShapeId(null);
        }}
        onToggleOne={(id) =>
          setSelectedIds((s) =>
            s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
          )
        }
        onDragSelectedByScreen={moveSelectedByScreen}
        onGroupScaleCommit={(factor) => {
          const clamp = (v) => Math.min(20, Math.max(0.05, v));
          setNodes((ns) =>
            ns.map((n) =>
              selectedIds.includes(n.id)
                ? { ...n, scale: clamp((n.scale ?? 1) * factor) }
                : n
            )
          );
        }}
        onBackgroundClickAway={() => {
          // clear BOTH selections and blur editor
          setSelectedIds([]);
          setSelectedShapeId(null);
          const ae = document.activeElement;
          if (
            ae &&
            (ae.isContentEditable ||
              /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
          ) {
            ae.blur();
          }
        }}
        onScaleNode={(id, newScale) => setNodeScale(id, newScale)}
        onDeleteNode={(id) => {
          setNodes((ns) => ns.filter((n) => n.id !== id));
          setSelectedIds((sel) => sel.filter((x) => x !== id));
        }}
        onDeleteSelected={deleteSelectedNodes}
        onCombineSelected={combineSelected}
        onChange={(id, text) =>
          setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, text } : n)))
        }
      />

      {/* Draw overlay (captures drag to create shape) */}
      {activeTool && (
        <DrawOverlay
          tool={activeTool}
          camera={camera}
          onDone={(shapeOrNull) => {
            if (shapeOrNull) addShape(shapeOrNull);
            setActiveTool(null);
          }}
          onCancel={() => setActiveTool(null)} // 👈 Esc / right-click cancels
        />
      )}
    </div>
  );
}
