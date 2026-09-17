import assert from "node:assert/strict";
import { test } from "node:test";
import { ThemePreference } from "../lib/ui/theme-preference.ts";

test("ThemePreference parses stored values and rejects anything else", () => {
  assert.equal(ThemePreference.parse("light"), "light");
  assert.equal(ThemePreference.parse("dark"), "dark");
  assert.equal(ThemePreference.parse("system"), "system");
  assert.equal(ThemePreference.parse(null), "system");
  assert.equal(ThemePreference.parse("solarized"), "system");
  assert.equal(ThemePreference.parse(""), "system");
});

test("ThemePreference resolves system from prefers-color-scheme", () => {
  assert.equal(ThemePreference.resolved("light", true), "light");
  assert.equal(ThemePreference.resolved("dark", false), "dark");
  assert.equal(ThemePreference.resolved("system", true), "dark");
  assert.equal(ThemePreference.resolved("system", false), "light");
});

test("ThemePreference cycles system → light → dark → system", () => {
  assert.equal(ThemePreference.cycle("system"), "light");
  assert.equal(ThemePreference.cycle("light"), "dark");
  assert.equal(ThemePreference.cycle("dark"), "system");
});

test("ThemePreference.apply toggles the dark class and color-scheme", () => {
  const root = {
    classList: {
      dark: false,
      toggle(token: string, force?: boolean) {
        if (token !== "dark") return;
        this.dark = force ?? !this.dark;
      },
    },
    style: { colorScheme: "" },
  };
  ThemePreference.apply("dark", root);
  assert.equal(root.classList.dark, true);
  assert.equal(root.style.colorScheme, "dark");
  ThemePreference.apply("light", root);
  assert.equal(root.classList.dark, false);
  assert.equal(root.style.colorScheme, "light");
});

test("blocking script stays keyed to ThemePreference.STORAGE_KEY", () => {
  const script = ThemePreference.blockingScript();
  assert.match(script, new RegExp(ThemePreference.STORAGE_KEY));
  assert.match(script, /prefers-color-scheme: dark/);
  assert.match(script, /classList\.toggle\("dark"/);
});
