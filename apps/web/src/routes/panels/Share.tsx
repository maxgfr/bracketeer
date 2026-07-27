/**
 * Sharing.
 *
 * One idea, not two. You always share a *link*; live is an option on that link,
 * and who the link is for decides what it carries. A "Go live" button beside a
 * separate "Share" button asked the organiser to work out the relationship
 * between them, and the answer — you cannot go live *instead* of sharing — was
 * not obvious from either.
 *
 * So the question this page asks first is: who is this for?
 *
 *   · Somebody watching gets the results with private fields stripped out and
 *     no key, so they cannot push changes to anybody.
 *   · Somebody helping run it gets everything, and can enter scores.
 */

import { toJsonFile, urlSizeVerdict } from "@bracketeer/engine";
import { useMemo, useState } from "react";
import { Button, Field, inputClass, Notice, Section } from "../../components/Sheet.js";
import { encode } from "../../lib/codec.js";
import {
  entrantsWithPrivateData,
  hasPrivateValues,
  privateFieldKeys,
  redactPrivate,
} from "../../lib/privacy.js";
import type { PeerState } from "../../sync/PeerBar.js";
import { slug } from "./Calendar.js";
import type { Store } from "../Tournament.js";

type Audience = "watch" | "run";

export function SharePanel({ store, peers }: { store: Store; peers: PeerState }) {
  const { state, log, id } = store;
  const [audience, setAudience] = useState<Audience>("watch");
  const [copied, setCopied] = useState<string | null>(null);

  const secret = useMemo(() => privateFieldKeys(state.config), [state.config]);
  const redacted = useMemo(() => redactPrivate(log, secret), [log, secret]);
  const holdsPrivate = useMemo(() => hasPrivateValues(log, secret), [log, secret]);
  const affected = useMemo(() => entrantsWithPrivateData(log, secret), [log, secret]);

  const encoded = useMemo(() => {
    try {
      return encode(audience === "watch" ? redacted : log);
    } catch {
      return null;
    }
  }, [audience, log, redacted]);

  const origin = `${window.location.origin}${window.location.pathname}`;
  const live = peers.status === "live" ? "&live=1" : "";
  // The key is what a device needs to push changes. A watch link has none.
  const key = audience === "run" ? `&k=${store.writeKey}` : "";
  const shareUrl = encoded ? `${origin}#/t/${id}?d=${encoded}${live}${key}` : "";
  const embedUrl = encoded ? `${origin}#/embed/${id}?d=${encode(redacted)}` : "";
  const verdict = encoded ? urlSizeVerdict(encoded) : "too_long";

  const copy = async (value: string, which: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  };

  const download = (whole: boolean) => {
    const blob = new Blob([toJsonFile(whole ? log : redacted, new Date().toISOString())], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(state.name)}${whole ? "" : ".public"}.bracketeer.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      <Section
        label="Who is this for?"
        meta={encoded ? `${(encoded.length / 1024).toFixed(1)} kB` : undefined}
      >
        <div role="radiogroup" aria-label="Who is this for?" className="pt-3">
          <AudienceChoice
            value="watch"
            current={audience}
            onChange={setAudience}
            title="Someone watching"
            detail={
              secret.length > 0
                ? `Results, tables and the calendar. ${secret.join(" and ")} ${
                    secret.length === 1 ? "is" : "are"
                  } removed, and they cannot enter scores.`
                : "Results, tables and the calendar. They cannot enter scores."
            }
          />
          <AudienceChoice
            value="run"
            current={audience}
            onChange={setAudience}
            title="Someone helping run it"
            detail="Everything, including private fields, and they can enter scores from their own phone."
          />
        </div>

        {verdict === "too_long" ? (
          <div className="pt-4">
            <Notice tone="warn">
              This tournament has grown too large to put in a link. Send the file below instead.
            </Notice>
          </div>
        ) : (
          <div className="pt-5">
            <Field label={audience === "watch" ? "Watch link" : "Organiser link"}>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => void copy(shareUrl, "link")}>
                {copied === "link" ? "Copied" : "Copy link"}
              </Button>
              <Button onClick={() => download(audience === "run")}>Download as a file</Button>
              <Button onClick={() => window.print()}>Print the sheet</Button>
            </div>

            {audience === "run" ? (
              <div className="mt-4">
                <Notice tone="warn">
                  This one lets whoever opens it enter scores. Send it to the people helping you,
                  not to the room.
                </Notice>
              </div>
            ) : null}

            {audience === "watch" && holdsPrivate ? (
              <div className="mt-4">
                <Notice>
                  {affected.length} entrant{affected.length === 1 ? "'s" : "s'"} private{" "}
                  {secret.join(" and ")} {secret.length === 1 ? "is" : "are"} not in this link at
                  all — not hidden inside it. Whoever opens it has no way to read what was never
                  sent.
                </Notice>
              </div>
            ) : null}

            {verdict === "long" ? (
              <div className="mt-4">
                <Notice tone="warn">
                  This link is long. It works pasted into a browser, but some chat apps cut long
                  links in half — send the file if it has to survive a group chat.
                </Notice>
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Section label="Live" meta={peers.status === "live" ? "On" : "Off"}>
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          With this on, every device holding an organiser link updates the same tournament at once,
          and a score entered on one appears on the others within seconds. A device that drops out
          catches up when it returns. A watch link can read what arrives but cannot push anything
          back.
        </p>

        <Notice>
          There is no server behind this. Devices find each other through public relays we do not
          control, and it only works while at least one of you has the page open. Some networks
          block it entirely. The link and the file above are the copies that last.
        </Notice>

        <div className="flex flex-wrap items-center gap-3 py-5">
          {peers.status === "off" || peers.status === "unavailable" ? (
            <Button variant="primary" onClick={peers.start}>
              Turn on live
            </Button>
          ) : (
            <Button onClick={peers.stop}>Turn off</Button>
          )}
          {peers.status === "connecting" ? (
            <span className="text-ink-2 text-sm">Looking for other devices…</span>
          ) : null}
          {peers.status === "live" ? (
            <span className="text-ink-2 text-sm">
              {peers.count === 0
                ? "On. Send an organiser link from above — nobody else is here yet."
                : `Connected to ${peers.count} other device${peers.count === 1 ? "" : "s"}.`}
            </span>
          ) : null}
        </div>

        {peers.error ? <Notice tone="warn">{peers.error}</Notice> : null}
      </Section>

      <Section label="Embed" meta="Read-only">
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          Put the results on a club website. The embedded view has no controls and no navigation,
          and carries the same redaction as the watch link.
        </p>
        {verdict !== "too_long" ? (
          <>
            <Field label="Paste into your page">
              <textarea
                readOnly
                rows={3}
                value={`<iframe src="${embedUrl}" width="100%" height="600" style="border:1px solid #ddd" title="${state.name}"></iframe>`}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
            </Field>
            <div className="mt-3">
              <Button
                onClick={() =>
                  void copy(
                    `<iframe src="${embedUrl}" width="100%" height="600" style="border:1px solid #ddd" title="${state.name}"></iframe>`,
                    "embed",
                  )
                }
              >
                {copied === "embed" ? "Copied" : "Copy embed code"}
              </Button>
            </div>
          </>
        ) : (
          <Notice tone="warn">This tournament is too large to embed by link.</Notice>
        )}
      </Section>
    </div>
  );
}

function AudienceChoice({
  value,
  current,
  onChange,
  title,
  detail,
}: {
  value: Audience;
  current: Audience;
  onChange: (value: Audience) => void;
  title: string;
  detail: string;
}) {
  const selected = value === current;

  return (
    <label
      className={`border-rule flex cursor-pointer items-start gap-3 border-b py-3 transition-colors ${
        selected ? "bg-paper-sunk" : "hover:bg-paper-sunk"
      } has-focus-visible:outline-focus has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}
    >
      <input
        type="radio"
        name="audience"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-[1px] ${
          selected ? "bg-signal" : "border-rule-strong border opacity-40"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block text-sm ${selected ? "text-ink font-semibold" : "text-ink font-medium"}`}
        >
          {title}
        </span>
        <span className="text-ink-2 mt-0.5 block max-w-[64ch] text-sm leading-snug">{detail}</span>
      </span>
    </label>
  );
}
