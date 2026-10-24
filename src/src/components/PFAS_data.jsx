import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import './PFAS_data.css'
import rows from '../pset.json'   // [{ cid, cmpdname, smiles }, ...]

const ROW_H = 38      // px, must match .grid-row height in the CSS
const VIEW_H = 560    // px, height of the scroll box (must match .grid-body in the CSS)
const OVERSCAN = 10   // extra rows drawn above and below

function DataPage() {
  const [scrollTop, setScrollTop] = useState(0)

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN)

  return (
    <main className="data">
      <header className="data-top">
        <a className="data-back" href="#/page2"><ArrowLeft size={15} /> Back to Talk with Atom</a>
        <span className="data-eyebrow">PFAS / REFERENCE SET</span>
      </header>

      <section className="data-wrap">
        <div className="data-heading">
          <h1>Every molecule<br /><span>on the list.</span></h1>
          <p className="data-count"><strong>{rows.length.toLocaleString()}</strong> molecules</p>
        </div>

        <div className="grid-head">
          <div>#</div>
          <div>Name</div>
          <div>SMILES</div>
        </div>

        <div
          className="grid-body"
          style={{ height: VIEW_H }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {rows.slice(start, end).map((r, i) => (
              <div
                key={r.id ?? start + i}
                className="grid-row"
                style={{ top: (start + i) * ROW_H }}
              >
                <div className="idx-cell">{String(start + i + 1).padStart(4, '0')}</div>
                <div className="name-cell" title={r.cmpdname}>{r.cmpdname}</div>
                <div className="smiles-cell" title={r.smiles}>{r.smiles}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

export default DataPage
