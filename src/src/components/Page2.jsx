// OWNER: (friend's name). Only edit this file and page2.css.
import './page2.css'
import { useState } from 'react'
import MolViewer from '../molecule.jsx'
import { getMolecule } from '../api.js'

function Page2() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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