# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from rdkit import Chem
from rdkit.Chem import Descriptors, AllChem

app = FastAPI()

# Allow your React dev server to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default; CRA uses 3000
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/hello")
def hello():
    return {"message": "Hello from Python"}

@app.post("/api/add")
def add(data: dict):
    return {"result": data["a"] + data["b"]}

@app.post("/api/getMolecule")
def getMolecule():
    pfoa = Chem.MolFromSmiles("OC(=O)" + "C(F)(F)" * 6 + "C(F)(F)F")        # PFOA (carboxylic acid)
    #pfos = Chem.MolFromSmiles("OS(=O)(=O)" + "C(F)(F)" * 7 + "C(F)(F)F")    # PFOS (sulfonic acid)

    #for name, mol in [("PFOA", pfoa), ("PFOS", pfos)]:
    #    print(name, Descriptors.MolWt(mol), Descriptors.MolLogP(mol))

    mol = Chem.AddHs(pfoa)
    AllChem.EmbedMolecule(mol, AllChem.ETKDG())
    AllChem.MMFFOptimizeMolecule(mol)      # quick geometry cleanup
    molblock = Chem.MolToMolBlock(mol)     # 3D coordinates as text

    return molblock