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

// ─── Persistence ────────────────────────────────────────────────────────────
const STORAGE_KEY = "infcanvas.v1";

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // basic validation/sanitization
    const coerceNum = (n, d = 0) =>
      typeof n === "number" && isFinite(n) ? n : d;

    // camera
    let cam =
      data.camera && typeof data.camera === "object" ? data.camera : null;
    if (cam) {
      cam = {
        x: coerceNum(cam.x, 0),
        y: coerceNum(cam.y, 0),
        zoomBase: coerceNum(cam.zoomBase, 1),
        zoomExp: Math.trunc(coerceNum(cam.zoomExp, 0)),
      };
      const { camera: norm } = normalizeZoomPure(cam);
      cam = norm;
    }

    // nodes
    const nodes = Array.isArray(data.nodes)
      ? data.nodes.map((n) => ({
          id: n.id ?? Date.now() + Math.random(),
          x: coerceNum(n.x, 0),
          y: coerceNum(n.y, 0),
          text: typeof n.text === "string" ? n.text : "",
          scale: (() => {
            const s = coerceNum(n.scale, 1);
            return Math.min(20, Math.max(0.05, s));
          })(),
        }))
      : [];

    // shapes
    const shapes = Array.isArray(data.shapes)
      ? data.shapes.filter(
          (s) =>
            s &&
            typeof s === "object" &&
            (s.type === "line" || s.type === "rect" || s.type === "circle")
        )
      : [];

    // views
    const views = Array.isArray(data.views)
      ? data.views.map((v) => ({
          id: v.id ?? Date.now() + Math.random(),
          name: typeof v.name === "string" ? v.name : "View",
          camera: v.camera
            ? normalizeZoomPure({
                x: coerceNum(v.camera.x, 0),
                y: coerceNum(v.camera.y, 0),
                zoomBase: coerceNum(v.camera.zoomBase, 1),
                zoomExp: Math.trunc(coerceNum(v.camera.zoomExp, 0)),
              }).camera
            : { x: 0, y: 0, zoomBase: 1, zoomExp: 0 },
        }))
      : null;

    return { camera: cam, nodes, shapes, views };
  } catch {
    return null;
  }
}

function savePersisted(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode errors
  }
}
// ───────────────────────────────────────────────────────────────────────────

