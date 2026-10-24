const BASE = "http://localhost:8000";

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