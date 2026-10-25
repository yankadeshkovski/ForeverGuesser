// Talk with Atom: front end.
// Data flow (getMolecule -> ask) is unchanged. Presentation follows the landing theme,
// and picking a preset now runs the search straight away.
import './page2.css'
import { Component, useState, useRef, useEffect } from 'react'
import { ArrowUpRight, Beaker, ChevronDown, Database, Info, Play, Search, Send } from 'lucide-react'
import MolViewer from '../molecule.jsx'
import { getMolecule, ask } from '../api.js'

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
const SMILES_PRIMER = 'SMILES writes a molecule as text: each letter is an atom (C, O, N, F), neighbors are bonded, and hydrogens are implied. = is a double bond, parentheses show a branch, and numbers close rings. For example, CCO is ethanol, OC(=O)C is acetic acid, and C(F)(F)F is a carbon with three fluorines. PFAS are usually a head group like OC(=O) followed by a chain of C(F)(F) units ending in C(F)(F)F'

const IDLE_LINE =
  "Hi, I'm Atom. Pick a PFAS from Presets or paste a SMILES string, and I'll show you my structure and tell you who I am."

function Mark() {
  return (
    <svg className="p2-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 16c0-5 3.2-8 7-8 2.9 0 4.5 2 6 4.4C21.5 14.8 23 16 25 16c0 5-3.2 8-7 8-2.9 0-4.5-2-6-4.4C10.5 17.2 9 16 7 16Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7" cy="16" r="2.4" fill="#d4ff55" /><circle cx="25" cy="16" r="2.4" fill="#ff604f" />
    </svg>
  )
}

// C8H15F... -> subscripted digits
function Formula({ text }) {
  return text.split(/(\d+)/).map((part, i) => (i % 2 ? <sub key={i}>{part}</sub> : part))
}

// Faint perfluoro chain shown before any molecule is loaded
function GhostChain() {
  const carbons = Array.from({ length: 8 }, (_, i) => ({ x: 50 + i * 72, y: i % 2 ? 118 : 82, up: i % 2 === 0 }))
  return (
    <svg className="p2-ghost" viewBox="0 0 620 200" aria-hidden="true">
      <polyline points={carbons.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.4" />
      {carbons.map((c, i) => {
        const dy = c.up ? -34 : 34
        return (
          <g key={i}>
            <line x1={c.x} y1={c.y} x2={c.x - 15} y2={c.y + dy} stroke="currentColor" strokeWidth="1" />
            <line x1={c.x} y1={c.y} x2={c.x + 15} y2={c.y + dy} stroke="currentColor" strokeWidth="1" />
            <circle cx={c.x - 15} cy={c.y + dy} r="5" fill="#ff604f" />
            <circle cx={c.x + 15} cy={c.y + dy} r="5" fill="#ff604f" />
            <circle cx={c.x} cy={c.y} r="6.5" fill="#d4ff55" />
          </g>
        )
      })}
    </svg>
  )
}

// If the 3D viewer ever throws, show a message here instead of blanking the whole app
class ViewerBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error('3D viewer crashed', err) }
  render() {
    return this.state.failed
      ? <div className="p2-empty"><strong>3D view unavailable</strong><span>RELOAD THE PAGE TO TRY AGAIN</span></div>
      : this.props.children
  }
}

function Dots() {
  return <span className="p2-dots" aria-hidden="true"><i /><i /><i /></span>
}

