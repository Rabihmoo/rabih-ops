import { useCallback, useEffect, useState } from 'react';

// Theme persistence hook.
//
// Source of truth at runtime: the `dark` class on <html>. localStorage
// stores the user's explicit choice (or is empty, meaning "follow OS").
// The pre-mount script in index.html does the initial paint — this hook
// keeps React state in sync and exposes a setter.
//
// Cross-tab sync: a `storage` event fires in *other* tabs when localStorage
// changes; we listen and re-flip the class so a dark/light switch in one
// tab applies everywhere without a reload.

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rabih-ops:theme';

function readCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'light') root.classList.remove('dark');
  else root.classList.add('dark');
  root.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#FAFAF7' : '#000000');
}

export function useTheme(): {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => readCurrentTheme());

  // Listen for cross-tab updates.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === 'light' ? 'light' : 'dark';
      applyTheme(next);
      setThemeState(next);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked — class change still applies for this session.
    }
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
