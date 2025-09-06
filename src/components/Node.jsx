import { useRef, useEffect } from "react";

export default function Node({ node, onChange, autoFocus }) {
  const ref = useRef();

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      // move caret to end
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        fontSize: 14, // base size only
        whiteSpace: "pre",
        width: "max-content", // Prevents wrapping by allowing unlimited width
        minWidth: 0, // Allows shrinking below default minimums
      }}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onChange(node.id, e.target.textContent)}
    >
      {node.text}
    </div>
  );
}
