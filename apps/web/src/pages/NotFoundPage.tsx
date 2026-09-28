import { Link } from "react-router";

import { en } from "../i18n/en.js";

export function NotFoundPage() {
  return (
    <>
      <h1>{en.notFound.title}</h1>
      <p>{en.notFound.body}</p>
      <p>
        <Link to="/">{en.notFound.home}</Link>
      </p>
    </>
  );
}
