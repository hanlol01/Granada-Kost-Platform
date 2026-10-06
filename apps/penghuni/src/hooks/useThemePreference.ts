import { useEffect, useState } from "react";

const THEME_CHANGE_EVENT = "kostation:theme-change";

export function useThemePreference() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const syncTheme = () => {
      const isDark = localStorage.getItem("theme") !== "light";
      document.documentElement.classList.toggle("dark", isDark);
      setDark(isDark);
    };

    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
    };
  }, []);

  const toggleDark = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return { dark, toggleDark };
}
