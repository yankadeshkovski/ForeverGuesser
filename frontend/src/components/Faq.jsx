import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import './faq.css'

// An answer is a list of paragraphs. A paragraph is a list of parts: plain strings,
// L(text, url) for a source on another site, or I(text, hash) for a link inside Forever Guesser.
const L = (t, href) => ({ t, href })
const I = (t, href) => ({ t, href, internal: true })

const SECTIONS = [
  {
    id: 'basics',
    label: 'The basics',
    items: [
      {
        q: 'What does “forever chemicals” actually mean?',
        a: [['PFAS earned the nickname because they almost never break down. Their carbon-fluorine bonds are among the strongest in organic chemistry, so natural processes like sunlight, microbes, and heat barely touch them. A PFAS molecule released decades ago can still be intact today.']],
      },
      {
        q: 'How many PFAS are there?',
        a: [[
          'Thousands. Estimates vary depending on how you define the family, but regulators and researchers track ',
          L('well over 10,000 related compounds', 'https://pubchem.ncbi.nlm.nih.gov/classification/#hid=105&nid=node_422&node_data=compound&alias=CompTox%20Chemicals%20Dashboard%20Chemical%20Lists:%20PFAS'),
          '. That’s a big part of why they’re hard to study: most research covers only a handful, like PFOA and PFOS, while thousands of others have little data.',
        ]],
      },
      {
        q: 'Where are PFAS used?',
        a: [['They show up wherever manufacturers want something to repel water, oil, or heat. Common examples include nonstick cookware, waterproof and stain-resistant fabrics, food packaging, firefighting foams, and industrial coatings. Because they’ve been used since the 1940s, they’re now in products, factories, airports, and military sites around the world.']],
      },
    ],
  },
  {
    id: 'problem',
    label: 'Why they’re a problem',
    items: [
      {
        q: 'Why don’t PFAS break down?',
        a: [
          ['It comes down to the carbon-fluorine bond, the strongest single bond carbon can form. Fluorine is the most electronegative element, so it pulls the shared electrons in the bond very close to itself. That gives the bond a partial charge, with fluorine slightly negative and carbon slightly positive, and the attraction between those charges adds to the strength of the bond itself. Fluorine is also small, so it sits tight against the carbon and overlaps well with it, which makes the bond short and hard to stretch or snap.'],
          ['In PFAS molecules, it gets even tougher. Many fluorine atoms are packed along the carbon chain, and they reinforce each other and form a protective shell around the carbon backbone, leaving few places for anything to attack. Nature breaks down most molecules by going after carbon-hydrogen bonds with enzymes and microbes, but those tools don’t work on carbon-fluorine bonds. Breaking them takes extreme heat or specialized treatment technology. That’s why PFAS accumulate in the environment instead of fading away.'],
        ],
      },
      {
        q: 'How do PFAS get into the water we drink?',
        a: [
          ['Factories, landfills, treatment plants, firefighting training grounds, and many other places release PFAS into the environment. From there, many PFAS move easily through soil and into groundwater, rivers, and wells, because their charged head groups (like carboxylates and sulfonates) bond with water molecules and keep them dissolved.'],
          [
            L('A 2023 USGS study', 'https://www.usgs.gov/news/national-news-release/tap-water-study-detects-pfas-forever-chemicals-across-us'),
            ' estimated that at least 45% of US tap water contains one or more PFAS.',
          ],
        ],
      },
      {
        q: 'How do PFAS affect the human body?',
        a: [
          ['Some PFAS stay in the body for years, so repeated low-level exposure can build up. Research has linked certain PFAS to higher cholesterol, immune system effects, reduced vaccine response, thyroid changes, effects on child development, and some cancers.'],
          [
            'In 2023, the ',
            L('International Agency for Research on Cancer', 'https://www.iarc.who.int/news-events/iarc-monographs-evaluate-the-carcinogenicity-of-perfluorooctanoic-acid-pfoa-and-perfluorooctanesulfonic-acid-pfos/'),
            ' classified PFOA as carcinogenic to humans and PFOS as possibly carcinogenic.',
          ],
        ],
      },
      {
        q: 'Are all PFAS equally harmful?',
        a: [['No, and that’s an important point. PFOA and PFOS are the most studied and have the strongest evidence of harm. Many other PFAS haven’t been studied enough to know. Some newer replacements were designed to be shorter-chain and “safer,” but researchers are still working out whether they truly are, and they can be harder to filter out of water.']],
      },
    ],
  },
  {
    id: 'science',
    label: 'Science and policy right now',
    items: [
      {
        q: 'Why are scientists still studying PFAS?',
        a: [
          [
            'Because there’s a lot we still don’t know. Researchers are working on how to detect more PFAS at lower levels, understand how mixtures of PFAS affect the body, find out which of the thousands of compounds are most harmful, and develop ways to destroy them rather than just filter them out. And there are times we may simply overlook the effects of PFAS, for instance ',
            L('this paper', 'https://www.cell.com/cell-reports-sustainability/fulltext/S2949-7906(26)00262-4'),
            ' published in 2026.',
          ],
          [
            'If you’re still curious about current issues, ',
            L('take a look here', 'https://pubs.rsc.org/su/article/2/11/3183/872639/Addressing-the-persistence-of-per-and-poly'),
            '.',
          ],
        ],
      },
      {
        q: 'What are governments doing about it?',
        a: [
          [
            'In April 2024, the US EPA set the first enforceable national drinking water limits for PFAS. More recently, the EPA has moved to proposing ',
            L('two additional rules', 'https://www.epa.gov/sdwa/and-polyfluoroalkyl-substances-pfas'),
            '.',
          ],
          [
            'Internationally, the Stockholm Convention has listed three PFAS for global restriction, though that only covers a sliver of the family of PFAS molecules. The PFOA molecule seen on the front page is actually marked in ',
            L('annex A (elimination)', 'https://chm.pops.int/Implementation/Alternatives/AlternativestoPOPs/ChemicalslistedinAnnexA/tabid/5837/Default.aspx'),
            '. ',
            L('The EU', 'https://echa.europa.eu/-/echa-publishes-updated-pfas-restriction-proposal'),
            ' has gone furthest, with a proposal to restrict more than 10,000 PFAS and allow them only where essential, which is still under scientific review.',
          ],
        ],
      },
      {
        q: 'Is there a way to combat PFAS?',
        a: [
          ['Yes, though removing PFAS and destroying them are two different problems. Most water treatment today relies on separation. Sorption is a common separation technique: the hydrophobic tails of PFAS molecules attach to carbon surfaces, while the charged head groups alternatively bind to positively charged sites. Other separation solutions use principles like reverse osmosis and nanofiltration.'],
          [
            'Destruction, on the other hand, takes a more aggressive approach. High-temperature incineration is an option but is highly energy-intensive. Newer approaches include electrochemical oxidation, plasma treatments, and hydrothermal alkaline treatments. A recent promising solution is the use of ',
            L('heated sodium hydroxide in dimethyl sulfoxide (DMSO)', 'https://www.sciencedirect.com/science/article/pii/S1385894725000956#ak005'),
            ', a polar aprotic solvent.',
          ],
        ],
      },
    ],
  },
  {
    id: 'guesser',
    label: 'Forever Guesser',
    items: [
      {
        q: 'Why use a 3D molecular visualizer to learn about PFAS?',
        a: [[
          'Seeing a molecule makes the chemistry click. When you can rotate a PFAS molecule and see the fluorine atoms wrapped around the carbon chain, it’s much easier to understand why it repels water, resists breakdown, and sticks around. ',
          I('Talk with Atom', '#/page2'),
          ' pairs that view with an AI explanation, so you can look up any compound, get context on whether it’s a PFAS, where it’s found, and whatever else you may be curious about.',
        ]],
      },
      {
        q: 'Why a game about where PFAS show up?',
        a: [[
          'Even now, finding PFAS is a real challenge. They’re found nearly everywhere, but testing is expensive and slow, so we still don’t know where much of the contamination is, or what to do about it once we find it. That’s why scientists and communities rely on patterns to decide where to look. PFAS contamination isn’t random. It follows industry, airports, military sites, and water flow. ',
          I('Play Guesser', '#/page3'),
          ' turns those patterns into a challenge: you study the clues, make your prediction on the map, and then see the real heat map. Guessing wrong teaches you something too.',
        ]],
      },
    ],
  },
]

