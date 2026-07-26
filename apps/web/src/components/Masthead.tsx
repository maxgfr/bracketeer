/**
 * The masthead of the sheet: the title, and the controls that belong to the
 * reader rather than to the tournament.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { loadTheme, saveTheme, type ThemeChoice } from "../lib/storage.js";
import { Label } from "./Sheet.js";

export function Masthead({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-rule-strong flex items-center justify-between gap-4 border-b-2 py-3">
      <Link to="/" className="group flex items-baseline gap-2">
        <span className="text-ink text-lg font-semibold tracking-[-0.03em]">Bracketeer</span>
        <span aria-hidden className="bg-signal inline-block size-1.5 rounded-[1px]" />
      </Link>
      <div className="no-print flex items-center gap-1">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}

const ORDER: ThemeChoice[] = ["system", "light", "dark"];
const NAMES: Record<ThemeChoice, string> = { system: "Auto", light: "Light", dark: "Dark" };

function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => setChoice(loadTheme()), []);

  const next = () => {
    const value = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? "system";
    setChoice(value);
    saveTheme(value);
  };

  return (
    <button
      type="button"
      onClick={next}
      title={`Appearance: ${NAMES[choice]}. Tap to change.`}
      className="text-ink-2 hover:text-ink min-h-9 px-2 transition-colors"
    >
      <Label>{NAMES[choice]}</Label>
    </button>
  );
}
