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

const TASKS_W = 220;

const STORAGE_KEY = "infcanvas.v1";

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
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

    // tasks (now with done flag)
    const tasks = Array.isArray(data.tasks)
      ? data.tasks
          .map((t) => {
            if (!t || typeof t !== "object") return null;
            const cam = t.camera
              ? normalizeZoomPure({
                  x: coerceNum(t.camera.x, 0),
                  y: coerceNum(t.camera.y, 0),
                  zoomBase: coerceNum(t.camera.zoomBase, 1),
                  zoomExp: Math.trunc(coerceNum(t.camera.zoomExp, 0)),
                }).camera
              : null;
            if (!cam || !t.nodeId) return null;
            return {
              id: t.id ?? `task_${Date.now()}_${Math.random()}`,
              nodeId: t.nodeId,
              camera: cam,
              done: !!t.done,
            };
          })
          .filter(Boolean)
      : [];

    // UI flags
    const tasksOpen =
      typeof data?.ui?.tasksOpen === "boolean"
        ? data.ui.tasksOpen
        : typeof data?.tasksOpen === "boolean"
        ? data.tasksOpen
        : false;

    const taskSplit =
      typeof data?.ui?.taskSplit === "number" &&
      data.ui.taskSplit > 0 &&
      data.ui.taskSplit < 1
        ? data.ui.taskSplit
        : 0.55;

    return {
      camera: cam,
      nodes,
      shapes,
      views,
      tasks,
      ui: { tasksOpen, taskSplit },
    };
  } catch {
    return null;
  }
}