const pad = (n) => String(n).padStart(2, '0')

function Part({ part }) {
  if (typeof part === 'string') return part
  if (part.internal) return <a className="qa-link" href={part.href}>{part.t}</a>
  return (
    <a className="qa-link" href={part.href} target="_blank" rel="noopener noreferrer">
      {part.t}
      <ArrowUpRight size={11} aria-hidden="true" />
      <span className="qa-sr"> (opens in a new tab)</span>
    </a>
  )
}

export default function Faq() {
  const [sec, setSec] = useState(0)
  const [open, setOpen] = useState(`${SECTIONS[0].id}-0`)
  const [switched, setSwitched] = useState(false) // stagger the questions in only after the reader changes section
  const [phase, setPhase] = useState('idle')      // idle (visible) -> armed (hidden, waiting) -> in (revealed)
  const [ind, setInd] = useState(null)            // the sliding marker under/beside the active tab
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const tabRefs = useRef([])
  const secRef = useRef(0)
  secRef.current = sec

  // One reveal as the section scrolls into view
  useLayoutEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    setPhase('armed')
  }, [])
  useEffect(() => {
    if (phase !== 'armed' || !rootRef.current) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPhase('in'); io.disconnect() } }, { threshold: 0.12 })
    io.observe(rootRef.current)
    return () => io.disconnect()
  }, [phase])

  // Keep the marker on the active tab, including after resizes and font loads
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[secRef.current]
      if (!el) return
      setInd({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
      const list = listRef.current
      if (list && list.scrollWidth > list.clientWidth) {
        list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (listRef.current) ro.observe(listRef.current)
    return () => ro.disconnect()
  }, [sec])

  const choose = (i) => {
    if (i === sec) return
    setSwitched(true)
    setSec(i)
    setOpen(`${SECTIONS[i].id}-0`) // land on an open answer so the new section never looks empty
  }

  const onTabKey = (e) => {
    const last = SECTIONS.length - 1
    const next = { ArrowRight: sec + 1, ArrowDown: sec + 1, ArrowLeft: sec - 1, ArrowUp: sec - 1, Home: 0, End: last }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const i = Math.max(0, Math.min(last, next))
    choose(i)
    tabRefs.current[i]?.focus()
  }

  const current = SECTIONS[sec]

  return (
    <section
      ref={rootRef}
      className={`qa wrap${phase === 'armed' ? ' is-armed' : ''}`}
      id="faq"
      style={ind ? { '--ix': `${ind.x}px`, '--iy': `${ind.y}px`, '--iw': `${ind.w}px`, '--ih': `${ind.h}px` } : undefined}
    >
      <div className="qa-side">
        <div className="section-heading">
          <span className="eyebrow">FAQ</span>
          <h2>Still curious?<br /><span>Start here.</span></h2>
          <p className="what-intro">Short answers to the questions people ask most, with the sources linked.</p>
        </div>

        <div className="qa-tabs" role="tablist" aria-label="FAQ sections" ref={listRef} onKeyDown={onTabKey}>
          <span className="qa-ind" aria-hidden="true" />
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => { tabRefs.current[i] = el }}
              type="button"
              role="tab"
              id={`qa-tab-${s.id}`}
              aria-selected={i === sec}
              aria-controls="qa-panel"
              tabIndex={i === sec ? 0 : -1}
              className={`qa-tab${i === sec ? ' is-active' : ''}`}
              onClick={() => choose(i)}
            >
              <span>{s.label}</span>
              <small>{pad(s.items.length)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="qa-main">
        <div className={`qa-list${switched ? ' is-switching' : ''}`} role="tabpanel" id="qa-panel" aria-labelledby={`qa-tab-${current.id}`} key={current.id}>
          {current.items.map((item, i) => {
            const id = `${current.id}-${i}`
            const isOpen = open === id
            return (
              <div className={`qa-item${isOpen ? ' is-open' : ''}`} key={id} style={{ '--i': i }}>
                <h3>
                  <button type="button" className="qa-btn" id={`qa-q-${id}`} aria-expanded={isOpen} aria-controls={`qa-a-${id}`} onClick={() => setOpen(isOpen ? null : id)}>
                    <span className="qa-num">{pad(i + 1)}</span>
                    <span className="qa-q">{item.q}</span>
                    <span className="qa-icon" aria-hidden="true"><i /><i /></span>
                  </button>
                </h3>
                <div className="qa-a" id={`qa-a-${id}`} role="region" aria-labelledby={`qa-q-${id}`}>
                  <div className="qa-a-inner">
                    <div className="qa-body">
                      {item.a.map((para, p) => (
                        <p key={p} style={{ '--p': p }}>
                          {para.map((part, k) => <Part part={part} key={k} />)}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="qa-note">Source links open in a new tab.</p>
      </div>
    </section>
  )
}
