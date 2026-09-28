import { NavLink, Route, Routes } from "react-router";

import { en } from "./i18n/en.js";
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
        {en.app.skipToContent}
      </a>
      <header className="site-header">
        <div className="inner">
          <NavLink to="/" className="brand">
            {en.app.title}
          </NavLink>
          <nav className="site-nav" aria-label={en.app.mainNav}>
            <NavLink to="/" end>
              {en.app.nav.create}
            </NavLink>
            <NavLink to="/codes">{en.app.nav.codes}</NavLink>
            <NavLink to="/stats">{en.app.nav.stats}</NavLink>
            <NavLink to="/privacy">{en.app.nav.privacy}</NavLink>
          </nav>
        </div>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<CreatePage />} />
          <Route path="/codes" element={<CodesPage />} />
          <Route path="/stats" element={<StatsEntryPage />} />
          <Route path="/stats/:slug/:key" element={<StatsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        {en.app.tagline} ·{" "}
        <a href="https://github.com/titouanlegourrierec/qr-tracker">{en.app.sourceCode}</a>
      </footer>
    </>
  );
}
