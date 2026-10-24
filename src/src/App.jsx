import { useState, useEffect } from 'react'
import Landing from './components/Landing'
import Page2 from './components/Page2'
import Page3 from './components/Page3'

const routes = {
  '/': Landing,
  '/page2': Page2,
  '/page3': Page3,
}

export default function App() {
  const [path, setPath] = useState(window.location.hash.slice(1) || '/')

  useEffect(() => {
    const onChange = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  // Section anchors like #why or #game aren't routes, so they fall back to Landing.
  const Page = routes[path] || Landing
  return <Page />
}