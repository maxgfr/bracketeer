/**
 * Commit messages decide the version number, so they are checked.
 *
 * `fix:` cuts a patch, `feat:` a minor, and a `BREAKING CHANGE:` footer (or a
 * `!` after the type) a major. Anything else — `chore`, `docs`, `refactor`,
 * `test` — releases nothing, which is the right answer for a change nobody
 * installing the package would notice.
 *
 * The subject-case rule is off because this repo writes commit subjects as
 * sentences, and forcing them lower-case would make the changelog read worse
 * than the history it comes from.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "subject-case": [0],
    "body-max-line-length": [1, "always", 100],
  },
};
