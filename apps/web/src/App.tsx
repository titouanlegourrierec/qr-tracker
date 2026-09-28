import { Link, NavLink, Route, Routes } from "react-router";

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
      {/* Fragment navigation would be swallowed by HashRouter (it would route
          to /main), so the skip link moves focus programmatically instead. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById("main");
          if (main !== null) {
            main.focus();
            main.scrollIntoView();
          }
        }}
      >
        {en.app.skipToContent}
      </a>
      <header className="site-header">
        <div className="inner">
          <NavLink to="/" className="brand">
            <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
              <rect width="24" height="24" rx="6" fill="var(--accent)" />
              <path
                fill="var(--accent-contrast)"
                d="M5 5h6v6H5zM7 7v2h2V7zM13 5h6v6h-6zM15 7v2h2V7zM5 13h6v6H5zM7 15v2h2v-2zM13 13h2v2h-2zM17 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM17 17h2v2h-2z"
              />
            </svg>
            {en.app.title}
          </NavLink>
          <nav className="site-nav" aria-label={en.app.mainNav}>
            <NavLink to="/" end>
              {en.app.nav.create}
            </NavLink>
            <NavLink to="/codes">{en.app.nav.codes}</NavLink>
            <NavLink to="/stats">{en.app.nav.stats}</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
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
        <p className="footer-tagline">{en.app.tagline}</p>
        <p>
          {en.app.copyright(new Date().getFullYear())} ·{" "}
          <Link to="/privacy">{en.app.nav.privacy}</Link> ·{" "}
          <a href="https://github.com/titouanlegourrierec/qr-tracker">{en.app.sourceCode}</a>
        </p>
      </footer>
    </>
  );
}
