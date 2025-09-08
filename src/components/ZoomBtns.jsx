import React from "react";

const ZoomBtns = ({ onZoomInClick, onZoomOutClick }) => {
  return (
    <div
      data-ui
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 10,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "auto",
      }}
    >
      <button
        title="Zoom in (+)"
        onPointerDown={onZoomInClick}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        +
      </button>
      <button
        title="Zoom out (−)"
        onPointerDown={onZoomOutClick}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
          cursor: "pointer",
          fontSize: 20,
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        –
      </button>
    </div>
  );
};

export default ZoomBtns;
