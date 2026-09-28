import { NavLink, Route, Routes } from "react-router";

import { fr } from "./i18n/fr.js";
import { CodesPage } from "./pages/CodesPage.js";
import { CreatePage } from "./pages/CreatePage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { PrivacyPage } from "./pages/PrivacyPage.js";
import { StatsEntryPage } from "./pages/StatsEntryPage.js";
import { StatsPage } from "./pages/StatsPage.js";

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <header className="site-header">
        <div className="inner">
          <NavLink to="/" className="brand">
            {fr.app.title}
          </NavLink>
          <nav className="site-nav" aria-label="Navigation principale">
            <NavLink to="/" end>
              {fr.app.nav.create}
            </NavLink>
            <NavLink to="/codes">{fr.app.nav.codes}</NavLink>
            <NavLink to="/stats">{fr.app.nav.stats}</NavLink>
            <NavLink to="/confidentialite">{fr.app.nav.privacy}</NavLink>
          </nav>
        </div>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<CreatePage />} />
          <Route path="/codes" element={<CodesPage />} />
          <Route path="/stats" element={<StatsEntryPage />} />
          <Route path="/stats/:slug/:key" element={<StatsPage />} />
          <Route path="/confidentialite" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        {fr.app.tagline} ·{" "}
        <a href="https://github.com/titouanlegourrierec/qr-tracker">Code source</a>
      </footer>
    </>
  );
}
