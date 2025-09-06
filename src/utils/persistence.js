// src/utils/persistence.js
import { normalizeZoomPure } from "../hooks/useCamera";
const STORAGE_KEY = "infcanvas.v1";

const coerceNum = (n, d = 0) => (typeof n === "number" && isFinite(n) ? n : d);

export function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    let cam =
      data.camera && typeof data.camera === "object" ? data.camera : null;
    if (cam) {
      cam = {
        x: coerceNum(cam.x, 0),
        y: coerceNum(cam.y, 0),
        zoomBase: coerceNum(cam.zoomBase, 1),
        zoomExp: Math.trunc(coerceNum(cam.zoomExp, 0)),
      };
      cam = normalizeZoomPure(cam).camera;
    }

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

    const shapes = Array.isArray(data.shapes)
      ? data.shapes.filter(
          (s) =>
            s &&
            typeof s === "object" &&
            (s.type === "line" || s.type === "rect" || s.type === "circle")
        )
      : [];

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

export function savePersisted(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}
