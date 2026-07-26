import { VERSION } from "@bracketeer/engine";

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Bracketeer</h1>
      <p className="text-ink-muted text-balance">
        Tournament brackets, Swiss pairings, leagues and Elo ratings — running entirely
        in your browser, with nothing to sign up for.
      </p>
      <p className="text-ink-muted text-sm">Engine v{VERSION} · scaffold</p>
    </main>
  );
}
