# main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from rdkit import Chem
from rdkit.Chem import Descriptors, AllChem, rdMolDescriptors

app = FastAPI()

# Allow your React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default; CRA uses 3000
    allow_methods=["*"],
    allow_headers=["*"],
)

# OECD (2021) PFAS definition: contains at least one fully fluorinated
# methyl (-CF3) or methylene (-CF2-) carbon, i.e. a saturated carbon with
# at least 2 F and no H, Cl, Br, or I attached.
PFAS_PATTERN = Chem.MolFromSmarts("[CX4;H0;!$(C[Cl,Br,I])](F)(F)")

MAX_HEAVY_ATOMS = 200

@app.post("/api/molecule")
async def get_molecule(request: Request):
    # Parse the body ourselves instead of using a pydantic model
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Request body must be valid JSON.")

    smiles = data.get("smiles") if isinstance(data, dict) else None
    if not isinstance(smiles, str) or not smiles.strip():
        raise HTTPException(400, "Please enter a SMILES string.")
    smiles = smiles.strip()

    # MolFromSmiles returns None (it doesn't raise) on parse/sanitize failure
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise HTTPException(
            400,
            f"'{smiles}' isn't a valid SMILES string. "
            "Check the format and try again (example: OC(=O)C(F)(F)C(F)(F)F).",
        )

    if mol.GetNumHeavyAtoms() > MAX_HEAVY_ATOMS:
        raise HTTPException(400, f"Molecule too large (max {MAX_HEAVY_ATOMS} heavy atoms).")

    # Classify on the heavy-atom graph, before adding explicit Hs
    pfas_matches = mol.GetSubstructMatches(PFAS_PATTERN)

    mol3d = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    if AllChem.EmbedMolecule(mol3d, params) == -1:
        raise HTTPException(
            422, "Valid SMILES, but a 3D structure couldn't be generated for it."
        )

    # MMFF doesn't cover every element; fall back to UFF
    if AllChem.MMFFHasAllMoleculeParams(mol3d):
        AllChem.MMFFOptimizeMolecule(mol3d, maxIters=500)
    else:
        AllChem.UFFOptimizeMolecule(mol3d, maxIters=500)

    return {
        "molblock": Chem.MolToMolBlock(mol3d),
        "is_pfas": len(pfas_matches) > 0,
        "pfas_group_count": len(pfas_matches),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "mol_weight": round(Descriptors.MolWt(mol), 2),
        "canonical_smiles": Chem.MolToSmiles(mol),
    }

''' @app.get("/api/getMolecule")
def getMolecule():
    pfoa = Chem.MolFromSmiles("OC(=O)" + "C(F)(F)" * 6 + "C(F)(F)F")        # PFOA (carboxylic acid)
    #pfos = Chem.MolFromSmiles("OS(=O)(=O)" + "C(F)(F)" * 7 + "C(F)(F)F")    # PFOS (sulfonic acid)

    #for name, mol in [("PFOA", pfoa), ("PFOS", pfos)]:
    #    print(name, Descriptors.MolWt(mol), Descriptors.MolLogP(mol))

    mol = Chem.AddHs(pfoa)
    AllChem.EmbedMolecule(mol, AllChem.ETKDG())
    AllChem.MMFFOptimizeMolecule(mol)      # quick geometry cleanup
        # 3D coordinates as text

    return {"molblock": Chem.MolToMolBlock(mol)} '''