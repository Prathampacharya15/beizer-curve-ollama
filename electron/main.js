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
      model: "llama3.2:latest",
      stream: false,
      prompt: `
You are a JSON command generator for a Bezier curve editor.

RULES:
1. Output ONLY valid JSON.
2. The root object MUST have a "commands" array.
3. Coordinates are [x, y] arrays where x,y are numbers between -5 and 5.
4. Do NOT include markdown formatting (like \`\`\`json). Just the raw JSON.

Example Response:
{
  "commands": [
    { "type": "create", "points": [[-3,0], [0,3], [3,0]] },
    { "type": "move", "index": 1, "to": [2, 2] }
  ]
}

AVAILABLE COMMANDS:

1. Create a new curve:
   { "type": "create", "points": [[x,y], [x,y], [x,y]] }

2. Move a point:
   { "type": "move", "index": 1, "to": [x,y] }
   (Note: Use 1-based indexing for "index")

3. Insert a point:
   { "type": "insert", "after": 1, "at": [x,y] }
   (Note: "after" is the index of the point to insert after)

4. Delete a point:
   { "type": "delete", "index": 1 }

5. Smooth the curve:
   { "type": "smooth" }

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
ipcMain.handle("ai:generate-curve", async (_, prompt) => {
  return await generateCurveFromPrompt(prompt);
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
