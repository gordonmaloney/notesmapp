// src/components/DrawToolbar.jsx
export default function DrawToolbar({ activeTool, setActiveTool }) {
  const buttons = [
    { key: "line", label: "／", title: "Draw line" },
    { key: "rect", label: "▭", title: "Draw rectangle" },
    { key: "circle", label: "◯", title: "Draw circle" },
    { key: "text", label: "T", title: "Text mode (single-click to add)" },
  ];

  return (
    <div
      data-ui
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "50%",
        right: 12,
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 1000, // Increased from 60 to 1000 to be above the overlay
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {buttons.map((b) => (
        <button
          key={b.key}
          onMouseDown={(e) => {
            console.log(
              `[TOOLBAR] MouseDown on ${b.key}, activeTool:`,
              activeTool
            );
            e.stopPropagation();
            e.preventDefault();
            // Toggle the specific tool: if it's already active, turn it off; otherwise, activate it
            const newTool = activeTool === b.key ? null : b.key;
            console.log(`[TOOLBAR] Setting activeTool to:`, newTool);
            setActiveTool(newTool);
          }}
          onClick={(e) => {
            console.log(`[TOOLBAR] Click on ${b.key}, activeTool:`, activeTool);
            e.stopPropagation();
          }} // Keep this as backup
          title={b.title}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: activeTool === b.key ? "#eef2ff" : "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: "36px",
            fontWeight: b.key === "text" ? 700 : 400,
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