function savePersisted(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export default function Canvas() {
  const { camera, setCamera } = useCamera();
  const [nodes, setNodes] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const [shapes, setShapes] = useState([]);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [activeTool, setActiveTool] = useState(null);

  const [views, setViews] = useState([
    {
      id: "home",
      name: "Home",
      camera: { x: 0, y: 0, zoomBase: 1, zoomExp: 0 },
    },
  ]);
  const [editingViewId, setEditingViewId] = useState(null);
  const [editingName, setEditingName] = useState("");

  // tasks (+ UI state for split)
  const [tasks, setTasks] = useState([]); // {id,nodeId,camera,done}
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskSplit, setTaskSplit] = useState(0.55); // fraction of height for To-Do pane

  // load persisted
  useEffect(() => {
    const data = loadPersisted();
    if (!data) return;
    if (data.nodes) setNodes(data.nodes);
    if (data.shapes) setShapes(data.shapes);
    if (data.views && data.views.length) setViews(data.views);
    if (data.tasks) setTasks(data.tasks);
    if (typeof data?.ui?.tasksOpen === "boolean")
      setTasksOpen(data.ui.tasksOpen);
    if (typeof data?.ui?.taskSplit === "number")
      setTaskSplit(data.ui.taskSplit);
    if (data.camera) flushSync(() => setCamera(data.camera));
  }, [setCamera]);

  // persist
  const saveTimer = useRef(null);
  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = {
      v: 1,
      nodes,
      shapes,
      views,
      tasks,
      camera,
      ui: { tasksOpen, taskSplit },
    };
    saveTimer.current = setTimeout(() => {
      savePersisted(snapshot);
      saveTimer.current = null;
    }, 250);
  };
  useEffect(() => {
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, shapes, views, tasks, camera, tasksOpen, taskSplit]);

  const containerRef = useRef(null);

  // panning
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);

  // hover (for key zoom anchoring)
  const hoverRef = useRef({ inside: false, ax: 0, ay: 0 });

  // camera ref
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // space toggles panning
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

  const blurActiveEditable = () => {
    const ae = document.activeElement;
    if (
      ae &&
      (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
    )
      ae.blur();
  };

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

  // zoom helpers
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

  // background pointer (panning + hover)
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

  // reset & key zoom
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

  // double click add node
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

  // node ops
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
    const idsToRemove = new Set(selectedIds);
    setNodes((ns) => ns.filter((n) => !idsToRemove.has(n.id)));
    setTasks((ts) => ts.filter((t) => !idsToRemove.has(t.nodeId)));
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
    const idsSet = new Set(ids);
    setNodes((ns) => [
      ...ns.filter((n) => !idsSet.has(n.id)),
      { id, x: avgX, y: avgY, text: html, scale: avgScale },
    ]);
    setTasks((ts) => ts.filter((t) => !idsSet.has(t.nodeId)));
    setSelectedIds([id]);
    setFocusId(id);
  };

  // shapes ops
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

  // frames helpers
  const clearSelectionsAndBlur = () => {
    setSelectedIds([]);
    setSelectedShapeId(null);
    blurActiveEditable();
  };
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

  // tasks helpers
  const addTaskForNode = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const { camera: camSnap } = normalizeZoomPure(cameraRef.current);
    setTasks((ts) => {
      const i = ts.findIndex((t) => t.nodeId === nodeId);
      if (i >= 0) {
        const next = ts.slice();
        next[i] = { ...next[i], camera: camSnap, done: !!next[i].done };
        const [item] = next.splice(i, 1);
        next.unshift(item);
        return next;
      }
      return [
        { id: `task_${Date.now()}`, nodeId, camera: camSnap, done: false },
        ...ts,
      ];
    });
    setTasksOpen(true);
  };

  const goToTask = (task) => {
    jumpToView(task.camera, true);
    setSelectedIds([task.nodeId]);
    setSelectedShapeId(null);
  };

  const removeTask = (id) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
  };

  const toggleTaskDone = (id, value) => {
    setTasks((ts) => {
      const updated = ts.map((t) => (t.id === id ? { ...t, done: value } : t));
      const todo = updated.filter((t) => !t.done);
      const done = updated.filter((t) => t.done);
      // place recently completed at top of Done
      const just = updated.find((t) => t.id === id);
      if (value && just) {
        const d = done.filter((t) => t.id !== id);
        return [...todo, just, ...d];
      }
      // if marking back to todo, put it on top of To-Do
      if (!value && just) {
        const tds = todo.filter((t) => t.id !== id);
        return [just, ...tds, ...done];
      }
      return [...todo, ...done];
    });
  };

  // reorder within To-Do or Done group
  const reorderWithinGroup = (group, fromIdx, toIdx) => {
    setTasks((ts) => {
      const todo = ts.filter((t) => !t.done);
      const done = ts.filter((t) => t.done);
      if (group === "todo") {
        const arr = todo.slice();
        const [it] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, it);
        return [...arr, ...done];
      } else {
        const arr = done.slice();
        const [it] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, it);
        return [...todo, ...arr];
      }
    });
  };

  // DnD state
  const dragRef = useRef(null); // { group:'todo'|'done', idx:number }
  const onTaskDragStart = (group, idx) => (e) => {
    dragRef.current = { group, idx };
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", "task");
    } catch {}
  };
  const onTaskDragOver = (group, overIdx) => (e) => {
    e.preventDefault();
    if (!dragRef.current) return;
    const { group: g0, idx: from } = dragRef.current;
    if (g0 !== group || from === overIdx) return;
    reorderWithinGroup(group, from, overIdx);
    dragRef.current = { group, idx: overIdx };
  };
  const onTaskDrop = () => {
    dragRef.current = null;
  };

  const Z = scale(camera);

  // set of done node ids for green highlight
  const doneNodeIds = new Set(tasks.filter((t) => t.done).map((t) => t.nodeId));

  // split handle drag
  const barRef = useRef(null);
  const splitDrag = useRef(false);
  const onSplitDown = (e) => {
    splitDrag.current = true;
    window.addEventListener("pointermove", onSplitMove, true);
    window.addEventListener("pointerup", onSplitUp, true);
    e.preventDefault();
    e.stopPropagation();
  };
  const onSplitMove = (e) => {
    if (!splitDrag.current || !barRef.current) return;
    const r = barRef.current.getBoundingClientRect();
    const min = 80; // px min for top and bottom
    const rel = e.clientY - r.top;
    const clamped = Math.max(min, Math.min(r.height - min, rel));
    setTaskSplit(clamped / r.height);
  };
  const onSplitUp = () => {
    splitDrag.current = false;
    window.removeEventListener("pointermove", onSplitMove, true);
    window.removeEventListener("pointerup", onSplitUp, true);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
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
      {/* Frames toolbar (your existing bar kept as-is)… */}
      {/* ...omitted for brevity; keep your current frames UI here ... */}

      {/* Left Tasks bar (collapsible, split To-Do / Done) */}
      <div
        data-ui
        ref={barRef}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 60,
          bottom: 12,
          left: 12,
          width: TASKS_W,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          zIndex: 40,
          transform: tasksOpen
            ? "translateX(0)"
            : `translateX(-${TASKS_W + 16}px)`,
          transition: "transform 200ms ease",
          pointerEvents: tasksOpen ? "auto" : "none",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            margin: "2px 4px",
          }}
        >
          Tasks
        </div>

        {/* Split panes */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 160,
          }}
        >
          {/* To-Do list */}
          <div
            style={{
              flexBasis: `calc(${(taskSplit * 100).toFixed(2)}% - 4px)`,
              minHeight: 80,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {tasks.filter((t) => !t.done).length === 0 && (
              <div
                style={{ fontSize: 12, color: "#6b7280", margin: "2px 4px" }}
              >
                Select a node → Add to Tasks
              </div>
            )}
            {tasks
              .filter((t) => !t.done)
              .map((t, idx) => {
                const node = nodes.find((n) => n.id === t.nodeId);
                const title = node
                  ? firstLineFromHTML(node.text) || "(Untitled)"
                  : "(Missing node)";
                return (
                  <TaskRow
                    key={t.id}
                    title={title}
                    done={false}
                    onGo={() => goToTask(t)}
                    onToggle={() => toggleTaskDone(t.id, true)}
                    onRemove={() => removeTask(t.id)}
                    draggableProps={{
                      draggable: true,
                      onDragStart: onTaskDragStart("todo", idx),
                      onDragOver: onTaskDragOver("todo", idx),
                      onDrop: onTaskDrop,
                    }}
                  />
                );
              })}
          </div>

          {/* Divider handle */}
          <div
            onPointerDown={onSplitDown}
            style={{
              height: 8,
              margin: "4px 0",
              borderRadius: 4,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08))",
              cursor: "row-resize",
              userSelect: "none",
            }}
            title="Drag to resize"
          />

          {/* Done list */}
          <div
            style={{
              flex: 1,
              minHeight: 80,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {tasks
              .filter((t) => t.done)
              .map((t, idx) => {
                const node = nodes.find((n) => n.id === t.nodeId);
                const title = node
                  ? firstLineFromHTML(node.text) || "(Untitled)"
                  : "(Missing node)";
                return (
                  <TaskRow
                    key={t.id}
                    title={title}
                    done
                    onGo={() => goToTask(t)}
                    onToggle={() => toggleTaskDone(t.id, false)}
                    onRemove={() => removeTask(t.id)}
                    draggableProps={{
                      draggable: true,
                      onDragStart: onTaskDragStart("done", idx),
                      onDragOver: onTaskDragOver("done", idx),
                      onDrop: onTaskDrop,
                    }}
                  />
                );
              })}
          </div>
        </div>
      </div>

      {/* Collapse / expand toggles */}
      {tasksOpen ? (
        <button
          data-ui
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTasksOpen(false)}
          title="Hide tasks"
          style={sideToggleStyle(12 + TASKS_W + 8)}
        >
          ‹
        </button>
      ) : (
        <button
          data-ui
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTasksOpen(true)}
          title="Show tasks"
          style={sideToggleStyle(12)}
        >
          ☰
        </button>
      )}

      {/* Right draw toolbar … (keep your existing code) */}

      <Grid camera={camera} />

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
          setTasks((ts) => ts.filter((t) => t.nodeId !== id));
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
        onAddTaskNode={(id) => addTaskForNode(id)}
        // NEW: tell NodesLayer which nodes are "done" (for green background)
        doneNodeIds={doneNodeIds}
      />

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

function sideToggleStyle(leftPx) {
  return {
    position: "absolute",
    left: leftPx,
    top: "50%",
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    cursor: "pointer",
    zIndex: 41,
    lineHeight: "36px",
    fontSize: 16,
  };
}

function firstLineFromHTML(html = "") {
  const div = document.createElement("div");
  div.innerHTML = html;
  const text = (div.textContent || "").replace(/\u00A0/g, " ").trim();
  const line = text.split(/\r?\n/)[0]?.trim() || "";
  return line;
}

// Small presentational component for a task row
function TaskRow({ title, done, onGo, onToggle, onRemove, draggableProps }) {
  return (
    <div
      {...draggableProps}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: done ? "#f0fdf4" : "#fff",
        marginBottom: 6,
      }}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle?.(e.target.checked)}
        title={done ? "Mark as to-do" : "Mark as done"}
        style={{ cursor: "pointer" }}
      />
      <div
        onClick={onGo}
        title="Go to task"
        style={{
          flex: 1,
          fontSize: 12,
          color: "#111827",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
      >
        {title}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
        title="Remove task"
        style={{
          width: 22,
          height: 22,
          lineHeight: "20px",
          fontSize: 14,
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          background: "#fff",
          color: "#ef4444",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