export default function Canvas() {
  const { camera, setCamera } = useCamera();
  const [nodes, setNodes] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // 🔷 shapes
  const [shapes, setShapes] = useState([]);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [activeTool, setActiveTool] = useState(null); // 'line'|'rect'|'circle'|null

  // 🔷 frames (saved views)
  const [views, setViews] = useState([
    {
      id: "home",
      name: "Home",
      camera: { x: 0, y: 0, zoomBase: 1, zoomExp: 0 },
    },
  ]);
  const [editingViewId, setEditingViewId] = useState(null);
  const [editingName, setEditingName] = useState("");

  // persistence: load once on mount
  useEffect(() => {
    const data = loadPersisted();
    if (!data) return;
    if (data.nodes) setNodes(data.nodes);
    if (data.shapes) setShapes(data.shapes);
    if (data.views && data.views.length) setViews(data.views);
    if (data.camera) flushSync(() => setCamera(data.camera));
  }, [setCamera]);

  // persistence: debounce saves on changes
  const saveTimer = useRef(null);
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = {
      v: 1,
      nodes,
      shapes,
      views,
      camera,
    };
    saveTimer.current = setTimeout(() => {
      savePersisted(snapshot);
      saveTimer.current = null;
    }, 250);
  };
  useEffect(() => {
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, shapes, views, camera]);

  const containerRef = useRef(null);

  // Panning state
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);

  // Hover (for key zoom anchoring)
  const hoverRef = useRef({ inside: false, ax: 0, ay: 0 });

  // live camera in ref (for stable handlers)
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

  // Blur helper
  const blurActiveEditable = () => {
    const ae = document.activeElement;
    if (
      ae &&
      (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
    ) {
      ae.blur();
    }
  };

  // ESC clears selections and blurs
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.key === "Escape" &&
        !(
          e.target?.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)
        )
      ) {
        clearSelectionsAndBlur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Zoom helpers ----------
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
    flushSync(() => setCamera({ ...post, x: newX, y: newY }));
  };

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
        cancelCameraTween();
        return;
      }
      setCamera((c) => ({ ...c, x: c.x - ev.deltaX, y: c.y - ev.deltaY }));
      cancelCameraTween();
      ev.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setCamera]);

  // Background pointer (panning + hover)
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

  // Reset & key zoom (= / -)
  const resetView = () =>
    jumpToView({ x: 0, y: 0, zoomBase: 1, zoomExp: 0 }, true);
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
      const ax = inside ? hx : rect.width / 2;
      const ay = inside ? hy : rect.height / 2;

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

  // Double-click to add node — ignore dblclicks on UI or shapes
  const handleDoubleClick = (e) => {
    if (
      e.target?.isContentEditable ||
      e.target?.closest?.("[data-ui]") ||
      e.target?.closest?.("[data-shapes-layer]")
    ) {
      return;
    }
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
    setSelectedShapeId(null);
  };

  // Node ops
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
  const textToHtml = (t = "") =>
    t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\r\n/g, "\n")
      .replace(/\n/g, "<br>");
  const combineSelected = ({
    ids,
    combinedText,
    combinedHtml,
    avgX,
    avgY,
    avgScale,
  }) => {
    if (!ids || ids.length < 2) return;
    const id = Date.now();
    const html =
      combinedHtml != null ? combinedHtml : textToHtml(combinedText || "");
    setNodes((ns) => [
      ...ns.filter((n) => !ids.includes(n.id)),
      { id, x: avgX, y: avgY, text: html, scale: avgScale },
    ]);
    setSelectedIds([id]);
    setFocusId(id);
  };

  // 🔷 Shapes ops
  const addShape = (shape) => {
    const id = Date.now();
    setShapes((ss) => [...ss, { id, ...shape }]);
    setSelectedShapeId(id);
    setSelectedIds([]);
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

  // ---------- Frames helpers ----------
  const clearSelectionsAndBlur = () => {
    setSelectedIds([]);
    setSelectedShapeId(null);
    blurActiveEditable();
  };

  // tween infrastructure
  const tweenRef = useRef(null);
  const cancelCameraTween = () => {
    if (tweenRef.current) {
      cancelAnimationFrame(tweenRef.current.raf);
      tweenRef.current = null;
    }
  };
  const cameraFromXyZ = (x, y, Z) => {
    let zoomBase = Z;
    let zoomExp = 0;
    while (zoomBase >= 2) {
      zoomBase /= 2;
      zoomExp += 1;
    }
    while (zoomBase < 0.5) {
      zoomBase *= 2;
      zoomExp -= 1;
    }
    return { x, y, zoomBase, zoomExp };
  };
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const animateToCamera = (targetCam, { duration = 500 } = {}) => {
    cancelCameraTween();
    const startCam = cameraRef.current;
    const startZ = scale(startCam);
    const endZ = scale(targetCam);
    const logStartZ = Math.log(Math.max(1e-9, startZ));
    const logEndZ = Math.log(Math.max(1e-9, endZ));
    const startX = startCam.x,
      startY = startCam.y;
    const endX = targetCam.x,
      endY = targetCam.y;
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
  const jumpToView = (viewCam, animated = true) => {
    clearSelectionsAndBlur();
    if (animated) animateToCamera(viewCam, { duration: 520 });
    else flushSync(() => setCamera({ ...viewCam }));
  };
  const prevCountRef = useRef(0);
  const saveCurrentView = () => {
    const pre = cameraRef.current;
    const { camera: norm } = normalizeZoomPure(pre);
    const idx = (prevCountRef.current += 1);
    const name = `View ${idx}`;
    setViews((vs) => [...vs, { id: Date.now(), name, camera: { ...norm } }]);
  };
  const startRenameView = (v) => {
    if (v.id === "home") return;
    setEditingViewId(v.id);
    setEditingName(v.name);
  };
  const commitRenameView = () => {
    const name = editingName.trim();
    setViews((vs) => {
      if (!editingViewId) return vs;
      let found = false;
      const next = vs.map((v) => {
        if (v.id === editingViewId) {
          found = true;
          return { ...v, name: name || v.name };
        }
        return v;
      });
      return found ? next : vs;
    });
    setEditingViewId(null);
    setEditingName("");
  };
  const updateViewCamera = (id) => {
    const { camera: norm } = normalizeZoomPure(cameraRef.current);
    setViews((vs) =>
      vs.map((v) => (v.id === id ? { ...v, camera: { ...norm } } : v))
    );
  };
  const deleteView = (id) => {
    setViews((vs) => vs.filter((v) => v.id !== id));
    if (editingViewId === id) {
      setEditingViewId(null);
      setEditingName("");
    }
  };

  const Z = scale(camera);

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
      {/* 🔷 Frames toolbar (top) */}
      <div
        data-ui
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 1000,
          pointerEvents: "auto",
          flexWrap: "wrap",
        }}
      >
        <button
          title="Go Home (reset)"
          onClick={(e) => {
            e.stopPropagation();
            jumpToView({ x: 0, y: 0, zoomBase: 1, zoomExp: 0 }, true);
          }}
          style={chipStyle()}
        >
          Home
        </button>

        <button
          title="Save current view"
          onClick={(e) => {
            e.stopPropagation();
            saveCurrentView();
          }}
          style={chipStyle("#eef2ff")}
        >
          + Save view
        </button>

        <div
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {views
            .filter((v) => v.id !== "home")
            .map((v) => (
              <div
                key={v.id}
                style={{ display: "inline-flex", flexDirection: "column" }}
              >
                {editingViewId === v.id ? (
                  <>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => setTimeout(() => commitRenameView(), 0)} // let buttons run first
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRenameView();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingViewId(null);
                          setEditingName("");
                        }
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        ...chipStyle("#fff"),
                        padding: "5px 8px",
                        width: Math.max(80, editingName.length * 8 + 24),
                      }}
                    />
                    <div
                      data-ui
                      onPointerDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        gap: 6,
                        marginTop: 4,
                        alignItems: "center",
                        justifyContent: "flex-start",
                      }}
                    >
                      <button
                        title="Update this view to the current pan/zoom"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateViewCamera(v.id);
                        }}
                        style={chipStyle("#eef2ff")}
                      >
                        Update to current
                      </button>
                      <button
                        title="Delete this view"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteView(v.id);
                        }}
                        style={{
                          ...chipStyle("#fee2e2"),
                          borderColor: "#fecaca",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToView(v.camera, true);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRenameView(v);
                    }}
                    title={`Go to ${v.name} (double-click to rename)`}
                    style={chipStyle()}
                  >
                    {v.name}
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Right-side draw toolbar */}
      <div
        data-ui
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: "50%",
          right: 12,
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 60,
        }}
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

      {/* Shapes under nodes */}
      <ShapesLayer
        shapes={shapes}
        camera={camera}
        Z={Z}
        selectedId={selectedShapeId}
        onSelect={(id) => {
          cancelCameraTween();
          setSelectedShapeId(id);
          setSelectedIds([]);
          blurActiveEditable();
        }}
        onMoveByScreen={(id, dx, dy) => {
          const Zc = scale(cameraRef.current);
          const dxW = dx / Zc,
            dyW = dy / Zc;
          updateShape(id, (s) => {
            if (s.type === "line") {
              return {
                ...s,
                x1: s.x1 + dxW,
                y1: s.y1 + dyW,
                x2: s.x2 + dxW,
                y2: s.y2 + dyW,
              };
            }
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
          cancelCameraTween();
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
        onScaleNode={(id, newScale) => setNodeScale(id, newScale)}
        onDeleteNode={(id) => {
          setNodes((ns) => ns.filter((n) => n.id !== id));
          setSelectedIds((sel) => sel.filter((x) => x !== id));
        }}
        onDeleteSelected={deleteSelectedNodes}
        onCombineSelected={combineSelected}
        onChange={(id, html) =>
          setNodes((ns) =>
            ns.map((n) => (n.id === id ? { ...n, text: html } : n))
          )
        }
        onBackgroundClickAway={clearSelectionsAndBlur}
      />

      {/* Draw overlay */}
      {activeTool && (
        <DrawOverlay
          tool={activeTool}
          camera={camera}
          onDone={(shapeOrNull) => {
            if (shapeOrNull) addShape(shapeOrNull);
            setActiveTool(null);
          }}
          onCancel={() => setActiveTool(null)}
        />
      )}
    </div>
  );
}

function chipStyle(bg = "#fff") {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: bg,
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };
}
