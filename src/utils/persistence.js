import { normalizeZoomPure } from "../hooks/useCamera";


const API_BASE = import.meta.env?.VITE_API_BASE || null; // e.g. http://localhost:3001
const WRITE_HEADERS = {
  "Content-Type": "application/json",
  ...(import.meta.env?.VITE_API_TOKEN
    ? { Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}` }
    : {}),
};

const coerceNum = (n, d = 0) => (typeof n === "number" && isFinite(n) ? n : d);

function storageKey(docId) {
  return `infcanvas.v1.${docId}`;
}

function parseSnapshot(data) {
  try {
    if (!data || typeof data !== "object") return null;

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
          wrapCh:
            typeof n.wrapCh === "number" && isFinite(n.wrapCh)
              ? n.wrapCh
              : null,
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

function readLocal(docId) {
  try {
    //const raw = localStorage.getItem(storageKey(docId));





    if (!raw) return null;
    return parseSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(docId, payload) {
  try {
    localStorage.setItem(storageKey(docId), JSON.stringify(payload));
  } catch {}
}

export async function loadPersisted(docId = "home") {
  if (!API_BASE) return readLocal(docId);

  try {
    const res = await fetch(
      `${API_BASE}/api/doc/${encodeURIComponent(docId)}`,
      {
        credentials: "include",
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json(); // may be null
    const parsed = json ? parseSnapshot(json) : null;
    if (!parsed) return readLocal(docId);
    writeLocal(docId, parsed);
    return parsed;
  } catch {
    return readLocal(docId);
  }
}



export function savePersisted(docId, payload) {
  writeLocal(docId, payload);
  if (!API_BASE) return;
  fetch(`${API_BASE}/api/doc/${encodeURIComponent(docId)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

