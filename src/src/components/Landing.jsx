import { useRef } from 'react'
import LiquidGlass from 'liquid-glass-react'
import './landing.css'

export default function Landing() {
  const page = useRef(null)
  return (
    <div className="lp" ref={page}>
      <div className="lp-bg">
        <div className="lp-blob warm" />
        <div className="lp-blob hot" />
        <div className="lp-blob gray" />
      </div>
      <main className="lp-main">
        <LiquidGlass mouseContainer={page} elasticity={0.25} cornerRadius={32} padding="48px 56px">
          <h1 className="lp-title">Forever chemicals,<br />up close.</h1>
          <p className="lp-sub">Build PFAS molecules in 3D, then race the clock to find where they collect.</p>
          <a href="#/page2" className="lp-link">Go to page 2</a>
        </LiquidGlass>
      </main>
    </div>
  )
}