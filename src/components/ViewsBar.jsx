export default function ViewsBar({
  views,
  editingViewId,
  editingName,
  setEditingName,
  jumpToView,
  startRenameView,
  commitRenameView,
  updateViewCamera,
  deleteView,
  saveCurrentView,
}) {
  const chipStyle = (bg = "#fff") => ({
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: bg,
    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  });
  return (
    <div
      data-ui
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 10,
        left: 12,
        right: 12,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 8,
        zIndex: 1000,
        pointerEvents: "auto",
        flexWrap: "wrap",
      }}
    >
      <button
        title="Go Home (reset)"
        onClick={(e) => {
          e.stopPropagation();
          jumpToView({ x: 0, y: 0, zoomBase: 1, zoomExp: 0 }, true);
        }}
        style={chipStyle()}
      >
        Home
      </button>
      <div
        style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}
      >
        {views
          .filter((v) => v.id !== "home")
          .map((v) => (
            <div
              key={v.id}
              style={{ display: "flex", flexDirection: "column" }}
            >
              {editingViewId === v.id ? (
                <div
                style={{display: "flex", flexDirection: 'column'}}
                >
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => setTimeout(() => commitRenameView(), 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRenameView();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingName("");
                      }
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      ...chipStyle("#fff"),
                      padding: "5px 8px",
                      width: Math.max(80, editingName.length * 8 + 24),
                    }}
                  />
                  <div
                    data-ui
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={{
                      display: "flex",
                      flexDirection: 'column',
                      gap: 6,
                      marginTop: 4,
                      alignItems: "center",
                      justifyContent: "flex-start",
                    }}
                  >
                    <button
                      title="Update this view to the current pan/zoom"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateViewCamera(v.id);
                      }}
                      style={chipStyle("#eef2ff")}
                    >
                      Update view
                    </button>
                    <button
                      title="Delete this view"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteView(v.id);
                      }}
                      style={{
                        ...chipStyle("#fee2e2"),
                        borderColor: "#fecaca",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToView(v.camera, true);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRenameView(v);
                  }}
                  title={`Go to ${v.name} (double-click to rename)`}
                  style={chipStyle()}
                >
                  {v.name}
                </button>
              )}
            </div>
          ))}
      </div>
      <button
        title="Save current view"
        onClick={(e) => {
          e.stopPropagation();
          saveCurrentView();
        }}
        style={chipStyle("#eef2ff")}
      >
        + Save view
      </button>
    </div>
  );
}
