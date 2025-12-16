// src/components/Canvas.jsx
import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useCamera, scale, normalizeZoomPure } from "../hooks/useCamera";
import { loadPersisted, savePersisted } from "../utils/persistence";
import { textToHtml } from "../utils/html";
import { screenToWorld } from "../utils/math";

import { Link } from "react-router-dom";

import Grid from "./Grid";
import NodesLayer from "./NodesLayer";
import ShapesLayer from "./ShapesLayer";
import DrawOverlay from "./DrawOverlay";
import ViewsBar from "./ViewsBar";
import TasksPanel from "./TasksPanel";
import DrawToolbar from "./DrawToolbar";
import ZoomBtns from "./ZoomBtns";

import { useCameraTween } from "../hooks/useCameraTween";
import { usePanZoom } from "../hooks/usePanZoom";

/** ────────────────────────── Config ────────────────────────── **/
const BASE_FONT_PX = 14;
const NEW_NODE_FONT_PX = 10;

// Mobile-only tuning / gestures
const PINCH_ZOOM_SENSITIVITY = 0.45;
const TAP_MAX_DELAY = 300;
const TAP_MAX_DIST = 28;

// Node wrap defaults
const DEFAULT_NODE_WRAP_PX = 500;
const CH_PER_EM_GUESS = 0.5;

