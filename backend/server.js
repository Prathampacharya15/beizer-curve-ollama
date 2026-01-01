import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

function extractJSON(text) {
  if (!text) throw new Error("Empty Gemini response");

  // Remove markdown fences
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Extract JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("No JSON object found");
  }

  cleaned = cleaned.slice(start, end + 1);

  return JSON.parse(cleaned);
}


const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/generate-curve", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" +
        process.env.GOOGLE_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
You are a geometry API.
Return ONLY valid JSON.
No explanation.

Format:
{
  "anchors": [{ "x": number, "y": number, "z": number }],
  "controls": [
    { "cp1": { "x": number, "y": number, "z": number },
      "cp2": { "x": number, "y": number, "z": number } }
  ]
}

Prompt:
${prompt}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

const rawText =
  data?.candidates?.[0]?.content?.parts?.[0]?.text;

if (!rawText) {
  console.error("No Gemini text:", data);
  return res.status(500).json({ error: "No content from Gemini" });
}

let curveJSON;
try {
  curveJSON = extractJSON(rawText);
} catch (err) {
  console.error("JSON parse failed:", rawText);
  return res.status(500).json({
    error: "Invalid JSON from Gemini",
    raw: rawText,
  });
}
console.log("🟢 CLEANED JSON:");
console.log(curveJSON);


res.json(curveJSON);

  } catch (err) {
    console.error("AI ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log("✅ AI backend running on http://localhost:5000");
});
