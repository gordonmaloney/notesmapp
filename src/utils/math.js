import { scale } from "../hooks/useCamera";

export function worldToScreen(p, camera) {
  const Z = scale(camera);
  return { x: p.x * Z + camera.x, y: p.y * Z + camera.y };
}

export function screenToWorld(s, camera) {
  const Z = scale(camera);
  return { x: (s.x - camera.x) / Z, y: (s.y - camera.y) / Z };
}
