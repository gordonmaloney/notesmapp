import { useRef, useEffect, useState, useLayoutEffect } from "react";

const BLUE = "#3b82f6";
const RING_WIDTH = 2;
const RING_HIT = 8;

const HANDLE_SIZE = 12; // single-node resize handle
const HANDLE_OFFSET = 6;

const GROUP_HANDLE = 14; // group resize handle
const GROUP_OFFSET = 8;

const DELETE_SIZE = 12; // red delete dot
const DELETE_OFFSET = 6;

// Resize sensitivity (px per 2×). Shift=precise, Alt/Option=coarse.
const PX_PER_DOUBLE_BASE = 60;
const PX_PER_DOUBLE_SHIFT = 120;
const PX_PER_DOUBLE_ALT = 30;

export default function NodesLayer({
  nodes,
  camera,
  Z,

  // selection API
  selectedIds,
  onSetSelection,
  onSelectOne,
  onToggleOne,

  // group ops
  onDragSelectedByScreen,
  onGroupScaleCommit, // (factor)
  onDeleteSelected,
  onCombineSelected, // ({ ids, combinedText, avgX, avgY, avgScale })

  // single ops
  onScaleNode, // (id, newScale) — live while dragging handle
  onDeleteNode, // (id)

  // focus + text update
  focusId,
  onChange, // (id, text)
}) {
  const { x: camX, y: camY } = camera;
  const rootRef = useRef(null);

  // Refs per node for hit-testing + LIVE TEXT reads
  const wrapperRefs = useRef(new Map()); // id -> wrapper div
  const textRefs = useRef(new Map()); // id -> contentEditable div
  const setWrapperRef = (id) => (el) => {
    if (el) wrapperRefs.current.set(id, el);
    else wrapperRefs.current.delete(id);
  };
  const setTextRef = (id) => (el) => {
    if (el) textRefs.current.set(id, el);
    else textRefs.current.delete(id);
  };

  // Marquee selection state (client coords)
  const [dragSel, setDragSel] = useState(null); // {x0,y0,x1,y1}

  // Group live scale preview factor (null = none)
  const [groupLiveFactor, setGroupLiveFactor] = useState(null);
  const groupLiveFactorRef = useRef(1);

  // Compute group bounds (client rect union)
  const [groupRect, setGroupRect] = useState(null);
  useLayoutEffect(() => {
    if (!selectedIds?.length) {
      setGroupRect(null);
      return;
    }
    let L = Infinity,
      T = Infinity,
      R = -Infinity,
      B = -Infinity;
    for (const id of selectedIds) {
      const el = wrapperRefs.current.get(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      L = Math.min(L, r.left);
      T = Math.min(T, r.top);
      R = Math.max(R, r.right);
      B = Math.max(B, r.bottom);
    }
    if (isFinite(L) && isFinite(T) && isFinite(R) && isFinite(B)) {
      setGroupRect({
        left: L,
        top: T,
        right: R,
        bottom: B,
        width: R - L,
        height: B - T,
      });
    } else setGroupRect(null);
  }, [selectedIds, nodes, Z, camX, camY]);

  // ----- Background / marquee selection + click-away (single & multi) -----
  const downRef = useRef(null); // { empty: boolean, x, y }
  const CLICK_EPS = 3; // px threshold to treat as a click

  const onRootPointerDown = (e) => {
    if (e.button !== 0) return;

    const hitNode = e.target.closest?.("[data-node-wrapper]");
    const hitUI = e.target.closest?.("[data-ui]");
    const emptySurface = !hitNode && !hitUI;

    // record initial press for click vs drag
    downRef.current = { empty: emptySurface, x: e.clientX, y: e.clientY };

    if (emptySurface) {
      // start marquee; selection will be set on pointerup
      setDragSel({
        x0: e.clientX,
        y0: e.clientY,
        x1: e.clientX,
        y1: e.clientY,
      });
      rootRef.current.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
  };

  const onRootPointerMove = (e) => {
    if (!dragSel) return;
    setDragSel((s) => ({ ...s, x1: e.clientX, y1: e.clientY }));
    e.preventDefault();
  };

  const onRootPointerUp = (e) => {
    const down = downRef.current;
    downRef.current = null;

    // If a marquee happened, finalize its selection and stop here
    if (dragSel) {
      const xMin = Math.min(dragSel.x0, dragSel.x1);
      const xMax = Math.max(dragSel.x0, dragSel.x1);
      const yMin = Math.min(dragSel.y0, dragSel.y1);
      const yMax = Math.max(dragSel.y0, dragSel.y1);

      const ids = [];
      for (const [id, el] of wrapperRefs.current.entries()) {
        const r = el.getBoundingClientRect();
        const intersects =
          r.right >= xMin &&
          r.left <= xMax &&
          r.bottom >= yMin &&
          r.top <= yMax;
        if (intersects) ids.push(id);
      }

      onSetSelection?.(ids);

      // If the marquee selected nothing (i.e., click-away), also blur the editor
      if (ids.length === 0) {
        const ae = document.activeElement;
        if (
          ae &&
          (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
        ) {
          ae.blur();
        }
      }

      setDragSel(null);
      rootRef.current.releasePointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }

    // Otherwise treat as a click: if it began on empty space and didn't move -> clear selection + blur
    if (down && down.empty) {
      const dx = Math.abs(e.clientX - down.x);
      const dy = Math.abs(e.clientY - down.y);
      if (dx < CLICK_EPS && dy < CLICK_EPS) {
        onSetSelection?.([]);
        const ae = document.activeElement;
        if (
          ae &&
          (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))
        ) {
          ae.blur();
        }
        e.preventDefault();
      }
    }
  };

  // ----- Group resize with global listeners (only while pressed) -----
  const groupStart = useRef({ x: 0, y: 0 });
  const groupMoveUpCleanup = useRef(null);

  const onGroupHandleDown = (e) => {
    if (e.button !== 0 || !groupRect) return;

    const start = { x: e.clientX, y: e.clientY };
    groupStart.current = start;

    // start preview
    groupLiveFactorRef.current = 1;
    setGroupLiveFactor(1);

    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const delta = (dx + dy) / 2;

      const rate = ev.shiftKey
        ? PX_PER_DOUBLE_SHIFT
        : ev.altKey
        ? PX_PER_DOUBLE_ALT
        : PX_PER_DOUBLE_BASE;

      const f = Math.exp((Math.LN2 / rate) * delta);
      // clamp & store in ref, also update preview state
      groupLiveFactorRef.current = Math.max(0.05, Math.min(20, f));
      setGroupLiveFactor(groupLiveFactorRef.current);
    };

    const onUp = () => {
      const f = groupLiveFactorRef.current;
      setGroupLiveFactor(null);
      onGroupScaleCommit?.(f);

      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      groupMoveUpCleanup.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    groupMoveUpCleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };

    e.preventDefault();
    e.stopPropagation();
  };

  // clean up on unmount just in case
  useEffect(
    () => () => {
      groupMoveUpCleanup.current?.();
    },
    []
  );

  // ----- Toolbar actions (Delete / Combine with LIVE text) -----
  const normalizeText = (t) =>
    t
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n$/, "");

  const onDeleteSelectedClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteSelected?.();
  };

  const onCombineSelectedClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIds || selectedIds.length < 2) return;

    // Sort by world Y then X (top→bottom, then left→right)
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const selectedNodes = selectedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    // Pull LIVE text from DOM if available (captures unsaved edits)
    const parts = selectedNodes.map((n) => {
      const el = textRefs.current.get(n.id);
      const live = el?.innerText;
      const source =
        typeof live === "string" && live.length > 0 ? live : n.text || "";
      return normalizeText(source).trim();
    });

    const combinedText = parts.join("\n\n");
    const avgX =
      selectedNodes.reduce((s, n) => s + n.x, 0) / selectedNodes.length;
    const avgY =
      selectedNodes.reduce((s, n) => s + n.y, 0) / selectedNodes.length;
    const avgScale =
      selectedNodes.reduce((s, n) => s + (n.scale ?? 1), 0) /
      selectedNodes.length;

    onCombineSelected?.({
      ids: selectedIds.slice(),
      combinedText,
      avgX,
      avgY,
      avgScale,
    });
  };

  return (
    <div
      ref={rootRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "auto" }}
      onPointerDown={onRootPointerDown}
      onPointerMove={onRootPointerMove}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerUp}
    >
      {/* Nodes */}
      {nodes.map((n) => (
        <NodeItem
          key={n.id}
          node={n}
          setWrapperRef={setWrapperRef(n.id)}
          setTextRef={setTextRef(n.id)}
          camX={camX}
          camY={camY}
          Z={Z}
          selected={selectedIds.includes(n.id)}
          multiSelected={selectedIds.length > 1}
          autoFocus={n.id === focusId}
          onClickSelect={(e) =>
            e.metaKey || e.ctrlKey ? onToggleOne?.(n.id) : onSelectOne?.(n.id)
          }
          onDragSelectedByScreen={onDragSelectedByScreen}
          onScaleNode={(newScale) => onScaleNode?.(n.id, newScale)}
          onDelete={() => onDeleteNode?.(n.id)}
          onChange={(text) => onChange?.(n.id, text)}
          groupLiveFactor={groupLiveFactor}
        />
      ))}

      {/* Marquee rectangle */}
      {dragSel && (
        <div
          data-ui
          style={{
            position: "fixed",
            left: Math.min(dragSel.x0, dragSel.x1),
            top: Math.min(dragSel.y0, dragSel.y1),
            width: Math.abs(dragSel.x1 - dragSel.x0),
            height: Math.abs(dragSel.y1 - dragSel.y0),
            background: "rgba(59,130,246,0.12)",
            border: `1px solid ${BLUE}`,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />
      )}

      {/* Group toolbar + resize handle */}
      {groupRect && selectedIds.length > 1 && (
        <>
          <div
            data-ui
            style={{
              position: "fixed",
              left: groupRect.left - 4,
              top: Math.max(8, groupRect.top - 36),
              display: "flex",
              gap: 6,
              zIndex: 6,
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              padding: "4px 6px",
            }}
          >
            <button
              onPointerDown={onDeleteSelectedClick}
              data-ui
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: "#fee2e2",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Delete selected"
            >
              Delete
            </button>
            <button
              onPointerDown={onCombineSelectedClick}
              data-ui
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid #e5e7eb",
                background: "#eef2ff",
                cursor: "pointer",
                fontSize: 12,
              }}
              title="Combine text"
            >
              Combine
            </button>
          </div>

          <div
            data-ui
            onPointerDown={onGroupHandleDown}
            style={{
              position: "fixed",
              left: groupRect.right + GROUP_OFFSET,
              top: groupRect.bottom + GROUP_OFFSET,
              width: GROUP_HANDLE,
              height: GROUP_HANDLE,
              background: "#fff",
              border: `2px solid ${BLUE}`,
              borderRadius: 3,
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              cursor: "nwse-resize",
              zIndex: 6,
            }}
            title="Resize all (drag)"
          />
        </>
      )}
    </div>
  );
}

