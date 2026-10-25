// Site-wide light/dark theme. One source of truth: the choice lives on <html data-theme="...">,
// is remembered in localStorage, and every page and toggle reads the same value.
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

const KEY = 'fg-theme'
const listeners = new Set()

const read = () => {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

let theme = typeof window === 'undefined' ? 'dark' : read()

const apply = () => {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme // native scrollbars and form controls follow the theme
}
if (typeof document !== 'undefined') apply() // runs when the app loads, before the first paint

const notify = () => listeners.forEach((fn) => fn())

function set(next) {
  if (next === theme) return
  theme = next
  try { localStorage.setItem(KEY, theme) } catch { /* private mode: just don't remember it */ }
  apply()
  notify()
}

export function toggleTheme() {
  const next = theme === 'dark' ? 'light' : 'dark'
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // Where supported, crossfade the whole page instead of snapping
  if (document.startViewTransition && !calm) document.startViewTransition(() => flushSync(() => set(next)))
  else set(next)
}

// Keep several open tabs in step
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) set(e.newValue === 'light' ? 'light' : 'dark')
  })
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

export function useTheme() {
  return useSyncExternalStore(subscribe, () => theme, () => 'dark')
}
