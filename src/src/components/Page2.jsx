// OWNER: (friend's name). Only edit this file and page2.css.
import './page2.css'
import { useState, useRef, useEffect } from 'react'
import MolViewer from '../molecule.jsx'
import { getMolecule } from '../api.js'

const PRESETS = [
  {name: "CF2", smiles: "C(F)(F)"},
  {name: "CF3", smiles: "C(F)(F)F"},
  {name: "PFOA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFOS", smiles: "OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFHxS", smiles: "OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFNA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFDA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFUnDA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFHpA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFHxA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFBA", smiles: "OC(=O)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFBS", smiles: "OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "TFA", smiles: "OC(=O)C(F)(F)F"},
  {name: "GenX (HFPO-DA)", smiles: "OC(=O)C(F)(OC(F)(F)C(F)(F)C(F)(F)F)C(F)(F)F"},
  {name: "ADONA", smiles: "OC(=O)C(F)OC(F)(F)C(F)(F)C(F)(F)OC(F)(F)F"},
  {name: "F-53B", smiles: "OS(=O)(=O)C(F)(F)C(F)(F)OC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)Cl"},
  {name: "6:2 FTS", smiles: "OS(=O)(=O)CCC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "6:2 FTOH", smiles: "OCCC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "8:2 FTOH", smiles: "OCCC(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "PFOSA", smiles: "NS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"},
  {name: "N-EtFOSAA",smiles: "CCN(CC(=O)O)S(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F"}
]

function Page2() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function pickPreset(p) {
    setQuery(p.smiles)
    setMenuOpen(false)
  }

  async function handleSearch(e) {
    e.preventDefault()
    const smiles = query.trim()
    if (!smiles) return

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await getMolecule(smiles))
    } catch (err) {
      setError(err.message)   // keep the previous result visible
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p2">
      <h1>Page 2</h1>
      <a href="#/">Back to landing</a>

      <section id="center">
        <form onSubmit={handleSearch} className="search">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a SMILES string, e.g. OC(=O)C(F)(F)C(F)(F)F"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={loading || !query.trim()}>
            {loading ? 'Searching…' : 'Search'}
          </button>

          <div className="presets" ref={menuRef}>
            <button
              type="button"
              className="presets-toggle"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              Presets ▾
            </button>

            {menuOpen && (
              <ul className="presets-menu" role="listbox">
                {PRESETS.map((p) => (
                  <li key={p.name} role="option">
                    <button type="button" onClick={() => pickPreset(p)}>
                      <span className="preset-name">{p.name}</span>
                      <span className="preset-note">{p.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>

        {error && <p className="error" role="alert">{error}</p>}

        {result && (
          <>
            <h2>
              {result.formula}{' '}
              <span className={result.is_pfas ? 'badge pfas' : 'badge not-pfas'}>
                {result.is_pfas ? 'PFAS' : 'Not PFAS'}
              </span>
            </h2>
            <p>
              MW: {result.mol_weight} g/mol
              {result.is_pfas && ` · ${result.pfas_group_count} fully fluorinated carbon(s)`}
            </p>
            <p className="smiles">{result.canonical_smiles}</p>
            <MolViewer molblock={result.molblock} />
          </>
        )}
      </section>
    </main>
  )
}

export default Page2