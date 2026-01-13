import { useState, useRef } from "react";

export default function AIChatBox({ onSubmit }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // 🔹 Draggable state
  const [pos, setPos] = useState({ x: window.innerWidth - 360, y: window.innerHeight - 260 });
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const handleSend = async () => {
    if (!input.trim()) return;
    setLoading(true);
    await onSubmit(input);
    setLoading(false);
    setInput("");
  };

  // -------------------------
  // Drag Handlers
  // -------------------------
  const onDragStart = (e) => {
    draggingRef.current = true;
    offsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
  };

  const onDragMove = (e) => {
    if (!draggingRef.current) return;
    setPos({
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    });
  };

  const onDragEnd = () => {
    draggingRef.current = false;
  };

  return (
    <>
      {/* 💬 Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#7c4dff",
            border: "none",
            color: "white",
            fontSize: 24,
            cursor: "pointer",
            zIndex: 20,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          💬
        </button>
      )}

      {/* 📦 Draggable Chat Box */}
      {open && (
        <div
          onMouseMove={onDragMove}
          onMouseUp={onDragEnd}
          onMouseLeave={onDragEnd}
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            width: 320,
            background: "rgba(20,20,25,0.95)",
            padding: 12,
            borderRadius: 12,
            color: "white",
            zIndex: 20,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            userSelect: draggingRef.current ? "none" : "auto",
          }}
        >
          {/* 🟣 Header (Drag Handle) */}
          <div
            onMouseDown={onDragStart}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              fontWeight: 600,
              cursor: "move",
            }}
          >
            <span>AI Curve Assistant</span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          {/* ✏️ Input */}
          <textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. create 6 points and make a smooth curve"
            style={{
              width: "100%",
              borderRadius: 8,
              padding: 8,
              background: "#111",
              color: "white",
              border: "1px solid #333",
            }}
          />

          {/* 🚀 Send */}
          <button
            onClick={handleSend}
            disabled={loading}
            style={{
              marginTop: 8,
              width: "100%",
              padding: 8,
              borderRadius: 8,
              background: "#7c4dff",
              border: "none",
              color: "white",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </div>
      )}
    </>
  );
}
