/**
 * The grammar of the sheet.
 *
 * Structure here is horizontal rules and rows, never cards. A heavy rule opens a
 * section and carries its label; hairlines separate the rows beneath it. That is
 * how a printed results sheet is organised, and it survives being printed,
 * embedded in an iframe, and read at arm's length in daylight.
 */

import type { ReactNode } from "react";

export function Section({
  label,
  meta,
  children,
  className = "",
}: {
  label: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`print-break-inside-avoid ${className}`}>
      <header className="border-rule-strong flex items-baseline justify-between gap-4 border-b-2 pb-1.5">
        <h2 className="sheet-label text-ink">{label}</h2>
        {meta ? <div className="text-ink-2 tnum text-xs">{meta}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A row on the sheet. Tall enough to be a comfortable target on a phone. */
export function Row({
  children,
  live = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  live?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = `border-rule flex min-h-12 w-full items-center gap-3 border-b py-2 text-left ${
    live ? "text-ink" : ""
  } ${className}`;

  if (!onClick) return <div className={base}>{children}</div>;

  return (
    <button type="button" onClick={onClick} className={`${base} hover:bg-paper-sunk transition-colors`}>
      {children}
    </button>
  );
}

/**
 * The signal marker. A fixture that needs attention is flagged by a filled
 * square in the margin — the mark a scorer makes on a paper sheet — rather than
 * by tinting the row, which would fight the figures for attention.
 */
export function Marker({ state }: { state: "live" | "done" | "waiting" }) {
  if (state === "live") {
    return (
      <span
        aria-hidden
        className="bg-signal mt-0.5 inline-block size-2 shrink-0 self-start rounded-[1px]"
      />
    );
  }
  if (state === "done") {
    return <span aria-hidden className="bg-ink-3 mt-0.5 inline-block size-2 shrink-0 self-start rounded-[1px] opacity-40" />;
  }
  return (
    <span
      aria-hidden
      className="border-rule-strong mt-0.5 inline-block size-2 shrink-0 self-start rounded-[1px] border opacity-30"
    />
  );
}

/** Small tracked caps, for column heads and inline labels. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`sheet-label text-ink-3 ${className}`}>{children}</span>;
}

/** A figure. Always monospaced and tabular, so columns of scores line up. */
export function Figure({
  children,
  className = "",
  emphasis = false,
}: {
  children: ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <span
      className={`tnum font-mono ${emphasis ? "text-ink font-semibold" : "text-ink-2"} ${className}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "default",
  disabled = false,
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "default" | "primary" | "quiet" | "danger";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    default:
      "border-rule-strong text-ink hover:bg-ink hover:text-paper border bg-transparent",
    primary: "bg-ink text-paper hover:bg-signal border border-transparent",
    quiet: "text-ink-2 hover:text-ink border border-transparent",
    danger: "border-signal text-signal-ink hover:bg-signal hover:text-paper border bg-transparent",
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`sheet-label inline-flex min-h-9 items-center justify-center gap-1.5 px-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="sheet-label text-ink-2 mb-1.5 block">{label}</span>
      {children}
      {hint ? <span className="text-ink-3 mt-1 block text-xs leading-snug">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "border-rule bg-field text-ink placeholder:text-ink-3 min-h-10 w-full border px-2.5 py-1.5 text-sm";

export const selectClass = `${inputClass} appearance-none pr-8 bg-[length:10px] bg-[right_0.6rem_center] bg-no-repeat`;

/** What to show where there is nothing yet: say what is missing and what to do. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-rule border-b py-10 text-center">
      <p className="text-ink font-medium">{title}</p>
      {children ? <div className="text-ink-2 mx-auto mt-1.5 max-w-prose text-sm">{children}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: ReactNode;
}) {
  return (
    <p
      className={`px-3 py-2 text-sm leading-snug ${
        tone === "warn" ? "bg-signal-wash text-signal-ink" : "bg-paper-sunk text-ink-2"
      }`}
    >
      {children}
    </p>
  );
}
