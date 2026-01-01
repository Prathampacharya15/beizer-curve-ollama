export async function generateCurveFromPrompt(prompt) {
  const res = await fetch("http://localhost:5000/api/generate-curve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "AI request failed");
  }
  return data;
}