// ---------- Single node item ----------
function NodeItem({
  node,
  setWrapperRef,
  setTextRef,
  camX,
  camY,
  Z,
  selected,
  multiSelected,
  autoFocus,
  onClickSelect,
  onDragSelectedByScreen,
  onScaleNode,
  onDelete,
  onChange,
  groupLiveFactor,
}) {
  const wrapperRef = useRef(null);
  const textRef = useRef(null);

  // mode: 'none' | 'drag' | 'resize' (single-node)
  const modeRef = useRef("none");
  const lastClient = useRef({ x: 0, y: 0 });

  // single resize state managed with global listeners
  const startClient = useRef({ x: 0, y: 0 });
  const startScale = useRef(node.scale ?? 1);
  const lastScaleRef = useRef(node.scale ?? 1);
  const singleMoveUpCleanup = useRef(null);

  const basePx = 14;
  const selfScale = node.scale ?? 1;
  const effectiveScale =
    selected && groupLiveFactor != null
      ? selfScale * groupLiveFactor
      : selfScale;

  const fontPx = basePx * Z * effectiveScale;

  // world → screen
  const leftScr = node.x * Z + camX;
  const topScr = node.y * Z + camY;

  useEffect(() => {
    if (wrapperRef.current) setWrapperRef(wrapperRef.current);
    if (textRef.current) setTextRef(textRef.current);
  }, [setWrapperRef, setTextRef]);

  // autofocus newly created node
  useEffect(() => {
    if (autoFocus && textRef.current) {
      const el = textRef.current;
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [autoFocus]);

  const isOnRing = (e) => {
    const el = wrapperRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const inside = x >= 0 && x <= r.width && y >= 0 && y <= r.height;
    const nearEdge =
      x <= RING_HIT ||
      y <= RING_HIT ||
      x >= r.width - RING_HIT ||
      y >= r.height - RING_HIT;
    return inside && nearEdge;
  };

  // Click to select / toggle
  const onWrapperClick = (e) => onClickSelect?.(e);

  // Drag ring: move whole selection
  const onWrapperPointerDown = (e) => {
    if (e.button !== 0) return;
    if (selected && isOnRing(e) && !e.shiftKey) {
      modeRef.current = "drag";
      lastClient.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onWrapperPointerMove = (e) => {
    if (modeRef.current !== "drag") return;
    const dx = e.clientX - lastClient.current.x;
    const dy = e.clientY - lastClient.current.y;
    if (dx || dy) {
      onDragSelectedByScreen?.(dx, dy);
      lastClient.current = { x: e.clientX, y: e.clientY };
    }
    e.preventDefault();
    e.stopPropagation();
  };
  const onWrapperPointerUp = (e) => {
    if (modeRef.current === "drag") {
      modeRef.current = "none";
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Single-node resize: ONLY while handle held (global listeners)
  const onSingleHandleDown = (e) => {
    if (e.button !== 0) return;
    if (!selected || multiSelected) return;

    modeRef.current = "resize";
    startClient.current = { x: e.clientX, y: e.clientY };
    startScale.current = node.scale ?? 1;
    lastScaleRef.current = startScale.current;

    const onMove = (ev) => {
      const dx = ev.clientX - startClient.current.x;
      const dy = ev.clientY - startClient.current.y;
      const delta = (dx + dy) / 2;

      const rate = ev.shiftKey
        ? PX_PER_DOUBLE_SHIFT
        : ev.altKey
        ? PX_PER_DOUBLE_ALT
        : PX_PER_DOUBLE_BASE;

      const factor = Math.exp((Math.LN2 / rate) * delta);
      const newScale = clampScale(startScale.current * factor);

      lastScaleRef.current = newScale; // remember latest
      onScaleNode?.(newScale); // live preview while pressed
    };
    const onUp = () => {
      modeRef.current = "none";
      // commit again to be absolutely sure the last value sticks
      onScaleNode?.(lastScaleRef.current);

      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      singleMoveUpCleanup.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    singleMoveUpCleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };

    e.preventDefault();
    e.stopPropagation();
  };
  useEffect(
    () => () => {
      singleMoveUpCleanup.current?.();
    },
    []
  );

  // Delete (red dot)
  const onDeletePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      ref={wrapperRef}
      data-node-wrapper
      style={{
        position: "absolute",
        left: leftScr,
        top: topScr,
        boxShadow: selected ? `0 0 0 ${RING_WIDTH}px ${BLUE}` : "none",
        cursor: selected ? "move" : "text",
      }}
      onClick={onWrapperClick}
      onPointerDown={onWrapperPointerDown}
      onPointerMove={onWrapperPointerMove}
      onPointerUp={onWrapperPointerUp}
      onPointerCancel={onWrapperPointerUp}
    >
      <div
        ref={textRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          let txt = e.currentTarget.innerText.replace(/\r\n/g, "\n");
          txt = txt.replace(/\n{3,}/g, "\n\n");
          txt = txt.replace(/\n$/, "");
          onChange?.(txt);
        }}
        onPaste={(e) => {
          e.preventDefault();
          const clip = (e.clipboardData || window.clipboardData).getData(
            "text"
          );
          document.execCommand(
            "insertText",
            false,
            clip.replace(/\r\n/g, "\n")
          );
        }}
        style={{
          fontSize: `${fontPx}px`,
          lineHeight: 1.2,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          textRendering: "optimizeLegibility",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          padding: "2px 4px",
          background: "transparent",
          userSelect: "text",
        }}
      >
        {node.text}
      </div>

      {/* Single-node controls (only in single selection) */}
      {selected && !multiSelected && (
        <>
          <div
            onPointerDown={onDeletePointerDown}
            data-ui
            title="Delete"
            style={{
              position: "absolute",
              left: -(DELETE_SIZE + DELETE_OFFSET),
              top: -(DELETE_SIZE + DELETE_OFFSET),
              width: DELETE_SIZE,
              height: DELETE_SIZE,
              background: "#ef4444",
              border: "2px solid #fff",
              borderRadius: "9999px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              cursor: "pointer",
            }}
          />
          <div
            data-ui
            onPointerDown={onSingleHandleDown}
            style={{
              position: "absolute",
              right: -(HANDLE_SIZE + HANDLE_OFFSET),
              bottom: -(HANDLE_SIZE + HANDLE_OFFSET),
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              background: "#fff",
              border: `2px solid ${BLUE}`,
              borderRadius: 3,
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              cursor: "nwse-resize",
            }}
            title="Resize"
          />
        </>
      )}
    </div>
  );
}

function clampScale(s) {
  const MIN = 0.05,
    MAX = 20;
  return Math.min(MAX, Math.max(MIN, s));
}
