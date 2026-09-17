export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export type ResolvedTheme = "light" | "dark";

export interface ThemeRoot {
  classList: {
    toggle(token: string, force?: boolean): unknown;
  };
  style: {
    colorScheme: string;
  };
}

export class ThemePreference {
  static readonly STORAGE_KEY = "stocklana.theme";
  static readonly DEFAULT: ThemeChoice = "system";

  static parse(value: string | null | undefined): ThemeChoice {
    return value === "light" || value === "dark" || value === "system"
      ? value
      : ThemePreference.DEFAULT;
  }

  static label(choice: ThemeChoice): string {
    if (choice === "light") return "Light";
    if (choice === "dark") return "Dark";
    return "System";
  }

  static cycle(choice: ThemeChoice): ThemeChoice {
    const index = THEME_CHOICES.indexOf(choice);
    return THEME_CHOICES[(index + 1) % THEME_CHOICES.length] ?? ThemePreference.DEFAULT;
  }

  static resolved(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
    if (choice === "system") return prefersDark ? "dark" : "light";
    return choice;
  }

  static apply(resolved: ResolvedTheme, root: ThemeRoot): void {
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }

  static read(): ThemeChoice {
    try {
      return ThemePreference.parse(window.localStorage.getItem(ThemePreference.STORAGE_KEY));
    } catch {
      return ThemePreference.DEFAULT;
    }
  }

  static write(choice: ThemeChoice): void {
    window.localStorage.setItem(ThemePreference.STORAGE_KEY, choice);
  }

  static blockingScript(): string {
    const key = JSON.stringify(ThemePreference.STORAGE_KEY);
    return `(function(){try{var k=${key};var v=localStorage.getItem(k);var c=v==="light"||v==="dark"||v==="system"?v:"system";var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
  }
}
