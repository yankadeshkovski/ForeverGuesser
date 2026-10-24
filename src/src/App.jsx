import { useState, useEffect } from 'react'
import Landing from './components/Landing'
import Page2 from './components/Page2'

const routes = {
  '/': Landing,
  '/page2': Page2,
}

export default function App() {
  const [path, setPath] = useState(window.location.hash.slice(1) || '/')

  useEffect(() => {
    const onChange = () => setPath(window.location.hash.slice(1) || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const Page = routes[path] || Landing
  return <Page />
}