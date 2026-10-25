import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Search } from 'lucide-react'
import './PFAS_data.css'

// Produced by clean_pfas.py: [[cid, name, smiles], ...]. Put it in /public so it is
// fetched on demand instead of being bundled into the page's JavaScript.
const DATA_URL = '/pfas.json'

const ROW_H = 38      // px, must match .grid-row height in the CSS
const VIEW_H = 560    // px, height of the scroll box (must match .grid-body in the CSS)
const OVERSCAN = 10   // extra rows drawn above and below

function DataPage() {
  const [all, setAll] = useState(null)       // null = still loading
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [copied, setCopied] = useState(null)
  const bodyRef = useRef(null)
  const copyTimer = useRef(0)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(DATA_URL, { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setAll)
      .catch((e) => { if (e.name !== 'AbortError') setLoadError(`Couldn't load ${DATA_URL} (${e.message}). Run clean_pfas.py and put the result in /public.`) })
    return () => { ctrl.abort(); clearTimeout(copyTimer.current) }
  }, [])

  // Typing stays instant; the 26k-row filter runs at lower priority
  const deferred = useDeferredValue(query)
  const q = deferred.trim().toLowerCase()
  const rows = !all ? [] : !q ? all : all.filter(
    (r) => r[1].toLowerCase().includes(q) || r[2].toLowerCase().includes(q) || String(r[0]) === q
  )

  // New search -> back to the top
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
    setScrollTop(0)
  }, [q])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN)

  const copy = (r) => {
    navigator.clipboard?.writeText(r[2]).catch(() => {})
    setCopied(r[0])
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(null), 1200)
  }

  return (
    <main className="data">
      <header className="data-top">
        <a className="data-back" href="#/page2"><ArrowLeft size={15} /> Back to Talk with Atom</a>
        <span className="data-eyebrow">PFAS / REFERENCE SET</span>
      </header>

      <section className="data-wrap">
        <div className="data-heading">
          <h1>Every molecule<br /><span>on the list.</span></h1>
          <p className="data-count">
            <strong>{rows.length.toLocaleString()}</strong>
            {all && q ? ` of ${all.length.toLocaleString()}` : ''} molecules
          </p>
        </div>

        <label className="data-search">
          <Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SMILES or CID"
            aria-label="Search the PFAS list"
            spellCheck={false}
          />
        </label>

        <div className="grid-head">
          <div>#</div>
          <div>Name</div>
          <div>SMILES <span className="data-tip">click a row to copy</span></div>
        </div>

        <div
          ref={bodyRef}
          className="grid-body"
          style={{ height: VIEW_H }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          {loadError ? (
            <p className="data-empty is-error" role="alert">{loadError}</p>
          ) : !all ? (
            <p className="data-empty" role="status">Loading the reference set…</p>
          ) : rows.length === 0 ? (
            <p className="data-empty">No molecule matches “{deferred.trim()}”.</p>
          ) : (
            <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
              {rows.slice(start, end).map((r, i) => (
                <div
                  key={r[0]}
                  className={`grid-row${copied === r[0] ? ' is-copied' : ''}`}
                  style={{ top: (start + i) * ROW_H }}
                  role="button"
                  tabIndex={0}
                  onClick={() => copy(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(r) } }}
                >
                  <div className="idx-cell">{String(start + i + 1).padStart(5, '0')}</div>
                  <div className="name-cell" title={r[1]}>{r[1]}</div>
                  <div className="smiles-cell" title={r[2]}>
                    {copied === r[0] ? <span className="copied-tag"><Check size={12} /> Copied</span> : r[2]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default DataPage
