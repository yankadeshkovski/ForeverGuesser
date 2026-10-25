const BASE = "216.24.57.18:443";
// const BASE = import.meta.env.VITE_API_URL ?? ""

export async function getMolecule(smiles) {
  let res;
  try {
    res = await fetch(`${BASE}/api/molecule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smiles }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Is the API running on port 8000?");
  }

  if (!res.ok) {
    // FastAPI puts our message in `detail`
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `API returned ${res.status}`);
  }
  return res.json();
}

export async function ask(smiles, message, history) {
  const res = await fetch(`${BASE}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smiles, message, history }), // undefined fields are dropped
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || 'Request failed')
  return body
}

// Builds the PFAS heatmap for the visible map and scores the guess.
// bounds: { south, west, north, east }   points: [{ type, lat, lng }]   guess: { lat, lng }
export async function getHeatmap(bounds, points, guess) {
  let res;
  try {
    res = await fetch(`${BASE}/api/heatmap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bounds, points, guess }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Is the API running on port 8000?");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `API returned ${res.status}`);
  }
  return res.json();
}

// Atom explains the revealed hotspot and answers follow-ups.
// payload: { score, km, sources: [{ type, km, weight }], message?, history: [{ role: "user" | "model", text }] }
// Leave message out for Atom's opening explanation. Resolves to { answer }.
export async function askZone(payload) {
  let res;
  try {
    res = await fetch(`${BASE}/api/zone-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Couldn't reach the server. Is the API running on port 8000?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `API returned ${res.status}`);
  return body;
}