function Page2() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [resultName, setResultName] = useState(null)
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [answerLoading, setAnswerLoading] = useState(false)
  const [answerError, setAnswerError] = useState(null)
  const [openPanel, setOpenPanel] = useState(null) // 'info' | 'presets' | null
  const [preview, setPreview] = useState(null)
 
  // ── Conversation state ──
  const [history, setHistory] = useState([])               // turns after the intro: [{role, text}]
  const [activeSmiles, setActiveSmiles] = useState(null)  // the SMILES Atom is actually talking as
  const [followUp, setFollowUp] = useState('')
  const [lastQuestion, setLastQuestion] = useState(null)
 
  const barRef = useRef(null)
  const requestId = useRef(0)
 
  useEffect(() => {
    if (!openPanel) return
    const onClick = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpenPanel(null)
    }
    const onKey = (e) => e.key === 'Escape' && setOpenPanel(null)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openPanel])
 
  function togglePanel(name) {
    setPreview(null)
    setOpenPanel((cur) => (cur === name ? null : name))
  }
 
  async function runSearch(raw, name = null) {
    const smiles = raw.trim()
    if (!smiles) return
 
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setResult(null)
    setResultName(name)
    setAnswer(null)
    setAnswerError(null)
    setAnswerLoading(false)
    // A new molecule starts a fresh conversation
    setHistory([])
    setFollowUp('')
    setLastQuestion(null)
    setActiveSmiles(smiles)
 
    // 1. Molecule data and 3D viewer
    try {
      const mol = await getMolecule(smiles)
      if (id !== requestId.current) return
      setResult(mol)
      setLoading(false)
    } catch (err) {
      if (id === requestId.current) {
        setError(err.message)
        setLoading(false)
      }
      return
    }
 
    // 2. Atom's introduction
    setAnswerLoading(true)
    try {
      const res = await ask(smiles)
      if (id !== requestId.current) return
      const text = typeof res === 'string' ? res : res.answer
      setAnswer(text)
      setHistory([{ role: 'model', text }]) // the intro is the first turn of history
    } catch (err) {
      if (id === requestId.current) setAnswerError(err.message)
    } finally {
      if (id === requestId.current) setAnswerLoading(false)
    }
  }
 
  async function sendFollowUp(e) {
    e.preventDefault()
    const message = followUp.trim()
    if (!message || !result || !activeSmiles || answerLoading) return
 
    const id = requestId.current // not incremented: a new search still invalidates this request
    setFollowUp('')
    setLastQuestion(message)
    setAnswerError(null)
    setAnswerLoading(true)
 
    try {
      const res = await ask(activeSmiles, message, history)
      if (id !== requestId.current) return
      const text = typeof res === 'string' ? res : res.answer
      setAnswer(text)
      setHistory((h) => [...h, { role: 'user', text: message }, { role: 'model', text }])
    } catch (err) {
      // history is untouched on failure, so the user can simply resend
      if (id === requestId.current) setAnswerError(err.message)
    } finally {
      if (id === requestId.current) setAnswerLoading(false)
    }
  }
 
  function handleSubmit(e) {
    e.preventDefault()
    setOpenPanel(null)
    runSearch(query)
  }
 
  function pickPreset(p) {
    setQuery(p.smiles)
    setOpenPanel(null)
    setPreview(null)
    runSearch(p.smiles, p.name)
  }
 
  // What Atom says in the speech bubble
  let bubbleState = 'idle'
  let bubbleBody = IDLE_LINE
  if (error) {
    bubbleState = 'error'
    bubbleBody = error
  } else if (loading) {
    bubbleState = 'loading'
    bubbleBody = <>Building my 3D structure <Dots /></>
  } else if (answerError) {
    bubbleState = 'error'
    bubbleBody = `I couldn't put myself into words just now. (${answerError})`
  } else if (answerLoading) {
    bubbleState = 'loading'
    bubbleBody = <>Let me think about who I am <Dots /></>
  } else if (answer) {
    bubbleState = 'answer'
    bubbleBody = answer
  }
 
  return (
    <main className="p2">
      {/* ── Top bar ─────────────────────────────── */}
      <header className="p2-topbar" ref={barRef}>
        <div className="p2-info">
          <button
            type="button"
            className="p2-icon-btn"
            aria-label="What is a SMILES string?"
            aria-expanded={openPanel === 'info'}
            onClick={() => togglePanel('info')}
          >
            <Info size={17} />
          </button>
          {openPanel === 'info' && (
            <div className="p2-pop p2-info-pop" role="dialog" aria-label="About SMILES">
              <span className="p2-eyebrow">Reading SMILES</span>
              <p>{SMILES_PRIMER}</p>
            </div>
          )}
        </div>
 
        <form onSubmit={handleSubmit} className="p2-controls">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a SMILES string, e.g. OC(=O)C(F)(F)C(F)(F)F"
            spellCheck={false}
            autoComplete="off"
            aria-label="SMILES string"
          />
 
          <button
            type="button"
            className="p2-ghost-btn"
            aria-haspopup="listbox"
            aria-expanded={openPanel === 'presets'}
            onClick={() => togglePanel('presets')}
          >
            Presets <ChevronDown size={14} className={openPanel === 'presets' ? 'is-flipped' : ''} />
          </button>
 
          <button type="submit" className="p2-lime-btn" disabled={loading || !query.trim()}>
            <Search size={15} /> {loading ? 'Searching…' : 'Search'}
          </button>
 
          {openPanel === 'presets' && (
            <div className="p2-presets-pop">
              <div className="p2-pop p2-preset-list">
                <span className="p2-eyebrow">Presets · {PRESETS.length}</span>
                <ul role="listbox" aria-label="PFAS presets">
                  {PRESETS.map((p) => (
                    <li key={p.name} role="option" aria-selected={preview?.name === p.name}>
                      <button
                        type="button"
                        onMouseEnter={() => setPreview(p)}
                        onFocus={() => setPreview(p)}
                        onClick={() => pickPreset(p)}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p2-pop p2-preset-preview" aria-live="polite">
                <span className="p2-eyebrow">SMILES string</span>
                {preview ? (
                  <>
                    <h3>{preview.name}</h3>
                    <code>{preview.smiles}</code>
                    <small>Click to load it and ask Atom.</small>
                  </>
                ) : (
                  <p>Hover a preset to preview its SMILES string.</p>
                )}
              </div>
            </div>
          )}
        </form>
 
        <a
          className="p2-data-btn"
          href="#/PFAS_data"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the PFAS database in a new tab"
        >
          <Database size={15} /> PFAS database <ArrowUpRight size={13} />
        </a>
      </header>
 
      {/* ── Stage: model + Atom's speech bubble ── */}
      <section className="p2-stage">
        <div className="p2-grid" />
 
        <div className="p2-model">
          {/* One viewer stays mounted; the empty state is just an overlay on top of it */}
          <ViewerBoundary>
            <MolViewer molblock={result?.molblock ?? null} />
          </ViewerBoundary>
 
          {!result && (
            <div className="p2-empty">
              <GhostChain />
              <strong>{loading ? 'Building structure…' : 'No molecule yet'}</strong>
              <span>PICK A PRESET OR PASTE A SMILES STRING</span>
            </div>
          )}
 
          {loading && <div className="p2-scanline" aria-hidden="true" />}
 
          {result && (
            <div className="p2-readout">
              <span className="p2-eyebrow">{resultName ?? 'Specimen'}</span>
              <h2>
                <Formula text={result.formula} />{' '}
                <span className={result.is_pfas ? 'p2-badge is-pfas' : 'p2-badge'}>
                  {result.is_pfas ? 'PFAS' : 'Not PFAS'}
                </span>
              </h2>
              <p className="p2-stats">
                MW {result.mol_weight} g/mol
                {result.is_pfas && ` · ${result.pfas_group_count} fully fluorinated carbon${result.pfas_group_count === 1 ? '' : 's'}`}
              </p>
              <p className="p2-smiles" title={result.canonical_smiles}>{result.canonical_smiles}</p>
            </div>
          )}
 
          {result && <span className="p2-hint">DRAG TO ROTATE · SCROLL TO ZOOM</span>}
        </div>
 
        <div className="p2-bubble-wrap">
          <div
            className={`p2-bubble is-${bubbleState}`}
            role={bubbleState === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <div className="p2-bubble-head"><span className="p2-live" /> ATOM</div>
            <p>{bubbleBody}</p>
          </div>
 
          {lastQuestion && !answerLoading && (
            <p className="p2-asked">You asked: {lastQuestion}</p>
          )}
 
          {result && (
            <form className="p2-chat" onSubmit={sendFollowUp}>
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask Atom a question…"
                maxLength={500}
                disabled={loading || answerLoading}
                spellCheck
                autoComplete="off"
                aria-label="Ask Atom a follow-up question"
              />
              <button
                type="submit"
                className="p2-lime-btn"
                disabled={loading || answerLoading || !followUp.trim()}
              >
                <Send size={15} /> Ask
              </button>
            </form>
          )}
        </div>
      </section>
 
      {/* ── Bottom navbar ───────────────────────── */}
      <nav className="p2-dock" aria-label="Primary">
        <a href="#/"><Mark /> Home</a>
        <a href="#/page2" aria-current="page"><Beaker size={15} /> Talk with Atom</a>
        <a href="#/page3"><Play size={13} fill="currentColor" /> Play Guesser</a>
      </nav>
    </main>
  )
}
 
export default Page2
