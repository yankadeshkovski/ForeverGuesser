import { Moon, Sun } from 'lucide-react'
import { toggleTheme, useTheme } from '../theme'
import '../theme.css'

// One small round button. It shows the mode you would switch to: a sun while dark, a moon while light.
// Place it in each page's top bar; the choice applies to every page.
export default function ThemeToggle() {
  const theme = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={label} title={label}>
      <Sun size={15} className="icon-sun" aria-hidden="true" />
      <Moon size={15} className="icon-moon" aria-hidden="true" />
    </button>
  )
}
