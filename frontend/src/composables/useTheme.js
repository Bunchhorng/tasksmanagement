import { ref } from 'vue'

const KEY = 'voicetask-theme'

function stored() {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref(stored() || systemTheme())

function apply(value) {
  document.documentElement.dataset.theme = value
}

export function useTheme() {
  apply(theme.value)

  function setTheme(value) {
    theme.value = value
    apply(value)
    try {
      localStorage.setItem(KEY, value)
    } catch {
      /* private mode: theme still applies for this visit */
    }
  }

  const toggleTheme = () => setTheme(theme.value === 'dark' ? 'light' : 'dark')

  return { theme, setTheme, toggleTheme }
}
