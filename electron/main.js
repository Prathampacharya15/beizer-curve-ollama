import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

/* -------------------------------
   __dirname FIX
-------------------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------
   JSON EXTRACTOR (OLLAMA SAFE)
-------------------------------- */
function extractJSON(text) {
  if (!text) throw new Error("Empty LLM response");

  let cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    // Fallback: try to find just a JSON object/array if strict wrapping failed
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("No JSON found");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

/* -------------------------------
   OLLAMA CALL
-------------------------------- */
async function generateCurveFromPrompt(prompt) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen2.5:7b",
      stream: false,
      prompt: `
You are a JSON command generator for a Bezier curve editor.

RULES:
1. Output ONLY valid JSON.
2. The root object MUST have a "commands" array.
3. Coordinates are [x, y] arrays where x and y are numbers between -5 and 5.
4. Do NOT include markdown formatting or explanations.
5. Use 1-based indexing for all indices.
6. AESTHETICS:
   - Arrange points in a smooth, logical flow.
   - Avoid zig-zags or self-intersections unless explicitly requested.
   - Points should be evenly spaced.
   - Shapes should be centered around [0,0] unless specified otherwise.

GEOMETRY RULES:
- All geometry is 2D (ignore Z axis).
- For closed shapes, DO NOT repeat the first point at the end.
- Use the minimum number of points required for clarity.

SHAPE INTERPRETATION RULES:
If the user asks for a shape (square, rectangle, triangle, polygon, circle):
- Convert the shape into anchor points.
- Use clockwise ordering.
- Keep the shape within bounds [-5, 5].
- Prefer symmetric, clean geometry.

AVAILABLE COMMANDS:

1. Create a new curve:
   { "type": "create", "points": [[x,y], [x,y], ...] }

2. Move a point:
   { "type": "move", "index": number, "to": [x,y] }

3. Insert a point:
   { "type": "insert", "after": number, "at": [x,y] }

4. Delete a point:
   { "type": "delete", "index": number }

5. Smooth the curve:
   { "type": "smooth" }

SHAPE GUIDELINES:

- Triangle → 3 points
- Square / Rectangle → 4 points
- Pentagon → 5 points
- Circle → approximate using 8–12 evenly spaced points
- Regular polygon → evenly spaced points on a circle

If the user asks for both:
- creation + modification → output multiple commands in order
- shape + smoothing → create first, then smooth

Example Shape Outputs:

Square:
[[-2,-2], [2,-2], [2,2], [-2,2]]

Triangle:
[[-3,-2], [0,3], [3,-2]]

Circle (8 points):
[[3,0], [2.1,2.1], [0,3], [-2.1,2.1], [-3,0], [-2.1,-2.1], [0,-3], [2.1,-2.1]]



USER REQUEST:
${prompt}
`,
    }),
  });

  const data = await response.json();
  console.log("🧠 RAW AI OUTPUT:\n", data);
  if (!data?.response) {
    console.error("❌ Ollama raw:", data);
    throw new Error("No Ollama output");
  }

  const parsed = extractJSON(data.response);
  console.log("🧠 PARSED JSON:\n", parsed);

  return forceCommandsFormat(parsed);
}

function forceCommandsFormat(json) {
  // Check for commands array directly
  if (Array.isArray(json.commands)) {
    return json;
  }

  // If we just got a single object that looks like a command, wrap it
  if (json.type) {
    return { commands: [json] };
  }

  // If we just got points (legacy shorthand)
  if (json.points && Array.isArray(json.points)) {
    return { commands: [{ type: "create", points: json.points }] };
  }

  // If parsed is an array, assume it's a list of commands
  if (Array.isArray(json)) {
    return { commands: json };
  }

  console.warn("⚠️ AI response structure unclear, returning as-is:", json);
  return json;
}

/* -------------------------------
   IPC HANDLER
-------------------------------- */
ipcMain.handle("ai:generate-curve", async (_, prompt, context) => {
  return await generateCurveFromPrompt(prompt, context);
});

/* -------------------------------
   WINDOW
-------------------------------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);
