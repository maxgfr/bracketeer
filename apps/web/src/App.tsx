import { HashRouter, Route, Routes } from "react-router";
import { useEffect } from "react";
import { applyTheme, loadTheme } from "./lib/storage.js";
import { EmbedRoute } from "./routes/Embed.js";
import { Home } from "./routes/Home.js";
import { NewTournament } from "./routes/New.js";
import { NotFound } from "./routes/NotFound.js";
import { TournamentRoute } from "./routes/Tournament.js";

/**
 * Routing rides in the hash for two reasons: GitHub Pages has no SPA rewrite, and
 * the tournament's own data already travels in the hash's query string, so a
 * shared link is `#/t/:id?d=<log>` and needs no server to resolve it.
 */
export function App() {
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewTournament />} />
        <Route path="/t/:id/*" element={<TournamentRoute />} />
        <Route path="/embed/:id" element={<EmbedRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}
