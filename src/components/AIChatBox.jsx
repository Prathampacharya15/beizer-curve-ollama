import { useState } from "react";

export default function AIChatBox({ onSubmit }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    setLoading(true);
    await onSubmit(input);
    setLoading(false);
    setInput("");
  };

  return (
    <div style={{
      position: "absolute",
      right: 20,
      bottom: 20,
      width: 320,
      background: "rgba(20,20,25,0.85)",
      padding: 12,
      borderRadius: 12,
      color: "white",
      zIndex: 10
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        AI Curve Assistant
      </div>

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
          border: "1px solid #333"
        }}
      />

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
          fontWeight: 600
        }}
      >
        {loading ? "Thinking..." : "Send"}
      </button>
    </div>
  );
}
