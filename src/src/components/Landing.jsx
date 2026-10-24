import { useEffect, useRef, useState } from 'react'
import './landing.css'
import { ArrowUpRight, Beaker, FlaskConical, Play, ScanLine, Waves } from 'lucide-react'

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 16c0-5 3.2-8 7-8 2.9 0 4.5 2 6 4.4C21.5 14.8 23 16 25 16c0 5-3.2 8-7 8-2.9 0-4.5-2-6-4.4C10.5 17.2 9 16 7 16Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7" cy="16" r="2.4" fill="#d4ff55" /><circle cx="25" cy="16" r="2.4" fill="#ff604f" />
    </svg>
  )
}

const compounds = {
  pfoa: {
    label: 'PFOA',
    name: 'Perfluorooctanoic acid',
    formula: 'C₈HF₁₅O₂',
    smiles: 'OC(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F',
  },
  pfos: {
    label: 'PFOS',
    name: 'Perfluorooctanesulfonic acid',
    formula: 'C₈HF₁₇O₃S',
    smiles: 'OS(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F',
  },
}

function MolecularViewer() {
  const mount = useRef(null)
  const [ready, setReady] = useState(false)
  const [compoundKey, setCompoundKey] = useState('pfoa')
  const compound = compounds[compoundKey]

  useEffect(() => {
    let viewer
    let cancelled = false
    async function renderMolecule() {
      setReady(false)
      try {
        const initRDKit = (await import('@rdkit/rdkit')).default
        const RDKit = await initRDKit({ locateFile: () => '/RDKit_minimal.wasm' })
        const molecule = RDKit.get_mol(compound.smiles)
        if (!molecule) throw new Error(`RDKit could not parse ${compound.label}`)
        // RDKit MinimalLib validates the exact SMILES/connectivity, but its browser
        // build exports 2D coordinates only. Lift those verified atoms into a
        // deterministic 3D conformer-like layout before handing the molfile to 3Dmol.
        const rdkitBlock = molecule.get_v3Kmolblock()
        const molBlock = rdkitBlock.replace(/(M  V30\s+\d+\s+([A-Z][a-z]?)\s+[-+\d.eE]+\s+[-+\d.eE]+\s+)[-+\d.eE]+/g, (line, prefix, element) => {
          const atomIndex = Number(line.match(/M  V30\s+(\d+)/)?.[1] ?? 0)
          const z = element === 'F' ? Math.sin(atomIndex * 1.7) * 0.9 : Math.cos(atomIndex * 1.3) * 0.28
          return `${prefix}${z.toFixed(3)}`
        })
        molecule.delete()
        const $3Dmol = await import('3dmol')
        if (cancelled || !mount.current) return
        viewer = $3Dmol.createViewer(mount.current, { backgroundColor: '#000000', backgroundAlpha: 0, antialias: true })
        viewer.addModel(molBlock, 'mol')
        viewer.setStyle({}, { stick: { radius: 0.13, colorscheme: { C: '#d4ff55', F: '#ff604f', O: '#f4f4f0', S: '#ffb84d' } }, sphere: { scale: 0.25, colorscheme: { C: '#d4ff55', F: '#ff604f', O: '#f4f4f0', S: '#ffb84d' } } })
        viewer.zoomTo()
        viewer.setProjection('perspective')
        viewer.rotate(18, 'y')
        viewer.spin('y', 0.35)
        viewer.render()
        setReady(true)
      } catch (error) {
        console.error('Molecular viewer failed to initialize', error)
      }
    }
    renderMolecule()
    return () => { cancelled = true; viewer?.clear() }
  }, [compound.smiles, compound.label])

  return <div className="molecule-stage">
    <div className="compound-switch" role="group" aria-label="Choose a PFAS compound">
      {Object.keys(compounds).map((key) => <button key={key} type="button" className={compoundKey === key ? 'is-active' : ''} onClick={() => setCompoundKey(key)} aria-pressed={compoundKey === key}>{compounds[key].label}</button>)}
    </div>
    <div className={`molecular-canvas ${ready ? 'is-ready' : ''}`} ref={mount} aria-label={`Interactive 3D model of ${compound.name}, ${compound.label}`} role="img" />
    <div className="compound-label"><strong>{compound.label}</strong><span>{compound.name}</span><small>{compound.formula}</small></div>
  </div>
}

