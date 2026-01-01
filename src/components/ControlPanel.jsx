// import { generateCurveFromPrompt } from "../ai/gemini";
// import {applyAICreateCurve} from "./DynamicCubicBezier"

export default function ControlPanel({
  isDrawing,
  startDrawing,
  stopDrawing,
  lineColor,
  setLineColor,
  lineWidth,
  setLineWidth,
  animType,
  setAnimType,
  timeLine,
  setTimeLine,
  runSelectedAnimation,
  showSpheres,
  hideSpheres,
  clearAll,
  deleteSelected,
  isFreehand,
  setIsFreehand,
  onAICreateCurve,
}) {
  return (
    <>
      <div
  style={{
    position: "absolute",
    left: 20,
    top: 20,
    zIndex: 10,
    width: 320,
    background: "rgba(20,20,25,0.75)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    padding: 16,
    borderRadius: 16,
    color: "white",
    fontFamily: "Inter, system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
  }}
>
  <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 0.5 }}>
  Bezier Line Editor
  </div>

  {/* DRAW MODE */}
  <div style={{ display: "flex", gap: 8 }}>
    <button
      onClick={startDrawing}
      style={{
        flex: 1,
        padding: "8px 12px",
        borderRadius: 10,
        border: "none",
        background: isDrawing ? "#2ecc71" : "#2a2a2a",
        color: "white",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Start
    </button>
    <button
      onClick={stopDrawing}
      style={{
        flex: 1,
        padding: "8px 12px",
        borderRadius: 10,
        border: "none",
        background: !isDrawing ? "#e74c3c" : "#2a2a2a",
        color: "white",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Stop
    </button>
  </div>

  {/* COLOR + WIDTH */}
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      
      <input
        type="color"
        value={lineColor}
        onChange={(e) => setLineColor(e.target.value)}
        style={{ width: 34, height: 28, border: "none" }}
      />
    </label>

    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Width: {lineWidth.toFixed(2)}
      </div>
      <input
        type="range"
        min="0.02"
        max="0.5"
        step="0.01"
        value={lineWidth}
        onChange={(e) => setLineWidth(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  </div>

  {/* ANIMATION */}
  <div style={{ fontWeight: 600 }}>Animation</div>

  <select
    value={animType}
    onChange={(e) => setAnimType(e.target.value)}
    style={{
      background: "#1f1f1f",
      color: "white",
      border: "1px solid #333",
      padding: "8px 10px",
      borderRadius: 10,
    }}
  >
    <option value="disappear-end-to-start">Disappear start to end</option>
    <option value="disappear-start-to-end">Disappear end to start</option>
    <option value="color-change">Color</option>
    <option value="width-change">Width</option>
    <option value="pulse">Pulse</option>
  </select>

  {/* TIMELINE */}
  <div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 12,
        opacity: 0.7,
      }}
    >
      <span>Timeline</span>
      <span>{timeLine}s</span>
    </div>
    <input
      type="range"
      min="1"
      max="20"
      step="1"
      value={timeLine}
      onChange={(e) => setTimeLine(Number(e.target.value))}
      style={{ width: "100%" }}
    />
  </div>

  {/* ACTIONS */}
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    <button
      onClick={runSelectedAnimation}
      style={{
        padding: "10px",
        borderRadius: 10,
        border: "none",
        background: "linear-gradient(135deg, #00c853, #64dd17)",
        color: "black",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Animate
    </button>

    <button
      onClick={clearAll}
      style={{
        padding: "10px",
        borderRadius: 10,
        border: "none",
        background: "#b71c1c",
        color: "white",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Clear
    </button>
  </div>

  {/* SPHERES */}
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
    <button
      onClick={showSpheres}
      style={{
        padding: "8px",
        borderRadius: 10,
        border: "none",
        background: "#2a2a2a",
        color: "white",
        cursor: "pointer",
      }}
    >
      Show Points
    </button>

    <button
      onClick={hideSpheres}
      style={{
        padding: "8px",
        borderRadius: 10,
        border: "none",
        background: "#2a2a2a",
        color: "white",
        cursor: "pointer",
      }}
    >
      Hide Points
    </button>
  </div>

  {/* DELETE */}
  <button
    onClick={deleteSelected}
    style={{
      padding: "10px",
      borderRadius: 10,
      border: "none",
      background: "linear-gradient(135deg,#ff5252,#ff1744)",
      color: "white",
      fontWeight: 700,
      cursor: "pointer",
    }}
  >
    🗑 Delete Selected
  </button>

  <button
  onClick={onAICreateCurve}
  style={{
    padding: "10px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg,#6a11cb,#2575fc)",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  }}
>
   AI Create Curve
</button>


  <button
  onClick={() => {
    setIsFreehand(!isFreehand);
  }}
  style={{
    flex: 1,
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    background: isFreehand ? "#8e24aa" : "#2a2a2a",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  }}
>
  Freehand
</button>
 



</div>


      {/* <div
        ref={mountRef}
        style={{
          width: "100vw",
          height: "100vh",
          position: "absolute",
          left: 0,
          top: 0,
        }}
      /> */}
    </>
  );
}

