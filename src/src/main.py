# main.py
import os
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from rdkit import Chem
from rdkit.Chem import Descriptors, AllChem, rdMolDescriptors
from pfas_data import get_preset_response

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

GEMMA_MODEL = "gemma-4-26b-a4b-it"

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

@app.post("/api/ask")
async def ask(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Request body must be valid JSON.")
    if not isinstance(data, dict):
        raise HTTPException(400, "Request body must be a JSON object.")

    smiles = data.get("smiles")
    if not isinstance(smiles, str) or not smiles.strip():
        raise HTTPException(400, "Missing smiles.")
    smiles = smiles.strip()

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise HTTPException(400, f"'{smiles}' isn't a valid SMILES string.")

    cached = get_preset_response(smiles)
    if cached:
        print(cached)
        return {"answer": cached, "source": "preset"}

    is_pfas = "is" if mol.HasSubstructMatch(PFAS_PATTERN) else "is not"

    prompt = (f"You are a molecule with SMILE {smiles.strip()} which {is_pfas} classified as a PFAS molecule. If you are not a PFAS molecule, say \'I am not a PFAS molecule.\'" +
              " and explain why. If you are a PFAS molecule, answer the following questions: What is the full name of the PFAS molecule? What is the chemical formula?" + 
              "What is this PFAS molecule commonly used for? Where can it become a pollutant, give specific examples? Why is this molecule dangerous to humans or the ecosystem?")

    try:
        start = time.time()
        response = client.models.generate_content(
            model=GEMMA_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
            system_instruction="Only write in complete sentences and limit the answer to 6 or fewer. Answer in the first person.",
            thinking_config=types.ThinkingConfig(thinking_level="high"),
            )
        )
        end = time.time()
        print(start - end)
    except Exception as e:
        raise HTTPException(502, f"Gemma request failed: {e}")

    # return {"answer": response.text}
    print(response.text)
    return {"answer": "This is a placeholder response. The AI model integration is currently commented out."}
