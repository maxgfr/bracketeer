/**
 * Building the link.
 *
 * There are two controls that share a tournament — the one in the control strip
 * and the one on the Share tab — and for a while they disagreed. Each assembled
 * its own URL, and the convenient one skipped redaction entirely, so the fastest
 * way to share was also the only way that leaked. That is not a bug you fix
 * twice; it is a bug you fix by having one function.
 *
 * So every link in the app comes from here, and the audience is the only input
 * that decides what it carries.
 */

import { logFor, urlSizeVerdict, type Audience, type EventLog, type TournamentConfig, type UrlSizeVerdict } from "@bracketeer/engine";
import { encode } from "./codec.js";

export interface ShareTarget {
  id: string;
  log: EventLog;
  config: TournamentConfig;
  audience: Audience;
  /** Only ever attached to a `run` link. */
  writeKey: string;
  /** Whether this device currently has live sync on. */
  live: boolean;
}

export interface ShareLink {
  /** Empty when the tournament has outgrown a URL. */
  url: string;
  /** The encoded log, for reporting its size. */
  encoded: string;
  verdict: UrlSizeVerdict;
}

const TOO_LONG: ShareLink = { url: "", encoded: "", verdict: "too_long" };

function origin(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export function shareLink(target: ShareTarget): ShareLink {
  const { id, log, config, audience, writeKey, live } = target;

  let encoded: string;
  try {
    encoded = encode(logFor(log, config, audience));
  } catch {
    return TOO_LONG;
  }

  // A watch link carries neither of these. The key is what lets a device push
  // changes, and live sync is only ever between devices that already hold it —
  // so inviting a spectator to a room they cannot be admitted to would just be
  // a button that fails.
  const key = audience === "run" ? `&k=${writeKey}` : "";
  const invitation = audience === "run" && live ? "&live=1" : "";

  return {
    url: `${origin()}#/t/${id}?d=${encoded}${invitation}${key}`,
    encoded,
    verdict: urlSizeVerdict(encoded),
  };
}

/** The embed is a watch copy with no controls, so it never takes an audience. */
export function embedLink(id: string, log: EventLog, config: TournamentConfig): ShareLink {
  let encoded: string;
  try {
    encoded = encode(logFor(log, config, "watch"));
  } catch {
    return TOO_LONG;
  }

  return {
    url: `${origin()}#/embed/${id}?d=${encoded}`,
    encoded,
    verdict: urlSizeVerdict(encoded),
  };
}

export function embedSnippet(url: string, title: string): string {
  return `<iframe src="${url}" width="100%" height="600" style="border:1px solid #ddd" title="${title}"></iframe>`;
}
