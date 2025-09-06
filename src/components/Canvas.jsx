import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useCamera, scale, normalizeZoomPure } from "../hooks/useCamera";
import { screenToWorld } from "../utils/math";
import Grid from "./Grid";
import NodesLayer from "./NodesLayer";

// --- Config ---
const BASE_SPEED = 0.01; // wheel zoom speed
const KEY_FACTOR = 1.1; // keyboard zoom step (10%)
const SNAP_AT_NORMALIZE = true; // snap only when zoomExp flips
const SNAP_PX = 0.5; // half-pixel snap
const BASE_FONT_PX = 14;
const NEW_NODE_FONT_PX = 18; // make new nodes a bit bigger

export default function Canvas() {
  const { camera, setCamera } = useCamera();
  const [nodes, setNodes] = useState([]);
  const [focusId, setFocusId] = useState(null);

  // 🔵 multi-select
  const [selectedIds, setSelectedIds] = useState([]);

  const containerRef = useRef(null);

  // Panning state
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);

  // Track hover for keyboard-zoom anchor
  const hoverRef = useRef({ inside: false, ax: 0, ay: 0 });

  // keep latest camera in a ref for stable handlers
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // --------- Space toggles panning mode ---------
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
    ) {
      ae.blur();
    }
  };

  // --------- Click-away deselect & ESC ---------
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --------- Shared zoom helper (anchor-locked, no world rebase) ---------
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

  // --------- Wheel: Zoom with Ctrl/Cmd; otherwise Pan ---------
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
      // Trackpad/touchpad pan (diagonal)
      setCamera((c) => ({ ...c, x: c.x - ev.deltaX, y: c.y - ev.deltaY }));
      ev.preventDefault();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setCamera]);

  // --------- Pointer-based panning + hover tracking + click-away ---------
const onPointerDown = (e) => {
  const left = e.button === 0;
  const mid = e.button === 1;



  if (mid || (left && (e.shiftKey || spaceDown.current))) {
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
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
      setSelectedIds([]);
      blurActiveEditable(); // 👈 ensure focus leaves editor
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);


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

  // --------- Reset (0), Zoom keys (= / -) ---------
  const resetView = () => {
    flushSync(() => setCamera({ x: 0, y: 0, zoomBase: 1, zoomExp: 0 }));
  };

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

  // --------- Double-click to add a node ---------
  const handleDoubleClick = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const world = screenToWorld(screen, cameraRef.current);

    const id = Date.now();
    const Zc = scale(cameraRef.current);

    // make new node appear ~NEW_NODE_FONT_PX on screen
    const nodeScale = NEW_NODE_FONT_PX / BASE_FONT_PX / Zc;

    setNodes((ns) => [
      ...ns,
      { id, x: world.x, y: world.y, text: "", scale: nodeScale },
    ]);
    setFocusId(id);
    setSelectedIds([id]);
  };

  // --------- Group ops: move / scale / delete / combine ---------
  const moveSelectedByScreen = (dxScreen, dyScreen) => {
    if (!selectedIds.length) return;
    const Zc = scale(cameraRef.current);
    const dxWorld = dxScreen / Zc;
    const dyWorld = dyScreen / Zc;
    setNodes((ns) =>
      ns.map((n) =>
        selectedIds.includes(n.id)
          ? { ...n, x: n.x + dxWorld, y: n.y + dyWorld }
          : n
      )
    );
  };

  // Commit a multiplicative scale factor to all selected nodes
  const scaleSelectedCommit = (factor) => {
    if (!selectedIds.length) return;
    const clamp = (s) => Math.min(20, Math.max(0.05, s));
    setNodes((ns) =>
      ns.map((n) =>
        selectedIds.includes(n.id)
          ? { ...n, scale: clamp((n.scale ?? 1) * factor) }
          : n
      )
    );
  };

  const deleteSelected = () => {
    if (!selectedIds.length) return;
    setNodes((ns) => ns.filter((n) => !selectedIds.includes(n.id)));
    setSelectedIds([]);
    setFocusId(null);
  };

  // Replace your combineSelected with this:
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
      <Grid camera={camera} />

      <NodesLayer
        nodes={nodes}
        Z={Z}
        camera={camera}
        focusId={focusId} // ⬅️ add this
        selectedIds={selectedIds}
        onSetSelection={setSelectedIds}
        onSelectOne={(id) => setSelectedIds([id])}
        onToggleOne={(id) =>
          setSelectedIds((s) =>
            s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
          )
        }
        onDragSelectedByScreen={moveSelectedByScreen}
        onGroupScaleCommit={scaleSelectedCommit}
        onScaleNode={(id, newScale) => {
          const clamp = (s) => Math.min(20, Math.max(0.05, s));
          setNodes((ns) =>
            ns.map((n) => (n.id === id ? { ...n, scale: clamp(newScale) } : n))
          );
        }}
        onDeleteNode={(id) => {
          setNodes((ns) => ns.filter((n) => n.id !== id));
          setSelectedIds((sel) => sel.filter((x) => x !== id));
        }}
        onDeleteSelected={deleteSelected}
        onCombineSelected={combineSelected}
        onChange={(id, text) =>
          setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, text } : n)))
        }
      />
    </div>
  );
}
