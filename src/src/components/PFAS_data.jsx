import { useState, useEffect } from 'react'
import './PFAS_data.css'
import rows from '../pset.json'   // [{ "name": "PFOA", "smiles": "OC(=O)..." }, ...]

const ROW_H = 32      // px, must match .grid-row height in the CSS
const VIEW_H = 500    // px, height of the scroll box
const OVERSCAN = 10   // extra rows drawn above and below

function DataPage() {
  const [scrollTop, setScrollTop] = useState(0)

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + VIEW_H) / ROW_H) + OVERSCAN)

  return (
    <main className="data">
      <h1>Data</h1>
      <a href="#/page2">Back to analyzer</a>
      <p>{rows.length.toLocaleString()} molecules</p>

      <div className="grid-head">
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
                <div className="smiles-cell" title={r.cmpdname}>{r.cmpdname}</div>
            <div className="smiles-cell" title={r.smiles}>{r.smiles}</div>
        </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export default DataPage