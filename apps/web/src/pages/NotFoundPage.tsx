import { Link } from "react-router";

import { fr } from "../i18n/fr.js";

export function NotFoundPage() {
  return (
    <>
      <h1>{fr.notFound.title}</h1>
      <p>{fr.notFound.body}</p>
      <p>
        <Link to="/">{fr.notFound.home}</Link>
      </p>
    </>
  );
}
