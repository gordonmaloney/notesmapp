import { useRef, useEffect, useMemo, useState, useLayoutEffect } from "react";
import NodeItem from "./NodeItem";

const BLUE = "#3b82f6";

const GROUP_HANDLE = 14;
const GROUP_OFFSET = 8;

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
  hideDoneNodes,

  onBackgroundClickAway,

  onAddTaskNode,
  doneNodeIds,
  focusId,
  onChange, // (id, html)

  registerMeasureApi,
  onSetNodeWrap,
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

  const cleanHTML = (html) =>
    (html || "")
      .replace(/\r\n/g, "\n")
      .replace(/(\s*<br\s*\/?>\s*){3,}/gi, "<br><br>")
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
          node.querySelectorAll(":scope > li").forEach((li) => {
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
    return lines.filter((l) => l.replace(/<br\s*\/?>/gi, "").trim() !== "");
  };

  const setEditorHTML = (el, html, alsoUpdateState = true) => {
    if (!el) return;
    el.innerHTML = html || "";
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.addRange(r);
    }
    if (alsoUpdateState && focusedEditorId != null) {
      onChange?.(focusedEditorId, html || "");
    }
  };

  const toggleOrderedList = () => {
    const el = getFocusedEditor();
    if (!el) return;

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
    const list = `<ul data-checklist="true" style="list-style:none;margin:0;padding-left:0;line-height:5px">
      ${lines
        .map(
          (l) => `<li>
            <label style="display:flex;align-items:center;gap:0.4em;">
              <input type="checkbox" style="width:1em;height:30px;overflow:hidden;margin-top:0.2em" />
              <span>${l || "<br>"}</span>
            </label>
          </li>`
        )
        .join("")}
    </ul>`;
    setEditorHTML(el, list);
  };

  // Expose a simple measurement API up to Canvas
  useEffect(() => {
    if (!registerMeasureApi) return;
    const api = {
      // returns [{ id, rect: DOMRect }]
      getMetrics: () =>
        Array.from(wrapperRefs.current.entries()).map(([id, wrapEl]) => {
          const textEl = textRefs.current.get(id);
          const rect = wrapEl.getBoundingClientRect();
          // Prefer the text box’s rendered dimensions; fall back to wrapper/rect
          const width =
            (textEl?.offsetWidth ?? wrapEl?.offsetWidth ?? rect.width) || 0;
          const height =
            (textEl?.offsetHeight ?? wrapEl?.offsetHeight ?? rect.height) || 0;
          const area = Math.max(0, width) * Math.max(0, height);
          return { id, rect, width, height, area };
        }),
    };
    registerMeasureApi(api);
    return () => registerMeasureApi(null);
  }, [registerMeasureApi, nodes, Z, camera.x, camera.y]);

  // ===== marquee + group selection =====
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
  }, [selectedIds, nodes, Z, camera.x, camera.y]);

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

  // group resize
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

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const selectedNodes = selectedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.y - b.y || a.x - b.x);

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

  let doneNodes = Array.from(doneNodeIds);

  const doneSet = useMemo(() => new Set(doneNodes), [doneNodes]);
  const [nodesToDisplay, setNodesToDisplay] = useState([]);


  useEffect(() => {
    const doneSet = new Set(doneNodes);
    const next = hideDoneNodes
      ? nodes.filter((n) => !doneSet.has(n.id))
      : nodes;

    // shallow equality to avoid pointless state updates
    const sameLength = next.length === nodesToDisplay.length;
    const sameItems =
      sameLength && next.every((n, i) => n === nodesToDisplay[i]);
    if (!sameItems) setNodesToDisplay(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, doneNodes, hideDoneNodes]);


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
      {nodesToDisplay.map((n) => (
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
          onSetWrap={(wrapChOrNull) => onSetNodeWrap?.(n.id, wrapChOrNull)}
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
            border: "1px dashed #60a5fa",
            background: "rgba(96,165,250,0.08)",
            pointerEvents: "none",
            zIndex: 100,
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
            width: "max-content",
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
