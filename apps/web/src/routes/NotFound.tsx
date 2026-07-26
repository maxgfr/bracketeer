import { Link } from "react-router";
import { Masthead } from "../components/Masthead.js";

export function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-5">
      <Masthead />
      <div className="py-20">
        <h1 className="text-ink text-2xl font-semibold tracking-[-0.02em]">
          There is nothing at this address
        </h1>
        <p className="text-ink-2 mt-2 max-w-[60ch] text-sm leading-relaxed">
          If you followed a shared link, it may have been cut short — links carry the whole
          tournament, so they are long. Ask whoever sent it to share it again.
        </p>
        <Link
          to="/"
          className="text-signal-ink sheet-label mt-6 inline-block underline underline-offset-4"
        >
          Back to the start
        </Link>
      </div>
    </div>
  );
}
