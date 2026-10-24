// OWNER: (friend's name). Only edit this file and page2.css.
import './page2.css'
import { useEffect, useState } from 'react'
import MolViewer from '../molecule.jsx'

function Page2() {

  const [molblock, setMolblock] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/getMolecule')
      .then((res) => {
        if (!res.ok) throw new Error('API returned ' + res.status)
        return res.json()
      })
      .then((data) => setMolblock(data.molblock))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="p2">
      <h1>Page 2</h1>
      <a href="#/">Back to landing</a>

      <section id="center">
        <h1>PFOA</h1>
        {error && <p>Couldn't load molecule: {error}</p>}
        {!molblock && !error && <p>Loading...</p>}
        {molblock && <MolViewer molblock={molblock} />}
      </section>
    </main>
    
  )
}

export default Page2