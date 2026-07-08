import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';

// Light/dark toggle for the CMS console. The theme is a data-theme attribute
// on <html> (index.html sets it before first paint from localStorage to avoid
// a flash); this button flips it and persists the choice. Console-only --
// published sites carry their own theme.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cms-theme', next); } catch { /* private mode */ }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle light/dark mode"
      className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
