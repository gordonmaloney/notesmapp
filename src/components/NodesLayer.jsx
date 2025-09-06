import { useRef, useEffect, useState, useLayoutEffect } from "react";

const BLUE = "#3b82f6";
const RING_WIDTH = 2;
const RING_HIT = 8;

const HANDLE_SIZE = 12;
const HANDLE_OFFSET = 6;

const GROUP_HANDLE = 14;
const GROUP_OFFSET = 8;

const DELETE_SIZE = 12;
const DELETE_OFFSET = 6;

const PX_PER_DOUBLE_BASE = 60;
const PX_PER_DOUBLE_SHIFT = 120;
const PX_PER_DOUBLE_ALT = 30;

export default function NodesLayer({
  nodes,
  camera,
  Z,

  selectedIds,
  onSetSelection,
  onSelectOne,
  onToggleOne,

  onDragSelectedByScreen,
  onGroupScaleCommit,
  onDeleteSelected,
  onCombineSelected,

  onScaleNode,
  onDeleteNode,

  onBackgroundClickAway,

  onAddTaskNode,
  doneNodeIds,
  focusId,
  onChange, // (id, html)
}) {
  const { x: camX, y: camY } = camera;
  const rootRef = useRef(null);

  const wrapperRefs = useRef(new Map());
  const textRefs = useRef(new Map());
  const setWrapperRef = (id) => (el) => {
    if (el) wrapperRefs.current.set(id, el);
    else wrapperRefs.current.delete(id);
  };
  const setTextRef = (id) => (el) => {
    if (el) textRefs.current.set(id, el);
    else textRefs.current.delete(id);
  };

  // put this helper near the top of NodesLayer.jsx
  const cleanHTML = (html) =>
    (html || "")
      .replace(/\r\n/g, "\n")
      // collapse 3+ <br>s
      .replace(/(\s*<br\s*\/?>\s*){3,}/gi, "<br><br>")
      // trim leading/trailing <br>s
      .replace(/^(?:\s*<br\s*\/?>)+/i, "")
      .replace(/(?:\s*<br\s*\/?>)+$/i, "");

  // ===== Formatting toolbar state =====
  const [focusedEditorId, setFocusedEditorId] = useState(null);
  const savedRangeRef = useRef(null);
  const [boldActive, setBoldActive] = useState(false);
  const [italicActive, setItalicActive] = useState(false);

  useEffect(() => {
    if (!focusedEditorId) return;
    const onSel = () => {
      const el = textRefs.current.get(focusedEditorId);
      const sel = document.getSelection?.();
      if (!el || !sel || sel.rangeCount === 0) return;
      if (!el.contains(sel.anchorNode)) return;
      try {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
        setBoldActive(document.queryCommandState("bold"));
        setItalicActive(document.queryCommandState("italic"));
      } catch {}
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [focusedEditorId]);

  const focusAndRestore = () => {
    const el = focusedEditorId ? textRefs.current.get(focusedEditorId) : null;
    if (!el) return false;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    if (savedRangeRef.current) sel.addRange(savedRangeRef.current);
    else {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.addRange(r);
    }
    return true;
  };

  const execFormat = (cmd) => {
    if (!focusAndRestore()) return;
    try {
      document.execCommand(cmd, false, null);
    } catch {}
    setTimeout(() => {
      try {
        setBoldActive(document.queryCommandState("bold"));
        setItalicActive(document.queryCommandState("italic"));
      } catch {}
    }, 0);
  };

  // ===== Line ↔ list helpers =====
  const getFocusedEditor = () =>
    focusedEditorId ? textRefs.current.get(focusedEditorId) : null;

  // Parse current editor HTML into "visual lines" preserving inline markup where possible
  const htmlToLines = (html) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    const lines = [];
    let cur = "";

    const flush = () => {
      lines.push(cur);
      cur = "";
    };

    tmp.childNodes.forEach((node) => {
      if (node.nodeType === 1) {
        const tag = node.tagName;
        if (tag === "BR") {
          flush();
        } else if (tag === "DIV" || tag === "P") {
          lines.push(node.innerHTML);
        } else if (tag === "OL" || tag === "UL") {
          // unwrap existing list to lines
          node.querySelectorAll(":scope > li").forEach((li) => {
            // For checklist, use span if present to get text+inline marks
            const labelSpan = li.querySelector("label > span");
            lines.push(labelSpan ? labelSpan.innerHTML : li.innerHTML);
          });
        } else {
          cur += node.outerHTML;
        }
      } else if (node.nodeType === 3) {
        cur += node.nodeValue;
      }
    });
    if (cur.trim() !== "") flush();

    // normalize empties (skip purely empty lines)
    return lines.filter((l) => l.replace(/<br\s*\/?>/gi, "").trim() !== "");
  };

  const setEditorHTML = (el, html, alsoUpdateState = true) => {
    if (!el) return;
    el.innerHTML = html || "";
    // place caret at end
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.addRange(r);
    }
    // optionally sync state so changes persist across selection changes
    if (alsoUpdateState && focusedEditorId != null) {
      onChange?.(focusedEditorId, html || "");
    }
  };

  const toggleOrderedList = () => {
    const el = getFocusedEditor();
    if (!el) return;

    // If already an ordered list at top level, unwrap back to lines
    const first = el.firstElementChild;
    if (first && first.tagName === "OL") {
      const lines = Array.from(first.querySelectorAll(":scope > li")).map(
        (li) => li.innerHTML
      );
      setEditorHTML(el, lines.join("<br>"));
      return;
    }

    const lines = htmlToLines(el.innerHTML);
    if (lines.length === 0) return;
    const list = `<ol style="margin:0;padding-left:1.4em">${lines
      .map((l) => `<li>${l || "<br>"}</li>`)
      .join("")}</ol>`;
    setEditorHTML(el, list);
  };

  const toggleChecklist = () => {
    const el = getFocusedEditor();
    if (!el) return;

    const first = el.firstElementChild;
    if (first && first.tagName === "UL" && first.dataset.checklist === "true") {
      const lines = Array.from(first.querySelectorAll(":scope > li")).map(
        (li) => {
          const span = li.querySelector("label > span");
          return span ? span.innerHTML : li.innerHTML;
        }
      );
      setEditorHTML(el, lines.join("<br>"));
      return;
    }

    const lines = htmlToLines(el.innerHTML);
    if (lines.length === 0) return;
    const list = `<ul data-checklist="true" style="list-style:none;margin:0;padding-left:0">
      ${lines
        .map(
          (l) => `<li>
            <label style="display:flex;align-items:flex-start;gap:0.4em">
              <input type="checkbox" style="width:1em;height:1em;margin-top:0.2em" />
              <span>${l || "<br>"}</span>
            </label>
          </li>`
        )
        .join("")}
    </ul>`;
    setEditorHTML(el, list);
  };

  // ===== marquee + group selection (unchanged) =====
  const [dragSel, setDragSel] = useState(null);
  const [groupLiveFactor, setGroupLiveFactor] = useState(null);
  const groupLiveFactorRef = useRef(1);
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

  const downRef = useRef(null);
  const CLICK_EPS = 3;

  const onRootPointerDown = (e) => {
    if (e.button !== 0) return;
    const hitNode = e.target.closest?.("[data-node-wrapper]");
    const hitUI = e.target.closest?.("[data-ui]");
    const emptySurface = !hitNode && !hitUI;
    downRef.current = { empty: emptySurface, x: e.clientX, y: e.clientY };
    if (emptySurface) {
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
      if (ids.length === 0) {
        onBackgroundClickAway?.();
        setFocusedEditorId(null);
      }

      setDragSel(null);
      rootRef.current.releasePointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }

    if (down && down.empty) {
      const dx = Math.abs(e.clientX - down.x);
      const dy = Math.abs(e.clientY - down.y);
      if (dx < CLICK_EPS && dy < CLICK_EPS) {
        onSetSelection?.([]);
        onBackgroundClickAway?.();
        setFocusedEditorId(null);
        e.preventDefault();
      }
    }
  };

  // group resize (unchanged)
  const groupMoveUpCleanup = useRef(null);
  const onGroupHandleDown = (e) => {
    if (e.button !== 0 || !groupRect) return;
    const start = { x: e.clientX, y: e.clientY };
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

  useEffect(() => () => groupMoveUpCleanup.current?.(), []);

  // toolbar actions (group) unchanged
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
  // replace your onCombineSelectedClick with this:
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

    // Pull LIVE HTML from DOM (captures unsaved edits & styling)
    const partsHtml = selectedNodes.map((n) => {
      const el = textRefs.current.get(n.id);
      const liveHtml = el?.innerHTML;
      const source = typeof liveHtml === "string" ? liveHtml : n.text || "";
      return cleanHTML(source);
    });

    const combinedHtml = partsHtml.filter(Boolean).join("<br><br>");

    const avgX =
      selectedNodes.reduce((s, n) => s + n.x, 0) / selectedNodes.length;
    const avgY =
      selectedNodes.reduce((s, n) => s + n.y, 0) / selectedNodes.length;
    const avgScale =
      selectedNodes.reduce((s, n) => s + (n.scale ?? 1), 0) /
      selectedNodes.length;

    onCombineSelected?.({
      ids: selectedIds.slice(),
      combinedHtml,
      avgX,
      avgY,
      avgScale,
    });
  };

  const formatBtnStyle = (active) => ({
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: active ? "#eef2ff" : "#fff",
    cursor: "pointer",
    fontSize: 12,
    lineHeight: 1,
    userSelect: "none",
  });

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
          onChange={(html) => onChange?.(n.id, html)}
          groupLiveFactor={groupLiveFactor}
          onEditorFocus={() => setFocusedEditorId(n.id)}
          onEditorBlur={() => {
            setTimeout(() => {
              setFocusedEditorId((cur) => (cur === n.id ? null : cur));
            }, 0);
          }}
          onAddTask={() => onAddTaskNode?.(n.id)}
          isDone={doneNodeIds?.has(n.id)}
        />
      ))}

      {/* marquee */}
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

      {/* group toolbar + handle */}
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

      {/* ===== Bottom formatting toolbar ===== */}
      {focusedEditorId != null && (
        <div
          data-ui
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 12,
            transform: "translateX(-50%)",
            display: "inline-flex",
            gap: 8,
            padding: "6px 8px",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            zIndex: 20,
          }}
        >
          <button
            type="button"
            data-ui
            title="Bold (Ctrl/Cmd+B)"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              execFormat("bold");
            }}
            style={formatBtnStyle(boldActive)}
          >
            <span style={{ fontWeight: 700 }}>B</span>
          </button>
          <button
            type="button"
            data-ui
            title="Italic (Ctrl/Cmd+I)"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              execFormat("italic");
            }}
            style={formatBtnStyle(italicActive)}
          >
            <span style={{ fontStyle: "italic" }}>I</span>
          </button>
          {/* NEW: Ordered list */}
          <button
            type="button"
            data-ui
            title="Toggle ordered list"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleOrderedList();
            }}
            style={formatBtnStyle(false)}
          >
            1.
          </button>
          {/* NEW: Checklist */}
          <button
            type="button"
            data-ui
            title="Toggle checklist"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleChecklist();
            }}
            style={formatBtnStyle(false)}
          >
            ☐
          </button>
        </div>
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
  onEditorFocus,
  onEditorBlur,
  onAddTask,
  isDone
}) {
  const wrapperRef = useRef(null);
  const textRef = useRef(null);

  const modeRef = useRef("none");
  const lastClient = useRef({ x: 0, y: 0 });

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

  const leftScr = node.x * Z + camX;
  const topScr = node.y * Z + camY;

  useEffect(() => {
    if (wrapperRef.current) setWrapperRef(wrapperRef.current);
    if (textRef.current) setTextRef(textRef.current);
  }, [setWrapperRef, setTextRef]);

  // Uncontrolled: only set HTML when prop changes and not focused
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      el.innerHTML = node.text || "";
    }
  }, [node.text]);

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

  const onWrapperClick = (e) => onClickSelect?.(e);

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
      lastScaleRef.current = newScale;
      onScaleNode?.(newScale);
    };
    const onUp = () => {
      modeRef.current = "none";
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
  useEffect(() => () => singleMoveUpCleanup.current?.(), []);

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
      data-id={node.id}
      style={{
        zIndex: 10,
        position: "absolute",
        left: leftScr,
        top: topScr,
        display: "inline-block",
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
        onFocus={() => onEditorFocus?.()}
        onBlur={(e) => {
          const html = e.currentTarget.innerHTML;
          onChange?.(html);
          onEditorBlur?.();
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
          textRendering: "optimizeLegibility",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          padding: "2px 4px",
          background: "transparent",
          userSelect: "text",
          whiteSpace: "normal",
          wordBreak: "break-word",
          minWidth: 1,
          minHeight: 1,
          background: isDone ? "#dcfce7" : "transparent", // ← pale green for done
        }}
      />
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
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              onAddTask?.();
            }}
            title="Add to Tasks"
            style={{
              position: "absolute",
              right: -(12 + 6), // size + offset
              top: -(12 + 6),
              width: 12,
              height: 12,
              background: "#3b82f6",
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
