/**
 * The other device.
 *
 * Trystero identifies a peer by a module-level `selfId`, so two sessions inside
 * one process can never see each other — a second process is the only faithful
 * way to test this. The wire details are passed in from the test, which reads
 * them from the app itself, so this cannot drift out of step with what ships.
 *
 * Speaks on stdout in single-line JSON so the parent can follow along.
 */
import { joinRoom } from "trystero/nostr";
import { RTCPeerConnection } from "werift";

const [, , roomId, appId, actionName, password, payloadToSend] = process.argv;

const say = (event, data) => console.log(JSON.stringify({ event, data }));

// An empty password is passed as the literal "-" so an absent one can be told
// apart from an empty argv slot — that distinction is the point of one of the
// tests, which spawns a peer holding no key at all.
const room = joinRoom(
  {
    appId,
    rtcPolyfill: RTCPeerConnection,
    ...(password && password !== "-" ? { password } : {}),
  },
  roomId,
  {
    onJoinError: (details) => say("join-error", String(details?.error ?? "unknown")),
  },
);

const action = room.makeAction(actionName);

action.onMessage = (data) => say("received", data);

room.onPeerJoin = (peerId) => {
  say("peer-join", peerId);
  if (payloadToSend) void action.send(payloadToSend);
};
room.onPeerLeave = (peerId) => say("peer-leave", peerId);

say("ready", roomId);

process.on("SIGTERM", () => {
  room.leave();
  process.exit(0);
});
