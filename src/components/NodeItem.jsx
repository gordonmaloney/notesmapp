// src/components/NodeItem.jsx
import { useRef, useEffect, useState, useLayoutEffect } from "react";

const BLUE = "#3b82f6";
const RING_WIDTH = 2;
const RING_HIT = 8;

const HANDLE_SIZE = 12;
const HANDLE_OFFSET = 6;

const WIDTH_HANDLE = 12;
const WIDTH_OFFSET = 6;

const DELETE_SIZE = 12;
const DELETE_OFFSET = 6;

const PX_PER_DOUBLE_BASE = 60;
const PX_PER_DOUBLE_SHIFT = 120;
const PX_PER_DOUBLE_ALT = 30;

const WIDTH_DRAG_SLOWNESS = 3.5; // higher = slower drag
const WIDTH_MIN_CH = 4;
const WIDTH_MAX_CH = 240;

export default function NodeItem({
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
  isDone,
  onSetWrap,
}) {
  const wrapperRef = useRef(null);
  const textRef = useRef(null);
  const chProbeRef = useRef(null);

  const modeRef = useRef("none");
  const lastClient = useRef({ x: 0, y: 0 });

  const startClient = useRef({ x: 0, y: 0 });
  const startScale = useRef(node.scale ?? 1);
  const lastScaleRef = useRef(node.scale ?? 1);
  const singleMoveUpCleanup = useRef(null);

  // width drag state
  const widthMoveCleanup = useRef(null);
  const startWrapChRef = useRef(null);
  const chPxRef = useRef(8); // fallback
  const [previewCh, setPreviewCh] = useState(null);

  const basePx = 14;
  const selfScale = node.scale ?? 1;
  const effectiveScale =
    selected && groupLiveFactor != null
      ? selfScale * groupLiveFactor
      : selfScale;
  const fontPx = basePx * Z * effectiveScale;

  const leftScr = node.x * Z + camX;
  const topScr = node.y * Z + camY;

  // measure "1ch" in current font (screen px)
  const measureChPx = () => {
    const probe = chProbeRef.current;
    if (!probe) return;
    const r = probe.getBoundingClientRect();
    if (r.width > 0) chPxRef.current = r.width / 10; // probe is 10ch wide
  };

  useLayoutEffect(() => {
    measureChPx();
  }, [fontPx, Z]);

  useEffect(() => {
    if (wrapperRef.current) setWrapperRef(wrapperRef.current);
    if (textRef.current) setTextRef(textRef.current);
  }, [
    setWrapperRef,
    setTextRef,
    fontPx,
    Z,
    selfScale,
    effectiveScale,
    node.text,
  ]);

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
      el.focus({ preventScroll: true });
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {}
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

  // ===== scale (bottom-right) =====
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

  // ===== width (right-middle), with preview + smoother sensitivity =====
  const onWidthHandleDown = (e) => {
    if (e.button !== 0) return;
    if (!selected || multiSelected) return;

    measureChPx();
    startClient.current = { x: e.clientX, y: e.clientY };

    // start from explicit wrapCh, or infer current rendered width in ch
    const el = textRef.current;
    const r = el?.getBoundingClientRect();
    const inferredCh = r ? r.width / chPxRef.current : 40;
    const startCh =
      typeof node.wrapCh === "number" && isFinite(node.wrapCh)
        ? node.wrapCh
        : inferredCh;

    startWrapChRef.current = Math.max(
      WIDTH_MIN_CH,
      Math.min(WIDTH_MAX_CH, startCh)
    );
    setPreviewCh(startWrapChRef.current);

    const onMove = (ev) => {
      const dxPx = ev.clientX - startClient.current.x;
      const speed = ev.shiftKey ? 2 : ev.altKey ? 0.5 : 1; // speed only, no snap
      const deltaCh = (dxPx / chPxRef.current / WIDTH_DRAG_SLOWNESS) * speed;
      let nextCh = startWrapChRef.current + deltaCh;

      nextCh = Math.max(WIDTH_MIN_CH, Math.min(WIDTH_MAX_CH, nextCh));

      setPreviewCh(nextCh);
      onSetWrap?.(nextCh);
    };

    const onUp = () => {
      setPreviewCh(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      widthMoveCleanup.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    widthMoveCleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
    };

    e.preventDefault();
    e.stopPropagation();
  };
  useEffect(() => () => widthMoveCleanup.current?.(), []);

  const onWidthHandleDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSetWrap?.(null); // reset to unconstrained (single line)
  };

  const onDeletePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onDelete?.();
  };

  const widthStyle =
    node.wrapCh != null && isFinite(node.wrapCh)
      ? { maxWidth: `${node.wrapCh}ch` }
      : { width: "max-content" };

  return (
    <div
      ref={wrapperRef}
      data-node-wrapper
      data-id={node.id}
      data-node-id={node.id} // <— add this so autofocus helper (or other code) can target it
      style={{
        zIndex: 10,
        position: "absolute",
        left: leftScr,
        top: topScr,
        display: "block",
        width: "max-content",
        boxShadow: selected ? `0 0 0 ${RING_WIDTH}px ${BLUE}` : "none",
        cursor: selected ? "move" : "text",
        overflow: "visible",
      }}
      onClick={onWrapperClick}
      onPointerDown={onWrapperPointerDown}
      onPointerMove={onWrapperPointerMove}
      onPointerUp={onWrapperPointerUp}
      onPointerCancel={onWrapperPointerUp}
    >
      {/* probe to measure 1ch (10ch for precision) */}
      <span
        ref={chProbeRef}
        aria-hidden
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          width: "10ch",
          height: 0,
          overflow: "hidden",
        }}
      />

      {/* width preview ghost */}
      {previewCh != null && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${previewCh}ch`,
            outline: `1px dashed ${BLUE}`,
            outlineOffset: 0,
            pointerEvents: "none",
            opacity: 0.5,
          }}
        />
      )}

      <div
        ref={textRef}
        className="node-text"
        contentEditable
        tabIndex={0} // <— add this to make programmatic focus reliable (esp. iOS)
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
          ...widthStyle,
          ...(previewCh != null ? { minWidth: `${previewCh}ch` } : null),
          fontSize: `${fontPx}px`,
          lineHeight: 1.2,
          textRendering: "optimizeLegibility",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          padding: "2px 4px",
          background: "transparent",
          userSelect: "text",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "break-word",
          minWidth: "20px",
          WebkitUserSelect: "text",
          outline: "none",
          minHeight: 1,
          textDecoration: isDone ? "line-through" : "inherit",
        }}
      />

      {selected && !multiSelected && (
        <>
          {/* delete */}
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

          {/* add to tasks */}
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
              right: -(12 + 6),
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

          {/* scale handle (bottom-right) */}
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
            title="Resize (scale text)"
          />

          {/* width handle (right-middle) */}
          <div
            data-ui
            onPointerDown={onWidthHandleDown}
            onDoubleClick={onWidthHandleDoubleClick}
            style={{
              position: "absolute",
              right: -(WIDTH_HANDLE + WIDTH_OFFSET),
              top: "50%",
              transform: "translateY(-50%)",
              width: WIDTH_HANDLE,
              height: WIDTH_HANDLE,
              background: "#fff",
              border: `2px solid ${BLUE}`,
              borderRadius: 3,
              boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              cursor: "ew-resize",
            }}
            title={
              node.wrapCh != null
                ? `Max width: ${node.wrapCh}ch (drag / Alt fine / Shift coarse, dbl-click to unset)`
                : "Set max width (drag) / dbl-click to unset"
            }
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
