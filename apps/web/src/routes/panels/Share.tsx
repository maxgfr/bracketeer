/**
 * Sharing.
 *
 * Three ways out, presented in order of how durable they are rather than how
 * impressive they sound. The link carries the whole tournament and works
 * forever; the file is the backup; live sync is the convenience, and its
 * limitations are stated on the page rather than buried in a README.
 */

import { toJsonFile, urlSizeVerdict } from "@bracketeer/engine";
import { useMemo, useState } from "react";
import { Button, Field, inputClass, Notice, Section } from "../../components/Sheet.js";
import { encode } from "../../lib/codec.js";
import type { PeerState } from "../../sync/PeerBar.js";
import { slug } from "./Calendar.js";
import type { Store } from "../Tournament.js";

export function SharePanel({ store, peers }: { store: Store; peers: PeerState }) {
  const { state, log, id } = store;
  const [copied, setCopied] = useState<string | null>(null);

  const encoded = useMemo(() => {
    try {
      return encode(log);
    } catch {
      return null;
    }
  }, [log]);

  const origin = `${window.location.origin}${window.location.pathname}`;
  // When sync is on, the link says so. Otherwise the person receiving it has no
  // way of knowing they are supposed to join anything.
  const liveFlag = peers.status === "live" ? "&live=1" : "";
  const shareUrl = encoded ? `${origin}#/t/${id}?d=${encoded}${liveFlag}` : "";
  const embedUrl = encoded ? `${origin}#/embed/${id}?d=${encoded}` : "";
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

  const download = () => {
    const blob = new Blob([toJsonFile(log, new Date().toISOString())], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(state.name)}.bracketeer.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      <Section label="A link" meta={encoded ? `${(encoded.length / 1024).toFixed(1)} kB` : undefined}>
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          The whole tournament travels inside this link — there is no server holding a copy, so
          whoever opens it gets the results exactly as they stand now. Send a fresh link when you
          want people to see later rounds.
        </p>

        {verdict === "too_long" ? (
          <Notice tone="warn">
            This tournament has grown too large to put in a link. Use the file below, or turn on
            live sync.
          </Notice>
        ) : (
          <>
            <Field label="Share this">
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
              <Button onClick={() => window.print()}>Print the sheet</Button>
            </div>
            {verdict === "long" ? (
              <div className="mt-4">
                <Notice tone="warn">
                  This link is long. It will work when pasted into a browser, but some chat apps
                  cut long links in half — send the file instead if it has to survive a group chat.
                </Notice>
              </div>
            ) : null}
          </>
        )}
      </Section>

      <Section label="A file" meta="The durable copy">
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          Every event, in readable JSON. This is the backup to keep: it survives a cleared browser,
          a lost phone and a new version of this app, and it can be opened from the front page.
        </p>
        <Button onClick={download}>Download the tournament</Button>
      </Section>

      <Section label="Live sync" meta={peers.status === "live" ? "On" : "Off"}>
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          Several phones can update the same tournament at once. Turn it on here, then share the
          link again — it will carry the invitation, and whoever opens it is offered a single tap to
          join. Scores entered on one device appear on the others within seconds, and a device that
          drops out catches up when it returns.
        </p>

        <Notice>
          There is no server behind this. Devices find each other through public relays we do not
          control, and it only works while at least one participant has the page open. Some
          networks block it entirely. The link and the file above are the copies that last.
        </Notice>

        <div className="flex flex-wrap items-center gap-3 py-5">
          {peers.status === "off" || peers.status === "unavailable" ? (
            <Button variant="primary" onClick={peers.start}>
              Turn on live sync
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
                ? "Connected. Copy the link above and send it — the other device has to join too."
                : `Connected to ${peers.count} other device${peers.count === 1 ? "" : "s"}.`}
            </span>
          ) : null}
        </div>

        {peers.error ? <Notice tone="warn">{peers.error}</Notice> : null}
      </Section>

      <Section label="Embed" meta="Read-only">
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          Put the results on a club website. The embedded view has no controls and no navigation —
          just the fixtures and the table.
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
