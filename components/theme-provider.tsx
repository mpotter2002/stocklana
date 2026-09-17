"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ThemePreference,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/ui/theme-preference";

type ThemeContextValue = {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme requires ThemeProvider");
  }
  return value;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(ThemePreference.DEFAULT);
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  const apply = useCallback((next: ThemeChoice) => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextResolved = ThemePreference.resolved(next, prefersDark);
    ThemePreference.apply(nextResolved, document.documentElement);
    setChoiceState(next);
    setResolved(nextResolved);
  }, []);

  useLayoutEffect(() => {
    apply(ThemePreference.read());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(ThemePreference.read());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [apply]);

  const setChoice = useCallback((next: ThemeChoice) => {
    ThemePreference.write(next);
    apply(next);
  }, [apply]);

  const value = useMemo(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
