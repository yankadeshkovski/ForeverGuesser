import { useState, useEffect } from 'react'
import Page2 from './components/Page2'
import './App.css'

export default function App() {
  const [path, setPath] = useState(window.location.hash.slice(1) || '/')

  useEffect(() => {
    const onChange = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  if (path === '/page2') return <Page2 />

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: '1rem' }}>
      <h1>Home</h1>
      <button onClick={() => { window.location.hash = '/page2' }}>
        Go to page 2
      </button>
    </main>
  )
}