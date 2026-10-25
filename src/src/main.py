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

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

GEMINI_MODEL = "gemini-3.5-flash-lite"

app = FastAPI()

from heatmap import router as heatmap_router
app.include_router(heatmap_router)

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
MAX_HISTORY_TURNS = 20
MAX_MESSAGE_CHARS = 500

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
    }

def build_system_instruction(smiles: str, is_pfas: bool) -> str:
    status = "is" if is_pfas else "is not"
    return (
        f"You are a molecule with SMILES {smiles}, which {status} classified as a PFAS molecule. "
        "Stay in the first-person molecule persona at all times. "
        "Only write in complete sentences and limit every answer to 4 sentences or fewer. "
        "If you are not a PFAS molecule, say 'I am not a PFAS molecule.' and explain why. "
        "If you are a PFAS molecule, be ready to explain your full name, "
        "common uses, where you become a pollutant (with specific examples), and why you are "
        "dangerous to humans or the ecosystem. "
        "Answer the user's follow-up questions in character."
    )

INTRO_PROMPT = (
    "Introduce yourself: give your name, what you're used for, "
    "where you become a pollutant, and why you're a concern (or why you're not a PFAS)."
)

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
    is_pfas = mol.HasSubstructMatch(PFAS_PATTERN)

    # Optional new user message and prior turns
    message = data.get("message")
    history = data.get("history") or []
    if not isinstance(history, list):
        raise HTTPException(400, "history must be a list.")
    history = history[-MAX_HISTORY_TURNS:]

    # Always start with the intro turn so the conversation begins with a user role
    contents = [types.Content(role="user", parts=[types.Part(text=INTRO_PROMPT)])]

    for turn in history:
        role = turn.get("role") if isinstance(turn, dict) else None
        text = turn.get("text") if isinstance(turn, dict) else None
        if role not in ("user", "model") or not isinstance(text, str):
            raise HTTPException(400, "Each history item needs role ('user'|'model') and text.")
        contents.append(types.Content(role=role, parts=[types.Part(text=text)]))

    if message is not None:
        if not isinstance(message, str) or not message.strip():
            raise HTTPException(400, "message must be a non-empty string.")
        if len(message) > MAX_MESSAGE_CHARS:
            raise HTTPException(400, f"Message too long (max {MAX_MESSAGE_CHARS} characters).")
        contents.append(types.Content(role="user", parts=[types.Part(text=message.strip())]))

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=build_system_instruction(smiles, is_pfas),
            ),
        )
    except Exception as e:
        raise HTTPException(502, f"Gemini request failed: {e}")

    return {"answer": response.text}