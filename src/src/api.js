const BASE = "http://localhost:8000";

export async function getMolecule(name) {
  const res = await fetch(`${BASE}/api/getMolecule`);
  return res.json();
}