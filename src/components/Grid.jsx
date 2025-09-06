import { useEffect, useRef } from "react";
import { scale } from "../hooks/useCamera";
import { worldToScreen } from "../utils/math";

export default function Grid({ camera }) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const Z = scale(camera);
    const spacingWorld = 50;

    const leftWorld = -camera.x / Z;
    const topWorld = -camera.y / Z;
    const rightWorld = (canvas.width / dpr - camera.x) / Z;
    const bottomWorld = (canvas.height / dpr - camera.y) / Z;

    ctx.strokeStyle = "#eee";
    ctx.beginPath();

    let logged = false;

    for (
      let x = Math.floor(leftWorld / spacingWorld) * spacingWorld;
      x < rightWorld;
      x += spacingWorld
    ) {
      const { x: sx } = worldToScreen({ x, y: 0 }, camera);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height / dpr);

      if (!logged) {
        console.log("Grid X world", x, "→ screen", sx);
        logged = true;
      }
    }

    for (
      let y = Math.floor(topWorld / spacingWorld) * spacingWorld;
      y < bottomWorld;
      y += spacingWorld
    ) {
      const { y: sy } = worldToScreen({ x: 0, y }, camera);
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width / dpr, sy);

      if (logged === true) {
        console.log("Grid Y world", y, "→ screen", sy);
        logged = "done";
      }
    }

    ctx.stroke();
  }, [camera]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
