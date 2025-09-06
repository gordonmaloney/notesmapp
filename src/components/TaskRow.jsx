export default function TaskRow({
  title,
  done,
  onGo,
  onToggle,
  onRemove,
  draggableProps,
}) {
  return (
    <div
      {...draggableProps}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: done ? "#f0fdf4" : "#fff",
        marginBottom: 6,
      }}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle?.(e.target.checked)}
        title={done ? "Mark as to-do" : "Mark as done"}
        style={{ cursor: "pointer" }}
      />
      <div
        onClick={onGo}
        title="Go to task"
        style={{
          flex: 1,
          fontSize: 12,
          color: "#111827",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
      >
        {title}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove?.();
        }}
        title="Remove task"
        style={{
          width: 22,
          height: 22,
          lineHeight: "20px",
          fontSize: 14,
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          background: "#fff",
          color: "#ef4444",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
