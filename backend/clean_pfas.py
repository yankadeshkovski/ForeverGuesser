"""Clean data.json (~26k PFAS) into a small file the React page can fetch.

Usage:   python clean_pfas.py data.json public/pfas.json
Output:  [[cid, "Name", "SMILES"], ...]  (compact arrays, sorted by name)

Handles a top-level list or a dict wrapping one (e.g. {"data": [...]}), and the
usual PubChem field names. Uses RDKit (already in your backend) when installed
to drop unparseable SMILES and to dedupe by canonical structure.
"""
import json, re, sys
from collections import Counter

try:
    from rdkit import Chem, RDLogger
    RDLogger.DisableLog("rdApp.*")
except ImportError:
    Chem = None

NAME_KEYS = ["cmpdname", "name", "iupacname", "title", "compound_name", "compound"]
SMILES_KEYS = ["smiles", "isosmiles", "canonical_smiles", "connectivitysmiles", "SMILES"]
ID_KEYS = ["cid", "id", "CID"]

def pick(row, keys):
    lower = {k.lower(): v for k, v in row.items()}
    for k in keys:
        v = row.get(k, lower.get(k.lower()))
        if v not in (None, "", []):
            return v
    return None

def clean_name(s):
    if not isinstance(s, str):
        return ""
    s = re.sub(r"\s+", " ", s.replace("\u00a0", " ")).strip(" ;,")
    return s

def main(src, dst):
    text = open(src, encoding="utf-8-sig").read()
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        # SMILES use "\\" for stereo bonds; unescaped ones make the file invalid JSON.
        # Keep real escapes (\\ \" \/ \uXXXX), double every other backslash, retry.
        print(f"data.json isn't strictly valid JSON ({e.msg}, line {e.lineno}); repairing stray backslashes")
        text = re.sub(r'\\(\\|"|/|u[0-9a-fA-F]{4})|\\', lambda m: m.group(0) if m.group(1) else "\\\\", text)
        raw = json.loads(text)
    if isinstance(raw, dict):
        raw = next((v for v in raw.values() if isinstance(v, list)), [])
    stats, seen, out = Counter(), set(), []
    for row in raw:
        if not isinstance(row, dict):
            stats["not an object"] += 1; continue
        smiles = pick(row, SMILES_KEYS)
        smiles = re.sub(r"\s+", "", smiles) if isinstance(smiles, str) else ""
        if not smiles:
            stats["no SMILES"] += 1; continue
        key = smiles
        if Chem:
            mol = Chem.MolFromSmiles(smiles)
            if mol is None:
                stats["invalid SMILES"] += 1; continue
            key = Chem.MolToSmiles(mol)
        if key in seen:
            stats["duplicate structure"] += 1; continue
        seen.add(key)
        cid = pick(row, ID_KEYS)
        name = clean_name(pick(row, NAME_KEYS))
        if not name:
            name = f"Unnamed compound (CID {cid})" if cid else "Unnamed compound"
            stats["unnamed (kept)"] += 1
        out.append([cid if cid is not None else len(out) + 1, name, smiles])
    out.sort(key=lambda r: (r[1].lower().startswith("unnamed"), r[1].lower()))
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"read {len(raw):,} -> kept {len(out):,}" + ("" if Chem else "  (RDKit missing: SMILES not validated)"))
    for k, v in stats.items():
        print(f"  {k}: {v:,}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