const facts = [
  ['01', Waves, 'It travels through water.', 'PFAS can move through soil into groundwater, wells, rivers, and drinking-water supplies.'],
  ['02', ScanLine, 'Cumulative exposure matters.', 'Repeated, low-level contact can contribute to a body burden over time; some PFAS have been associated with immune, cholesterol, and developmental effects.'],
  ['03', FlaskConical, 'The chemistry lasts.', 'Many PFAS resist environmental breakdown and can remain present for years, turning a single release into a long-term exposure concern.'],
]

export default function Landing() {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => setProgress(Math.min(1, window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)))
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <main className="site-shell">
      <div className="scroll-line"><span style={{ transform: `scaleX(${progress})` }} /></div>
      <nav className="topbar">
        <a className="wordmark" href="#top"><Mark /><span>FOREVER<br /><i>GUESSER</i></span></a>
        <div className="nav-links"><a href="#/page2">Talk with Atom</a><a href="#game">Play Guesser</a><a href="#why">Why it matters</a></div>
      </nav>

      <section className="hero wrap" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> PFAS / FOREVER CHEMICALS</div>
          <h1>Some things<br /><em>never leave.</em></h1>
          <p className="hero-lede">Explore the chemistry behind the world&apos;s most UN-forgettable chemicals—then see where they go.</p>
          <div className="hero-actions"><a className="button button-lime" href="#/page2"><Beaker size={17} /> Talk with Atom</a><a className="button button-quiet" href="#game"><Play size={15} fill="currentColor" /> Play Guesser</a></div>
        </div>
        <div className="hero-specimen"><div className="specimen-grid" /><MolecularViewer /><div className="specimen-caption"><span>PFOA + PFOS / RDKit 3D</span><span>DRAG TO ROTATE</span></div></div>
      </section>

      <section className="signal-strip"><div className="wrap signal-inner"><strong>LEARN BY LOOKING CLOSER</strong><span>Carbon–fluorine bonds, made visible.</span></div></section>

      <section className="bento wrap" id="why"><div className="section-heading"><span className="eyebrow">Why it matters</span><h2>Invisible by design.<br /><span>Persistent by chemistry.</span></h2></div><div className="bento-grid">{facts.map(([number, Icon, title, copy]) => <article className={`bento-item ${number === '01' ? 'bento-wide' : number === '02' ? 'bento-dark' : 'bento-accent'}`} key={number}><div className="bento-meta"><span>{number}</span><Icon size={18} /></div><h3>{title}</h3><p>{copy}</p>{number === '01' && <div className="water-lines" />}</article>)}</div></section>

      <section className="experiences wrap" id="sandbox"><div className="section-heading"><span className="eyebrow">Look closer</span><h2>Start with a molecule.<br /><span>Leave with a map.</span></h2></div><div className="experience-list">
        <a className="experience-row" href="#/page2"><span className="experience-index">01</span><div className="experience-panel"><div className="panel-kicker"><Beaker size={14} /> MOLECULAR CONTEXT</div><h3>Talk with Atom</h3><p>Enter a compound, see its structure rendered in 3D, and let AI explain what it is, whether it is PFAS, where it is commonly found, and why that context matters.</p><span className="experience-action">Explore the compound <ArrowUpRight size={14} /></span></div><ArrowUpRight /></a>
        <a className="experience-row" href="#game" id="game"><span className="experience-index">02</span><div className="experience-panel panel-map"><div className="panel-kicker"><Play size={13} fill="currentColor" /> GEOGRAPHIC SIGNAL</div><h3>Play Guesser</h3><p>Study the clues, drop a pin on the map, and predict where PFAS levels are highest. Reveal the heat map to see how close you were.</p><span className="experience-action">Find the hotspot <ArrowUpRight size={14} /></span></div><ArrowUpRight /></a>
      </div></section>
      <footer className="footer wrap"><a className="wordmark" href="#top"><Mark /><span>FOREVER<br /><i>GUESSER</i></span></a><p>Understanding what stays with us.</p><span className="footer-code">FG / 001 / 2026</span></footer>
    </main>
  )
}