import { useState } from "react";
import TaskRow from "./TaskRow";

export default function TasksPanel({
  tasksOpen,
  taskSplit,
  setTaskSplit,
  setTasksOpen,
  tasks,
  nodes,
  goToTask,
  toggleTaskDone,
  removeTask,
  removeTasks,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDrop,
  barRef,
  onSplitDown,
  hideDoneNodes,
  setHideDoneNodes,
}) {
  const TASKS_W = 220;
  const firstLineFromHTML = (html = "") => {
    const div = document.createElement("div");
    div.innerHTML = html;
    const text = (div.textContent || "").replace(/\u00A0/g, " ").trim();
    return text.split(/\r?\n/)[0]?.trim() || "";
  };

  const [tasksToRemove, setTasksToRemove] = useState([1757755333774, 2, 3]);

  return (
    <>
      <div
        data-ui
        ref={barRef}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 60,
          bottom: 12,
          left: 12,
          width: TASKS_W,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          background: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
          zIndex: 40,
          transform: tasksOpen
            ? "translateX(0)"
            : `translateX(-${TASKS_W + 16}px)`,
          transition: "transform 200ms ease",
          pointerEvents: tasksOpen ? "auto" : "none",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#374151",
            margin: "2px 4px",
          }}
        >
          Tasks
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 160,
          }}
        >
          <div
            style={{
              flexBasis: `calc(${(taskSplit * 100).toFixed(2)}% - 4px)`,
              minHeight: 80,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {tasks.filter((t) => !t.done).length === 0 && (
              <div
                style={{ fontSize: 12, color: "#6b7280", margin: "2px 4px" }}
              >
                Select a node → Add to Tasks
              </div>
            )}
            {tasks
              .filter((t) => !t.done)
              .map((t, idx) => {
                const node = nodes.find((n) => n.id === t.nodeId);
                const title = node
                  ? firstLineFromHTML(node.text) || "(Untitled)"
                  : "(Missing node)";
                return (
                  <TaskRow
                    key={t.id}
                    title={title}
                    done={false}
                    onGo={() => goToTask(t)}
                    onToggle={() => toggleTaskDone(t.id, true)}
                    onRemove={() => removeTask(t.id)}
                    draggableProps={{
                      draggable: true,
                      onDragStart: onTaskDragStart("todo", idx),
                      onDragOver: onTaskDragOver("todo", idx),
                      onDrop: onTaskDrop,
                    }}
                  />
                );
              })}
          </div>
          <div
            onPointerDown={onSplitDown}
            style={{
              height: 8,
              margin: "4px 0",
              borderRadius: 4,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.08))",
              cursor: "row-resize",
              userSelect: "none",
            }}
            title="Drag to resize"
          />
          <center>
            <button onClick={() => setHideDoneNodes(!hideDoneNodes)}>
              {hideDoneNodes ? "Show" : "Hide"} completed tasks
            </button>
            <br />
            <br />
            <button
              onClick={(e) =>
                removeTasks(
                  tasks.filter((t) => t.done).map((task) => task.nodeId)
                )
              }
            >
              Remove all completed tasks
            </button>
            <br />
            <br />
          </center>
          <div
            style={{
              flex: 1,
              minHeight: 80,
              overflowY: "auto",
              paddingRight: 2,
            }}
          >
            {tasks
              .filter((t) => t.done)
              .map((t, idx) => {
                const node = nodes.find((n) => n.id === t.nodeId);
                const title = node
                  ? firstLineFromHTML(node.text) || "(Untitled)"
                  : "(Missing node)";
                return (
                  <TaskRow
                    key={t.id}
                    title={title}
                    done
                    onGo={() => goToTask(t)}
                    onToggle={() => toggleTaskDone(t.id, false)}
                    onRemove={() => removeTask(t.id)}
                    draggableProps={{
                      draggable: true,
                      onDragStart: onTaskDragStart("done", idx),
                      onDragOver: onTaskDragOver("done", idx),
                      onDrop: onTaskDrop,
                    }}
                  />
                );
              })}
          </div>
        </div>
      </div>

      {tasksOpen ? (
        <button
          data-ui
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTasksOpen(false)}
          title="Hide tasks"
          style={sideToggleStyle(12 + TASKS_W + 8)}
        >
          ‹
        </button>
      ) : (
        <button
          data-ui
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTasksOpen(true)}
          title="Show tasks"
          style={sideToggleStyle(12)}
        >
          ☰
        </button>
      )}
    </>
  );
}

function sideToggleStyle(leftPx) {
  return {
    position: "absolute",
    left: leftPx,
    top: "50%",
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    cursor: "pointer",
    zIndex: 41,
    lineHeight: "36px",
    fontSize: 16,
  };
}
