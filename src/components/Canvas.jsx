// src/components/Canvas.jsx
import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useCamera, scale, normalizeZoomPure } from "../hooks/useCamera";
import { loadPersisted, savePersisted } from "../utils/persistence";
import { textToHtml } from "../utils/html";
import { screenToWorld } from "../utils/math";

import Grid from "./Grid";
import NodesLayer from "./NodesLayer";
import ShapesLayer from "./ShapesLayer";
import DrawOverlay from "./DrawOverlay";
import ViewsBar from "./ViewsBar";
import TasksPanel from "./TasksPanel";
import DrawToolbar from "./DrawToolbar";

import { useCameraTween } from "../hooks/useCameraTween";
import { usePanZoom } from "../hooks/usePanZoom";

/** ────────────────────────── Config ────────────────────────── **/
const BASE_FONT_PX = 14;
const NEW_NODE_FONT_PX = 18;

// Mobile-only tuning (desktop unaffected)
const PINCH_ZOOM_SENSITIVITY = 0.45; // lower = slower zoom on pinch
const TAP_MAX_DELAY = 300; // ms between taps
const TAP_MAX_DIST = 28; // px movement between taps

export default function Canvas() {
  const { camera, setCamera } = useCamera();

  // live camera ref
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const { cancelCameraTween, jumpToView, resetView } =
    useCameraTween(setCamera);

  /** ─────────────── State ─────────────── **/
  // nodes / selection
  const [nodes, setNodes] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // shapes
  const [shapes, setShapes] = useState([]);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [activeTool, setActiveTool] = useState(null); // 'line'|'rect'|'circle'|null

  // views
  const [views, setViews] = useState([
    {
      id: "home",
      name: "Home",
      camera: { x: 0, y: 0, zoomBase: 1, zoomExp: 0 },
    },
  ]);
  const [editingViewId, setEditingViewId] = useState(null);
  const [editingName, setEditingName] = useState("");

  // tasks + UI split
  const [tasks, setTasks] = useState([]); // {id,nodeId,camera,done}
  const [tasksOpen, setTasksOpen] = useState(false);
  const [taskSplit, setTaskSplit] = useState(0.55);

  /** ─────────────── Load persisted on mount ─────────────── **/
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

  /** ─────────────── Persist on change (debounced) ─────────────── **/
  const saveTimer = useRef(null);
  useEffect(() => {
    const snapshot = {
      v: 1,
      nodes,
      shapes,
      views,
      tasks,
      camera,
      ui: { tasksOpen, taskSplit },
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePersisted(snapshot);
      saveTimer.current = null;
    }, 250);
  }, [nodes, shapes, views, tasks, camera, tasksOpen, taskSplit]);

  /** ─────────────── Container + pan/zoom ─────────────── **/
  const containerRef = useRef(null);
  const {
    onPointerDown,
    onPointerMove,
    endPan,
    onPointerLeave,
    onKeyZoom, // optional key zoom handler from usePanZoom
  } = usePanZoom(containerRef, cameraRef, setCamera, cancelCameraTween);

  /** ─────────────── Keyboard: Escape / 0 / +/- ─────────────── **/
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

      // otherwise ignore when typing
      if (
        e.target?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)
      ) {
        return;
      }

      if (e.key === "0") {
        e.preventDefault();
        resetView();
        return;
      }
      // delegate +/- to pan-zoom hook if provided
      onKeyZoom?.(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeyZoom]);

  /** ─────────────── Derived ─────────────── **/
  const Z = scale(camera);
  const doneNodeIds = new Set(tasks.filter((t) => t.done).map((t) => t.nodeId));

  /** ─────────────── Double-click / double-tap to add node ─────────────── **/
  const handleDoubleClick = (e) => {
    // ignore UI or shapes overlay clicks (ViewsBar/TasksPanel/DrawToolbar/ShapesLayer can mark with data-ui or data-shapes-layer)
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
    const nodeScale = NEW_NODE_FONT_PX / ((BASE_FONT_PX * Zc) / 4);

    const apply = () => {
      setNodes((ns) => [
        ...ns,
        { id, x: world.x, y: world.y, text: "", scale: nodeScale },
      ]);
      setFocusId(id); // NodesLayer should autofocus this id
      setSelectedIds([id]);
      setSelectedShapeId(null);
    };

    // On touch, flush so the contentEditable exists before keyboard shows
    if (e.pointerType === "touch") {
      flushSync(apply);
    } else {
      apply();
    }
  };

  const handleSingleClick = (e) => {
    if (activeTool !== "text") {
      return;
    }
    // Only exclude contentEditable and shapes layer, not all data-ui
    if (
      e.target?.isContentEditable ||
      e.target?.closest?.("[data-shapes-layer]")
    ) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(screen, cameraRef.current);
    const id = Date.now();
    const Zc = scale(cameraRef.current);
    const nodeScale = NEW_NODE_FONT_PX / ((BASE_FONT_PX * Zc) / 4);

    setNodes((ns) => [
      ...ns,
      { id, x: world.x, y: world.y, text: "", scale: nodeScale },
    ]);
    setFocusId(id);
    setSelectedIds([id]);
    setSelectedShapeId(null);
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
    const idsToRemove = new Set(selectedIds);
    setNodes((ns) => ns.filter((n) => !idsToRemove.has(n.id)));
    setTasks((ts) => ts.filter((t) => !idsToRemove.has(t.nodeId)));
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
  const saveCurrentView = () => {
    const { camera: norm } = normalizeZoomPure(cameraRef.current);
    const name = `View ${views.filter((v) => v.id !== "home").length + 1}`;
    setViews((vs) => [...vs, { id: Date.now(), name, camera: { ...norm } }]);
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
    jumpToView(cameraRef, task.camera, true);
    setSelectedIds([task.nodeId]);
    setSelectedShapeId(null);
  };
  const removeTask = (id) => setTasks((ts) => ts.filter((t) => t.id !== id));
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
  // drag reorder within groups
  const dragRef = useRef(null); // { group:'todo'|'done', idx:number }
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

  /** ─────────────── Mobile: double-tap + pinch + two-finger pan ─────────────── **/
  const activePointers = useRef(new Map()); // pointerId -> {x,y}
  const pinchState = useRef(null);
  // pinchState: {
  //   startDist: number,
  //   startCam: Camera,
  //   startCenter: [x,y],
  //   prevCenter: [x,y]
  // }
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });

  const wrappedPointerDown = (e) => {
    onPointerDown(e); // keep existing single-pointer pan/drag flows

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap synthesis (touch only)
    if (e.pointerType === "touch") {
      const now = performance.now();
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { t, x: lx, y: ly } = lastTapRef.current;
      const isQuick = now - t < TAP_MAX_DELAY;
      const isClose = Math.hypot(x - lx, y - ly) < TAP_MAX_DIST;

      if (isQuick && isClose) {
        handleDoubleClick(e); // this will flushSync on touch to ensure focus
        lastTapRef.current = { t: 0, x: 0, y: 0 };
      } else {
        lastTapRef.current = { t: now, x, y };
      }
    }

    // Start pinch/two-finger pan when two pointers
    if (activePointers.current.size === 2) {
      cancelCameraTween();
      const pts = [...activePointers.current.values()];
      const startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const center = [(pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2];
      pinchState.current = {
        startDist,
        startCam: { ...cameraRef.current },
        startCenter: center,
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

      // Zoom factor with sensitivity (slower than default)
      const rawFactor = dist / startDist;
      const dampedExp =
        Math.log2(Math.max(0.02, rawFactor)) * PINCH_ZOOM_SENSITIVITY;

      setCamera(() => {
        // Apply zoom relative to the original snapshot (stable feel)
        const next = {
          ...startCam,
          zoomExp: startCam.zoomExp + dampedExp,
        };

        // Keep world point under current center fixed (anchor)
        const rect = containerRef.current.getBoundingClientRect();
        const centerScreen = {
          x: centerNow[0] - rect.left,
          y: centerNow[1] - rect.top,
        };
        const w0 = screenToWorld(centerScreen, startCam);
        const w1 = screenToWorld(centerScreen, next);
        next.x += w0.x - w1.x;
        next.y += w0.y - w1.y;

        // Two-finger pan: translate by center pixel delta / scale
        const dxPx = centerNow[0] - prevCenter[0];
        const dyPx = centerNow[1] - prevCenter[1];
        const Zc = scale(next);
        next.x -= dxPx / Zc;
        next.y -= dyPx / Zc;

        const { camera: normalized } = normalizeZoomPure(next);
        return normalized;
      });

      // update prev center for incremental pan
      pinchState.current.prevCenter = centerNow;

      return; // don’t also pan/drag single-pointer stuff
    }

    onPointerMove(e);
  };

  const wrappedPointerUp = (e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      pinchState.current = null;
    }
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

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#fff",
        userSelect: "none",
        touchAction: "none", // keep default gestures off so we get pointers
        WebkitUserSelect: "none",
        overscrollBehavior: "none",
        cursor: "default",
      }}
      // Desktop double-click still works natively
      onDoubleClick={handleDoubleClick}
      onClick={handleSingleClick}
      onPointerDown={wrappedPointerDown}
      onPointerMove={wrappedPointerMove}
      onPointerUp={wrappedPointerUp}
      onPointerCancel={wrappedPointerCancel}
      onPointerLeave={wrappedPointerLeave}
    >
      {/* ── Views (top bar) ───────────────────────────── */}
      <ViewsBar
        views={views}
        editingViewId={editingViewId}
        editingName={editingName}
        setEditingName={setEditingName}
        jumpToView={jumpToView.bind(null, cameraRef)}
        startRenameView={startRenameView}
        commitRenameView={commitRenameView}
        updateViewCamera={updateViewCamera}
        deleteView={deleteView}
        saveCurrentView={saveCurrentView}
      />

      {/* ── Tasks panel (left) ────────────────────────── */}
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
        onTaskDragStart={onTaskDragStart}
        onTaskDragOver={onTaskDragOver}
        onTaskDrop={onTaskDrop}
        barRef={barRef}
        onSplitDown={onSplitDown}
      />

      {/* ── Draw toolbar (right) ──────────────────────── */}
      <DrawToolbar activeTool={activeTool} setActiveTool={setActiveTool} />

      {/* ── Render order: Grid → Shapes → Nodes → DrawOverlay ── */}
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
