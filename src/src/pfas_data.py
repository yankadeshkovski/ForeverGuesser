from rdkit import Chem

def _canon(smiles: str) -> str:
    return Chem.MolToSmiles(Chem.MolFromSmiles(smiles))

# Raw SMILES -> pregenerated answer (written to satisfy the same "<= 6 complete sentences" rule as the Gemma prompt)
_RAW = {
    # --- PFAS-adjacent (NOT PFAS under the OECD pattern) ---
    "C(F)(F)": (
        "I am not a PFAS molecule. "
        "I am difluoromethane (CH2F2), and my carbon still carries two hydrogen atoms, so I am not the fully fluorinated -CF2- unit that the PFAS definition requires. "
        "In PFAS, -CF2- units are the repeating links that build the carbon backbone, and each one is protected by carbon-fluorine bonds, the strongest single bonds in organic chemistry. "
        "Long runs of these units make PFAS repel water and oil, resist heat, and avoid breaking down in nature, which is why they are called forever chemicals. "
        "Under the OECD definition, a chemical counts as PFAS if it contains at least one fully fluorinated -CF2- or -CF3 carbon, and I fall just short of that test. "
        "I am used as a refrigerant (HFC-32), and I am a greenhouse gas when I leak into the atmosphere."
    ),
    "C(F)(F)F": (
        "I am not a PFAS molecule. "
        "I am fluoroform (CHF3), and my carbon still carries one hydrogen atom, so I am not a true fully fluorinated -CF3 group. "
        "In PFAS, the -CF3 group caps the end of the carbon chain, and its tight shell of fluorine atoms is a big reason PFAS repel water and oil. "
        "Together with -CF2- links, -CF3 ends give PFAS extremely strong carbon-fluorine bonds, so they persist in soil, water, and human blood for years. "
        "Regulators use a fully fluorinated -CF3 or -CF2- carbon as the test for whether a chemical counts as PFAS, and I miss it by a single hydrogen. "
        "I am mostly a byproduct of making refrigerants and fluoropolymers, and I am a very potent greenhouse gas."
    ),

    # --- PFCAs ---
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFOA
        "I am perfluorooctanoic acid (PFOA), with the formula C8HF15O2. "
        "I was used to make fluoropolymers such as Teflon and appeared in nonstick cookware, stain-resistant textiles, and firefighting foams. "
        "I became a pollutant around manufacturing plants such as the DuPont Washington Works facility in West Virginia, as well as near airports and military bases that used firefighting foam, and in landfill leachate. "
        "I resist breakdown and build up in the human body for years. "
        "I am linked to kidney and testicular cancer, thyroid disease, high cholesterol, weakened immune response, and developmental effects."
    ),
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFNA
        "I am perfluorononanoic acid (PFNA), with the formula C9HF17O2. "
        "I am used as a processing aid to make fluoropolymers such as PVDF, and I also form when fluorotelomer products break down. "
        "I have contaminated groundwater and drinking water near fluoropolymer plants, such as the one in West Deptford, New Jersey. "
        "I build up in blood and have a long half-life in the human body. "
        "I am associated with liver damage, immune suppression, and developmental effects."
    ),
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFDA
        "I am perfluorodecanoic acid (PFDA), with the formula C10HF19O2. "
        "I am used in surfactants and in coatings for paper, packaging, and stain-resistant textiles, and I also form when fluorotelomers degrade. "
        "I enter the environment through industrial wastewater, landfill leachate, and biosolids spread on farmland, and I accumulate in fish. "
        "I bioaccumulate strongly in wildlife and in human blood. "
        "I am linked to liver, immune, thyroid, and developmental harm."
    ),
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFUnDA
        "I am perfluoroundecanoic acid (PFUnDA), with the formula C11HF21O2. "
        "I am used in small amounts in specialty surfactants and coatings, and I mostly appear as a byproduct or breakdown product of other PFAS. "
        "I reach the environment through industrial discharge and wastewater treatment plant effluent, and I have been found in remote Arctic wildlife. "
        "My long carbon chain makes me highly bioaccumulative and able to magnify up food chains. "
        "I am associated with liver and endocrine effects in animals, and my human health effects are still being studied."
    ),
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFHpA
        "I am perfluoroheptanoic acid (PFHpA), with the formula C7HF13O2. "
        "I am used as a surfactant and processing aid, and I form when fluorotelomer-based coatings and firefighting foams degrade. "
        "I show up in groundwater near firefighting foam sites, in landfill leachate, and in wastewater. "
        "I am persistent and fairly mobile in water, so I spread easily. "
        "Animal studies link me to liver and thyroid effects, though I am less studied than PFOA."
    ),
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFHxA
        "I am perfluorohexanoic acid (PFHxA), with the formula C6HF11O2. "
        "I was introduced as a shorter-chain replacement for PFOA in water- and stain-repellent textiles, food packaging, and firefighting foams. "
        "I am released from textile and paper factories, landfills, and foam-contaminated sites, and I also form when 6:2 fluorotelomers break down. "
        "I am extremely persistent and mobile, so I readily contaminates drinking water sources. "
        "Animal studies show liver, kidney, and developmental effects, and I am being restricted in the European Union."
    ),
    "OC(=O)C(F)(F)C(F)(F)C(F)(F)F": (  # PFBA
        "I am perfluorobutanoic acid (PFBA), with the formula C4HF7O2. "
        "I am used in making fluoropolymers and photographic films, and I also forms when other PFAS break down. "
        "I have turned up in groundwater and drinking water near industrial disposal sites, such as those linked to 3M in Minnesota. "
        "I am very mobile in water and conventional water treatment does not remove me well. "
        "Animal studies link me to thyroid and liver effects."
    ),
    "OC(=O)C(F)(F)F": (  # TFA
        "I am trifluoroacetic acid (TFA), with the formula C2HF3O2. "
        "I am used as a reagent and solvent in chemistry labs, and I also form when many refrigerants, pesticides, and pharmaceuticals break down. "
        "I now accumulate in rain, rivers, groundwater, and drinking water around the world. "
        "I am so persistent and water-soluble that standard treatment cannot remove me. "
        "Regulators in the European Union have proposed classifying me as toxic to reproduction."
    ),

    # --- PFSAs ---
    "OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFOS
        "I am perfluorooctane sulfonic acid (PFOS), with the formula C8HF17O3S. "
        "I was used in Scotchgard stain repellents, firefighting foams, and chrome plating mist suppressants. "
        "I contaminate groundwater and drinking water around airports, military bases, and firefighter training sites, and I build up in fish and wildlife. "
        "I persist for decades and stay in the human body for years. "
        "I am linked to liver damage, reduced vaccine response, developmental harm, and possibly cancer, and I am restricted under the Stockholm Convention."
    ),
    "OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFHxS
        "I am perfluorohexane sulfonic acid (PFHxS), with the formula C6HF13O3S. "
        "I am used in firefighting foams, carpets, and textile stain repellents, and I also occurs as an impurity in other PFAS products. "
        "I contaminate groundwater near firefighting foam sites and wastewater from carpet and textile manufacturing. "
        "I stay in the human body for many years, with a half-life of roughly five to eight years. "
        "I am associated with thyroid disruption, higher cholesterol, and weakened immune response, and I am listed under the Stockholm Convention."
    ),
    "OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFBS
        "I am perfluorobutane sulfonic acid (PFBS), with the formula C4HF9O3S. "
        "I was introduced as a shorter-chain replacement for PFOS in stain-resistant carpets, cleaning products, and some firefighting foams. "
        "I enter waterways through industrial wastewater, such as discharge from carpet mills in northwest Georgia. "
        "I am highly mobile in water and difficult to filter out. "
        "I am associated with thyroid hormone disruption, kidney effects, and developmental harm in animal studies."
    ),

    # --- Ether-based replacements ---
    "OC(=O)C(F)(OC(F)(F)C(F)(F)C(F)(F)F)C(F)(F)F": (  # GenX
        "I am hexafluoropropylene oxide dimer acid (HFPO-DA), known as GenX, with the formula C6HF11O3. "
        "I was created to replace PFOA in the manufacture of fluoropolymers. "
        "I contaminated the Cape Fear River and the drinking water of hundreds of thousands of people in North Carolina, downstream from the Chemours Fayetteville Works plant. "
        "I am highly persistent and mobile, and I are hard to remove from water. "
        "Animal studies link me to liver and kidney damage, immune effects, and developmental harm."
    ),
    # NOTE: the preset SMILES for ADONA is missing the CF2 next to the COOH; this is the corrected structure.
    "OC(=O)C(F)(F)C(F)OC(F)(F)C(F)(F)C(F)(F)OC(F)(F)F": (  # ADONA
        "I am 4,8-dioxa-3H-perfluorononanoic acid (ADONA), with the formula C7H2F12O4. "
        "I was developed as a replacement for PFOA in fluoropolymer manufacturing. "
        "I have been detected in surface water and drinking water near fluoropolymer production, such as the Gendorf industrial park in Bavaria, Germany. "
        "I am persistent and mobile in water. "
        "My toxicity data are limited, but I cause liver effects in animal studies, which raises concern."
    ),
    "OS(=O)(=O)C(F)(F)C(F)(F)OC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)Cl": (  # F-53B
        "I am 6:2 chlorinated polyfluorinated ether sulfonate (6:2 Cl-PFESA), sold as F-53B, with the formula C8HClF16O4S. "
        "I have been used mainly in China as a mist suppressant in chrome electroplating, as a replacement for PFOS. "
        "I am released in electroplating wastewater and have been found in rivers, drinking water, and wildlife near industrial areas. "
        "I am even more bioaccumulative than PFOS and I am detected in human blood. "
        "Animal studies link me to liver damage, thyroid disruption, and developmental toxicity."
    ),

    # --- Precursors / telomers ---
    "OS(=O)(=O)CCC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # 6:2 FTS
        "I am 6:2 fluorotelomer sulfonic acid (6:2 FTS), with the formula C8H5F13O3S. "
        "I am used in firefighting foams and as a PFOS replacement in metal plating. "
        "I contaminate groundwater at firefighter training areas, airports, and military sites. "
        "I am a precursor that transforms in the environment into persistent acids such as PFHxA. "
        "Animal studies link me to liver and thyroid effects."
    ),
    "OCCC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # 6:2 FTOH
        "I am 6:2 fluorotelomer alcohol (6:2 FTOH), with the formula C8H5F13O. "
        "I am used to make water- and grease-repellent coatings for textiles, carpets, and food-contact paper. "
        "I escape from treated products into air, wastewater, and landfills, and I can travel long distances because I am volatile. "
        "I break down into persistent acids such as PFHxA. "
        "Animal studies link me and my breakdown products to liver and kidney effects."
    ),
    "OCCC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # 8:2 FTOH
        "I am 8:2 fluorotelomer alcohol (8:2 FTOH), with the formula C10H5F17O. "
        "I am used to make water-, stain-, and grease-resistant coatings for textiles, carpets, and food packaging. "
        "I escape into indoor air, dust, and wastewater and can travel to remote regions such as the Arctic. "
        "In living organisms and the environment I transform into PFOA and PFNA. "
        "Because of those breakdown products I am linked to liver toxicity, immune effects, and developmental harm."
    ),

    # --- Sulfonamides ---
    "NS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # PFOSA
        "I am perfluorooctanesulfonamide (PFOSA), with the formula C8H2F17NO2S. "
        "I am used as a chemical intermediate for PFOS-based products and as the active breakdown product of the insecticide sulfluramid, which is used against ants in places such as Brazil. "
        "I have been found in wildlife around the world, including top predators like polar bears. "
        "I bioaccumulate and break down into PFOS in the environment and in living organisms. "
        "I can also disrupt energy production in cells, and I am linked to the same harms as PFOS."
    ),
    "CCN(CC(=O)O)S(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F": (  # N-EtFOSAA
        "I am N-ethyl perfluorooctane sulfonamidoacetic acid (N-EtFOSAA), with the formula C12H8F17NO4S. "
        "I am not made for direct use, but I form when PFOS-based products such as Scotchgard and food-packaging coatings break down. "
        "I accumulate in wastewater treatment plant biosolids, landfills, and human blood samples. "
        "I eventually convert into PFOS, which persists for decades. "
        "Because of that, I contribute to PFOS-related harm such as liver damage, immune suppression, and developmental effects."
    ),
}

# Canonical-SMILES-keyed lookup, built once at import
PRESET_RESPONSES = {_canon(s): text for s, text in _RAW.items()}

def get_preset_response(smiles: str) -> str | None:
    mol = Chem.MolFromSmiles(smiles)
    return PRESET_RESPONSES.get(Chem.MolToSmiles(mol)) if mol else None