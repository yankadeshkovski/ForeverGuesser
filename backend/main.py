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
    allow_origins=["https://foreverguesser.onrender.com"],  # Vite's default; CRA uses 3000
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


# ── Atom explains the Play Guesser hotspot ────────────────────────────────
import json
from pydantic import BaseModel

MAX_ZONE_SOURCES = 12
MAX_MODEL_TURN_CHARS = 2000

ZONE_INTRO_PROMPT = (
    "Explain why the hotspot is where it is, and how close my guess was."
)


def _dist_text(km: float) -> str:
    return f"{km * 1000:.0f} m" if km < 1 else f"{km:.1f} km"


def reaction_for(score: int) -> str:
    if score >= 85:
        return "Great job!"
    if score >= 70:
        return "Good job!"
    if score >= 40:
        return "Not bad."
    return "Uh oh."


def build_zone_instruction(score: int, sources: list, opening: bool) -> str:
    listing = "\n".join(f"- {s['type']} (weight {s['weight']}/100)" for s in sources) or "- (no mapped sources near the hotspot)"
    if opening:
        turn = (
            f"This is your opening message. Begin with exactly '{reaction_for(score)}' and you may add one tiny filler of at most 3 words "
            "that fits the score (for example 'So close!' after a good score, 'Way off!' after a bad one). Then explain the hotspot. "
        )
    else:
        turn = "This is a follow-up, so skip any reaction and answer the question directly. "
    return (
        "You are Atom, the friendly guide inside Forever Guesser, a game about PFAS ('forever chemicals'). "
        "The player just dropped a pin where they thought PFAS would be highest on a map, and the game revealed a hotspot. "
        f"They scored {score}/100.\n"
        "Mapped sources that pull on the hotspot, strongest first:\n"
        f"{listing}\n\n"
        "The hotspot is a MODEL ESTIMATE built from the type and distance of mapped likely sources, "
        "not from lab measurements. Never claim PFAS was actually measured or found at these places. "
        "NEVER mention distances, kilometers or how far the guess was. "
        f"{turn}"
        "Keep the teaching short and sweet: at most 2 short sentences and about 35 words. Name the strongest real source type "
        "(for example 'the wastewater plant', not 'nearby operations'), give the one mechanism that matters, and plant ONE hook the player "
        "will want to ask about, left unexplained: a named compound or product, or a striking fact. "
        "Hook ideas you can use (stay accurate, never invent numbers): AFFF firefighting foam; PFOA and PFOS, the older PFAS; "
        "GenX, a replacement for PFOA that also persists; PTFE, the nonstick coating; carbon-fluorine bonds being among the strongest in organic chemistry; "
        "PFAS being detected in the blood of nearly everyone tested in national surveys; there being thousands of different PFAS; "
        "PFAS riding groundwater for years; treatment plants not breaking them down. "
        "Speak in first person as Atom, warm plain language, no markdown. "
        "Answer follow-up questions in character, and stay on PFAS and this map; if asked something unrelated, steer back in one short sentence. "
        "Do not give medical advice. For health or drinking-water worries, suggest checking the local water utility's report or the health authority.\n\n"
        "Reply as JSON with two fields. 'answer': your message. "
        "'followups': exactly 3 tap-to-ask questions the PLAYER would ask next, each at most 5 words and 40 characters, "
        "written in the player's voice, each about something you just mentioned or teased (a compound, product, or fact), "
        "for example 'What is AFFF?' or 'Why is GenX a problem?'. Never repeat a question already asked."
    )


class ZoneReply(BaseModel):
    answer: str
    followups: list[str]


@app.post("/api/zone-chat")
async def zone_chat(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Request body must be valid JSON.")
    if not isinstance(data, dict):
        raise HTTPException(400, "Request body must be a JSON object.")

    # Numbers: validated, never trusted
    try:
        score = int(data.get("score"))
        km = data.get("km")
        km = None if km is None else float(km)
    except (TypeError, ValueError):
        raise HTTPException(400, "score must be a number and km a number or null.")
    if not 0 <= score <= 100 or (km is not None and not 0 <= km <= 20000):
        raise HTTPException(400, "score or km out of range.")

    raw_sources = data.get("sources") or []
    if not isinstance(raw_sources, list):
        raise HTTPException(400, "sources must be a list.")
    sources = []
    for s in raw_sources[:MAX_ZONE_SOURCES]:
        try:
            sources.append({
                "type": str(s["type"])[:60],
                "km": max(0.0, min(500.0, float(s["km"]))),
                "weight": max(0, min(100, int(s["weight"]))),
            })
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Each source needs type, km and weight.")

    message = data.get("message")
    history = data.get("history") or []
    if not isinstance(history, list):
        raise HTTPException(400, "history must be a list.")
    history = history[-MAX_HISTORY_TURNS:]

    contents = [types.Content(role="user", parts=[types.Part(text=ZONE_INTRO_PROMPT)])]
    for turn in history:
        role = turn.get("role") if isinstance(turn, dict) else None
        text = turn.get("text") if isinstance(turn, dict) else None
        if role not in ("user", "model") or not isinstance(text, str):
            raise HTTPException(400, "Each history item needs role ('user'|'model') and text.")
        contents.append(types.Content(role=role, parts=[types.Part(text=text[:MAX_MODEL_TURN_CHARS])]))

    if message is not None:
        if not isinstance(message, str) or not message.strip():
            raise HTTPException(400, "message must be a non-empty string.")
        if len(message) > MAX_MESSAGE_CHARS:
            raise HTTPException(400, f"Message too long (max {MAX_MESSAGE_CHARS} characters).")
        contents.append(types.Content(role="user", parts=[types.Part(text=message.strip())]))

    instruction = build_zone_instruction(score, sources, opening=(message is None and not history))
    try:
        try:
            # JSON mode gives us the answer plus Atom's tap-to-ask follow-ups
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=instruction,
                    response_mime_type="application/json",
                    response_schema=ZoneReply,
                ),
            )
        except Exception:
            # If JSON mode isn't available for this model, fall back to a plain-text answer with no follow-ups
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=instruction),
            )
    except Exception as e:
        raise HTTPException(502, f"Gemini request failed: {e}")

    raw = (response.text or "").strip()
    answer, followups = raw, []
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict) and isinstance(obj.get("answer"), str):
            answer = obj["answer"].strip()
            fu = obj.get("followups")
            if isinstance(fu, list):
                followups = [f.strip()[:48] for f in fu if isinstance(f, str) and f.strip()][:3]
    except ValueError:
        pass  # plain text, not JSON
    if not answer:
        raise HTTPException(502, "Atom had nothing to say. Try again.")
    return {"answer": answer, "followups": followups}
