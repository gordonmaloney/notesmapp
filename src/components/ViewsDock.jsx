import { useState, useMemo } from "react";
import ViewsBar from "./ViewsBar";
import { normalizeZoomPure } from "../hooks/useCamera";

export default function ViewsDock({
  views,
  setViews,
  cameraRef,
  containerRef,
  nodes,
  nodesMeasureRef,
  jumpToView, // jumpToView(cameraRef, containerRef, targetCam, animate, opts)
}) {
  const [editingViewId, setEditingViewId] = useState(null);
  const [editingName, setEditingName] = useState("");

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
    const api = nodesMeasureRef?.current;
    const container = containerRef?.current;
    if (!api || !container) return null;
    const viewport = container.getBoundingClientRect();
    const metrics = api.getMetrics?.() || [];
    const visible = metrics
      .map(({ id, rect, area }) => {
        const L = Math.max(rect.left, viewport.left);
        const R = Math.min(rect.right, viewport.right);
        const T = Math.max(rect.top, viewport.top);
        const B = Math.min(rect.bottom, viewport.bottom);
        const w = Math.max(0, R - L);
        const h = Math.max(0, B - T);
        return {
          id,
          area: w > 0 && h > 0 ? area : 0,
          top: rect.top,
          left: rect.left,
        };
      })
      .filter((m) => m.area > 0);
    if (!visible.length) return null;
    visible.sort((a, b) => b.area - a.area || a.top - b.top || a.left - b.left);
    const best = visible[0];
    const node = nodes.find((n) => n.id === best.id);
    const title = titleFromHtml(node?.text);
    return title || null;
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

  return (
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
  );
}