export default function Canvas({ docId = "home" }) {
  const { camera, setCamera } = useCamera();
  const nodesMeasureRef = useRef(null);

  useEffect(() => {
    document.title = `Notesmapp – ${docId}`;
  }, [docId]);

  // live camera ref
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const { cancelCameraTween, jumpToView, resetView } =
    useCameraTween(setCamera);

  /** ─────────────── State ─────────────── **/
  const [id, setId] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [name, setName] = useState("");
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

  const [tasks, setTasks] = useState([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskSplit, setTaskSplit] = useState(0.55);

  /** ─────────────── Load persisted on mount ─────────────── **/
  useEffect(() => {
    let alive = true;
    (async () => {
      const fetchedMap = await loadPersisted(docId);
      if (!alive || !fetchedMap) return;

      const data = fetchedMap.snapshot;

      if (fetchedMap.id) setId(fetchedMap.id);
      if (fetchedMap.name) setName(fetchedMap.name);

      if (data.nodes) setNodes(data.nodes);
      if (data.shapes) setShapes(data.shapes);
      if (data.views && data.views.length) setViews(data.views);
      if (data.tasks) setTasks(data.tasks);
      if (typeof data?.ui?.tasksOpen === "boolean")
        setTasksOpen(data.ui.tasksOpen);
      if (typeof data?.ui?.taskSplit === "number")
        setTaskSplit(data.ui.taskSplit);
      if (data.camera) flushSync(() => setCamera(data.camera));
      
      setIsLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [docId, setCamera]);

  // Helpers for a smart default view title
  const titleFromHtml = (html) => {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    const text = (div.innerText || "").replace(/\u00a0/g, " ").trim();
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length) || "";
    const trimmed = firstLine.replace(/\s+/g, " ").trim();
    return trimmed.length > 60 ? trimmed.slice(0, 57) + "…" : trimmed;
  };
  const computeDefaultViewName = () => {
    const api = nodesMeasureRef.current;
    const container = containerRef.current;
    if (!api || !container) return null;
    const viewport = container.getBoundingClientRect();
    const metrics = api.getMetrics?.() || [];
    const visible = metrics
      .map(({ id, rect, area }) => {
        const L = Math.max(rect.left, viewport.left);
        const R = Math.min(rect.right, viewport.right);
        const T = Math.max(rect.top, viewport.top);
        const B = Math.min(rect.bottom, viewport.bottom);
        const interW = Math.max(0, R - L);
        const interH = Math.max(0, B - T);
        const intersects = interW > 0 && interH > 0;
        return { id, intersects, top: rect.top, left: rect.left, area };
      })
      .filter((m) => m.intersects);
    if (!visible.length) return null;
    visible.sort((a, b) => b.area - a.area || a.top - b.top || a.left - b.left);
    const best = visible[0];
    const node = nodes.find((n) => n.id === best.id);
    return titleFromHtml(node?.text) || null;
  };

  /** 
   * ─────────────── Persist (debounced) ─────────────── 
   * Management of auto-saving to local storage / API.
   * Includes safeguards against data loss (overwriting with empty/loading state).
   **/
  const saveTimer = useRef(null);

  // Tracks if we have seen >0 nodes this session. Used to warn user if they delete everything.
  const hasHadNodesRef = useRef(false);

  useEffect(() => {
    if (nodes.length > 0) hasHadNodesRef.current = true;
  }, [nodes]);

  useEffect(() => {
    const snapshot = {
      v: 1,
      name,
      nodes,
      shapes,
      views,
      tasks,
      camera,
      ui: { tasksOpen, taskSplit },
    };
    
    if (!isLoaded) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Safety check: if we are saving an empty map but we previously had nodes, confirm!
      if (snapshot.nodes.length === 0 && hasHadNodesRef.current) {
        if (
          !window.confirm(
            "This map has 0 nodes. Are you sure you want to save (overwriting previous data)?"
          )
        ) {
          return;
        }
      }

      savePersisted(id, snapshot);
      saveTimer.current = null;
    }, 250);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [docId, id, nodes, shapes, views, tasks, camera, tasksOpen, taskSplit, isLoaded]);

  /** ─────────────── Container + pan/zoom ─────────────── **/
  const containerRef = useRef(null);
  const { onPointerDown, onPointerMove, endPan, onPointerLeave, onKeyZoom } =
    usePanZoom(containerRef, cameraRef, setCamera, cancelCameraTween, isLoaded);

  /** ─────────────── Keyboard ─────────────── **/
  const blurActiveEditable = () => {
    const ae = document.activeElement;
    if (
      ae &&
      (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
    ) {
      ae.blur();
    }
  };
  const clearSelectionsAndBlur = () => {
    setSelectedIds([]);
    setSelectedShapeId(null);
    blurActiveEditable();
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setActiveTool(null);
        clearSelectionsAndBlur();
        return;
      }
      if (e.key === "t" && e.target == document.body) {
        console.log(e.target);
        setActiveTool("text");
        return;
      }
      if (
        e.target?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)
      ) {
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        resetView(cameraRef, containerRef, true);
        return;
      }
      onKeyZoom?.(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeyZoom]);

  /** ─────────────── Derived ─────────────── **/
  const Z = scale(camera);
  const doneNodeIds = new Set(tasks.filter((t) => t.done).map((t) => t.nodeId));

  /** ─────────────── Android-friendly focus helpers ───────── **/
  const focusTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, []);

  const focusNodeNow = (id) => {
    try {
      const wrapper = containerRef.current?.querySelector(
        `[data-node-id="${id}"]`
      );
      const el = wrapper?.querySelector(".node-text");
      if (!el) return false;

      // Improves reliability on Android
      el.click();
      el.focus({ preventScroll: true });

      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  };

  const scheduleMobileFocus = (id, delayMs = 200) => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    focusTimerRef.current = setTimeout(() => {
      focusNodeNow(id);
    }, delayMs);
  };

  /** ─────────────── Add node: dbl/tap ─────────────── **/
  const handleDoubleClick = (e) => {
    if (
      e.target?.isContentEditable ||
      e.target?.closest?.("[data-ui]") ||
      e.target?.closest?.("[data-shapes-layer]")
    ) {
      return;
    }

    const ne = e.nativeEvent ?? e;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = typeof ne.clientX === "number" ? ne.clientX : ne.pageX ?? 0;
    const cy = typeof ne.clientY === "number" ? ne.clientY : ne.pageY ?? 0;
    const screen = { x: cx - rect.left, y: cy - rect.top };
    const world = screenToWorld(screen, cameraRef.current);

    const id = Date.now();
    const Zc = scale(cameraRef.current);
    const nodeScale = NEW_NODE_FONT_PX / ((BASE_FONT_PX * Zc) / 4);

    const apply = () => {
      setNodes((ns) => [
        ...ns,
        {
          id,
          x: world.x,
          y: world.y,
          text: "",
          scale: nodeScale,
          wrapCh: computeInitialWrapCh(cameraRef),
        },
      ]);
      setFocusId(id);
      setSelectedIds([id]);
      setSelectedShapeId(null);
    };

    const isTouchish =
      ne.pointerType === "touch" ||
      (ne.sourceCapabilities?.firesTouchEvents ?? false);

    if (isTouchish) {
      // Mount immediately so the DOM exists, but delay focus for Android
      flushSync(apply);
      scheduleMobileFocus(id, 500);
    } else {
      apply();
      // Desktop immediate focus still feels nice
      requestAnimationFrame(() => focusNodeNow(id));
    }
  };

  /** ─────────────── Add node: single tap in Text tool (unchanged) ───────── **/
  const handleSingleClick = (e) => {
    if (activeTool !== "text") return;
    if (
      e.target?.isContentEditable ||
      e.target?.closest?.("[data-shapes-layer]")
    )
      return;

    const rect = containerRef.current.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(screen, cameraRef.current);

    const id = Date.now();
    const Zc = scale(cameraRef.current);
    const nodeScale = NEW_NODE_FONT_PX / ((BASE_FONT_PX * Zc) / 4);

    const apply = () => {
      setNodes((ns) => [
        ...ns,
        {
          id,
          x: world.x,
          y: world.y,
          text: "",
          scale: nodeScale,
          wrapCh: computeInitialWrapCh(cameraRef),
        },
      ]);
      setFocusId(id);
      setSelectedIds([id]);
      setSelectedShapeId(null);
    };

    const isTouchish = e.nativeEvent?.pointerType === "touch";
    if (isTouchish) {
      flushSync(apply);
      // Keep single-tap behavior immediate; change if you want it delayed too
      requestAnimationFrame(() => focusNodeNow(id));
    } else {
      apply();
      requestAnimationFrame(() => focusNodeNow(id));
    }
  };

  /** ─────────────── Node ops ─────────────── **/
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
    const rm = new Set(selectedIds);
    setNodes((ns) => ns.filter((n) => !rm.has(n.id)));
    setTasks((ts) => ts.filter((t) => !rm.has(t.nodeId)));
    setSelectedIds([]);
    setFocusId(null);
  };
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

  /** ─────────────── Shapes ops ─────────────── **/
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

  /** ─────────────── Views helpers ─────────────── **/
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
      const next = vs.map((v) =>
        v.id === editingViewId
          ? ((found = true), { ...v, name: name || v.name })
          : v
      );
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
  const saveCurrentView = () => {
    const { camera: norm } = normalizeZoomPure(cameraRef.current);
    const smart =
      computeDefaultViewName() ??
      `View ${views.filter((v) => v.id !== "home").length + 1}`;
    setViews((vs) => [
      ...vs,
      { id: Date.now(), name: smart, camera: { ...norm } },
    ]);
  };

  /** ─────────────── Zoom buttons ─────────────── **/
  const ZOOM_BUTTON_STEP_EXP = 0.3;
  const zoomByButtons = (deltaExp) => {
    cancelCameraTween();
    const { camera: fromNorm } = normalizeZoomPure(cameraRef.current);

    const rect = containerRef.current?.getBoundingClientRect?.() || {
      width: window.innerWidth,
      height: window.innerHeight,
      left: 0,
      top: 0,
    };
    const cx = rect.width / 2,
      cy = rect.height / 2;
    const anchorWorld = screenToWorld({ x: cx, y: cy }, fromNorm);

    const to = {
      ...fromNorm,
      zoomBase: 1,
      zoomExp: fromNorm.zoomExp + deltaExp,
    };
    const Znext = scale(to);
    to.x = cx - anchorWorld.x * Znext;
    to.y = cy - anchorWorld.y * Znext;

    const { camera: target } = normalizeZoomPure(to);
    jumpToView(cameraRef, containerRef, target, true, { duration: 220 });
  };
  const onZoomInClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomByButtons(+ZOOM_BUTTON_STEP_EXP);
  };
  const onZoomOutClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomByButtons(-ZOOM_BUTTON_STEP_EXP);
  };

  /** ─────────────── Tasks helpers ─────────────── **/
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
    jumpToView(cameraRef, containerRef, task.camera, true);
    setSelectedIds([task.nodeId]);
    setSelectedShapeId(null);
  };
  const removeTask = (id) => setTasks((ts) => ts.filter((t) => t.id !== id));

  const removeTasks = (tasksToRemove) => {
    console.log(tasksToRemove);

    if (!window.confirm(`Delete tasks and nodes?`)) return;

    setNodes(nodes.filter((node) => !tasksToRemove.includes(node.id)));
    setTasks((tasks) => tasks.filter((t) => !tasksToRemove.includes(t.nodeId)));
  };

  const toggleTaskDone = (id, value) => {
    setTasks((ts) => {
      const updated = ts.map((t) => (t.id === id ? { ...t, done: value } : t));
      const todo = updated.filter((t) => !t.done);
      const done = updated.filter((t) => t.done);
      const just = updated.find((t) => t.id === id);
      if (value && just) {
        const d = done.filter((t) => t.id !== id);
        return [...todo, just, ...d];
      }
      if (!value && just) {
        const tds = todo.filter((t) => t.id !== id);
        return [just, ...tds, ...done];
      }
      return [...todo, ...done];
    });
  };

  // Drag reorder within groups
  const dragRef = useRef(null);
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

  /** ─────────────── Split bar (inside TasksPanel) ─────────────── **/
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
    const min = 80;
    const rel = e.clientY - r.top;
    const clamped = Math.max(min, Math.min(r.height - min, rel));
    setTaskSplit(clamped / r.height);
  };
  const onSplitUp = () => {
    splitDrag.current = false;
    window.removeEventListener("pointermove", onSplitMove, true);
    window.removeEventListener("pointerup", onSplitUp, true);
  };

  /** ─────────────── Mobile gestures (pinch/two-finger pan) ─────────────── **/
  const activePointers = useRef(new Map());
  const pinchState = useRef(null);
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });

  const wrappedPointerDown = (e) => {
    onPointerDown(e);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap synthesis for touch (if Stage isn't used)
    if (e.pointerType === "touch") {
      const now = performance.now();
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { t, x: lx, y: ly } = lastTapRef.current;
      const isQuick = now - t < TAP_MAX_DELAY;
      const isClose = Math.hypot(x - lx, y - ly) < TAP_MAX_DIST;

      if (isQuick && isClose) {
        handleDoubleClick(e);
        lastTapRef.current = { t: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { t: now, x, y };
      }
    }

    if (activePointers.current.size === 2) {
      cancelCameraTween();
      const pts = [...activePointers.current.values()];
      const startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const center = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      pinchState.current = {
        startDist,
        startCam: { ...cameraRef.current },
        prevCenter: center,
      };
    }
  };

  const wrappedPointerMove = (e) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.current.size === 2 && pinchState.current) {
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const centerNow = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];

      const { startDist, startCam, prevCenter } = pinchState.current;
      if (startDist <= 0) return;

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

        const dxPx = centerNow[0] - prevCenter[0];
        const dyPx = centerNow[1] - prevCenter[1];
        const Zc = scale(next);
        next.x -= dxPx / Zc;
        next.y -= dyPx / Zc;

        const { camera: normalized } = normalizeZoomPure(next);
        return normalized;
      });

      pinchState.current.prevCenter = centerNow;
      return;
    }

    onPointerMove(e);
  };

  const wrappedPointerUp = (e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchState.current = null;
    endPan(e);
  };
  const wrappedPointerCancel = (e) => {
    activePointers.current.delete(e.pointerId);
    pinchState.current = null;
    endPan(e);
  };
  const wrappedPointerLeave = (e) => {
    onPointerLeave(e);
  };

  /** ─────────────── Node wrap helper ─────────────── **/
  const setNodeWrap = (id, wrapChOrNull) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, wrapCh: wrapChOrNull } : n))
    );
  };
  function computeInitialWrapCh(cameraRef) {
    const Zc = scale(cameraRef.current);
    const nodeScale = NEW_NODE_FONT_PX / ((BASE_FONT_PX * Zc) / 4);
    const fontPx = BASE_FONT_PX * Zc * nodeScale; // ≈ NEW_NODE_FONT_PX * 4
    const chPx = fontPx * CH_PER_EM_GUESS;
    const raw = DEFAULT_NODE_WRAP_PX / Math.max(1, chPx);
    return Math.max(4, Math.round(raw * 2) / 2);
  }

  const [hideDoneNodes, setHideDoneNodes] = useState(true);

  if (!isLoaded) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
          color: "#888",
          userSelect: "none",
        }}
      >
        Loading map...
      </div>
    );
  }

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
        WebkitUserSelect: "none",
        overscrollBehavior: "none",
        cursor: "default",
      }}
      onDoubleClick={handleDoubleClick}
      onClick={handleSingleClick}
      onPointerDown={wrappedPointerDown}
      onPointerMove={wrappedPointerMove}
      onPointerUp={wrappedPointerUp}
      onPointerCancel={wrappedPointerCancel}
      onPointerLeave={wrappedPointerLeave}
    >
      <Link to="/admin">
        <button
          style={{
            position: "absolute",
            top: "10px",
            left: "10px",
            zIndex: 1000,
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            backgroundColor: "white",
            cursor: "pointer",
            fontSize: 18,
            zIndex: 2000,
          }}
        >
          ⌂
        </button>
      </Link>

      <ViewsBar
        views={views}
        editingViewId={editingViewId}
        editingName={editingName}
        setEditingName={setEditingName}
        jumpToView={jumpToView.bind(null, cameraRef, containerRef)}
        startRenameView={startRenameView}
        commitRenameView={commitRenameView}
        updateViewCamera={updateViewCamera}
        deleteView={deleteView}
        saveCurrentView={saveCurrentView}
      />

      <TasksPanel
        tasksOpen={tasksOpen}
        taskSplit={taskSplit}
        setTaskSplit={setTaskSplit}
        setTasksOpen={setTasksOpen}
        tasks={tasks}
        nodes={nodes}
        goToTask={goToTask}
        toggleTaskDone={toggleTaskDone}
        removeTask={removeTask}
        removeTasks={removeTasks}
        onTaskDragStart={onTaskDragStart}
        onTaskDragOver={onTaskDragOver}
        onTaskDrop={onTaskDrop}
        barRef={barRef}
        onSplitDown={onSplitDown}
        hideDoneNodes={hideDoneNodes}
        setHideDoneNodes={setHideDoneNodes}
      />

      <DrawToolbar activeTool={activeTool} setActiveTool={setActiveTool} />

      <Grid camera={camera} />

      <ZoomBtns onZoomInClick={onZoomInClick} onZoomOutClick={onZoomOutClick} />

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
        hideDoneNodes={hideDoneNodes}
        camera={camera}
        onSetNodeWrap={setNodeWrap}
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
        onScaleNode={setNodeScale}
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
        registerMeasureApi={(api) => (nodesMeasureRef.current = api)}
        onBackgroundClickAway={clearSelectionsAndBlur}
        onAddTaskNode={addTaskForNode}
        doneNodeIds={doneNodeIds}
      />

      {activeTool && (
        <DrawOverlay
          tool={activeTool}
          camera={camera}
          onDone={(shapeOrNull) => {
            if (shapeOrNull) addShape(shapeOrNull);
            if (activeTool !== "text") setActiveTool(null);
          }}
          onCancel={() => activeTool !== "text" && setActiveTool(null)}
        />
      )}
    </div>
  );
}
