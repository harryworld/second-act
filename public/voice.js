import { api } from "./ui.js";

let call = null;
export const currentVoice = () => call;
export const voiceEvents = new EventTarget();
function notify() {
  voiceEvents.dispatchEvent(new Event("change"));
}
function status(s, text) {
  s.status = text;
  notify();
}
function nextBatch(s) {
  // Keep even the pagehide request under the browser's keepalive budget.
  let bytes = 0;
  const batch = [];
  for (const fragment of s.queue.slice(0, 32)) {
    const size = new TextEncoder().encode(JSON.stringify(fragment)).length;
    if (batch.length && bytes + size > 58000) break;
    batch.push(fragment);
    bytes += size;
  }
  return batch;
}
function flush(s) {
  if (s.writing) return s.writing;
  const write = async () => {
    while (s.queue.length) {
      const fragments = nextBatch(s);
      await api("voice/captions", { runId: s.id, fragments });
      s.queue.splice(0, fragments.length);
    }
  };
  s.writing = write().finally(() => {
    s.writing = null;
  });
  return s.writing;
}
function scheduleSave(s, delay = 450) {
  if (s.timer || s.closed) return;
  s.timer = setTimeout(async () => {
    s.timer = 0;
    try {
      await flush(s);
    } catch {
      if (!s.closed) {
        status(s, "Reconnecting to save captions…");
        scheduleSave(s, 2000);
      }
    }
  }, delay);
}
export function voiceTurns(s) {
  const turns = [];
  for (const f of [...s.fragments].sort((a, b) => a.start - b.start)) {
    if (turns.at(-1)?.role !== f.role)
      turns.push({
        id: s.id + ":" + f.id,
        role: f.role,
        text: "",
        voiceRun: s.id,
      });
    turns.at(-1).text += f.delta;
  }
  return turns;
}
async function commit(s) {
  if (s.finishing) return s.finishing;
  s.finishing = (async () => {
    try {
      await flush(s);
      if (call === s) call = null;
      voiceEvents.dispatchEvent(new CustomEvent("finished", { detail: s }));
    } catch {
      s.unsaved = true;
      status(s, "Captions could not be saved. Retry to continue.");
      throw Error(s.status);
    }
  })().finally(() => {
    s.finishing = null;
  });
  return s.finishing;
}
function finish(s, message) {
  if (s.closed) return;
  s.closed = true;
  s.result = message;
  clearTimeout(s.deadline);
  clearTimeout(s.timer);
  s.abort.abort();
  s.stream?.getTracks().forEach((t) => t.stop());
  s.channel?.close();
  s.pc?.close();
  s.audio?.pause();
  if (s.audio) s.audio.srcObject = null;
  s.resolveClosed();
  status(s, "Saving conversation…");
  commit(s).catch(() => {});
}
export async function endVoice() {
  const s = call;
  if (!s) return;
  if (!s.closed && !s.ending) {
    s.ending = true;
    s.stream?.getTracks().forEach((t) => t.stop());
    if (s.ready && s.channel?.readyState === "open") {
      status(s, "Finishing voice…");
      clearTimeout(s.deadline);
      s.deadline = setTimeout(() => finish(s, "Voice ended."), 4500);
      try {
        s.channel.send(JSON.stringify({ type: "session.close" }));
      } catch {
        finish(s, "Voice ended.");
      }
    } else finish(s, "Voice ended.");
  }
  await s.closedPromise;
  if (call === s) await commit(s);
}
export function flushOnExit() {
  const s = call;
  if (!s) return;
  if (s.id && s.queue.length)
    fetch("/api/voice/captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: s.id, fragments: nextBatch(s) }),
      keepalive: true,
    }).catch(() => {});
  endVoice().catch(() => {});
}
export async function playVoice() {
  if (call?.audio) {
    await call.audio.play();
    call.playBlocked = false;
    notify();
  }
}
export async function openVoice(venture = "") {
  if (call) return;
  const s = {
    venture,
    id: null,
    abort: new AbortController(),
    queue: [],
    fragments: [],
    seen: new Set(),
    ready: false,
    closed: false,
    ending: false,
    status: "Requesting microphone…",
  };
  s.closedPromise = new Promise((resolve) => (s.resolveClosed = resolve));
  call = s;
  notify();
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
      throw Error("Voice requires a microphone on localhost or HTTPS.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (s.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    s.stream = stream;
    status(s, "Connecting voice…");
    const pc = (s.pc = new RTCPeerConnection());
    s.audio = new Audio();
    s.audio.autoplay = true;
    pc.ontrack = (e) => {
      s.audio.srcObject = e.streams[0];
      s.audio.play().catch(() => {
        s.playBlocked = true;
        notify();
      });
    };
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
    const c = (s.channel = pc.createDataChannel("oai-events"));
    c.onmessage = ({ data }) => {
      if (s.closed) return;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      if (event.type === "session.started") {
        s.ready = true;
        clearTimeout(s.deadline);
        status(s, "Listening");
        return;
      }
      if (event.type === "session.closed") {
        finish(s, "Voice ended.");
        return;
      }
      if (event.type === "error") {
        finish(s, "The voice service disconnected. You can continue here.");
        return;
      }
      const role =
        event.type === "session.input_transcript.delta"
          ? "user"
          : event.type === "session.output_transcript.delta"
            ? "assistant"
            : null;
      if (!role || typeof event.delta !== "string" || !event.delta) return;
      const id = event.event_id || crypto.randomUUID();
      if (s.seen.has(id)) return;
      s.seen.add(id);
      const start =
        event.start_ms ?? Math.round(performance.now() - s.startedAt);
      const f = {
        id,
        role,
        delta: event.delta,
        start,
        end: event.end_ms ?? start,
      };
      s.fragments.push(f);
      s.queue.push(f);
      scheduleSave(s);
      notify();
    };
    c.onclose = () => finish(s, "Voice disconnected. You can continue here.");
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed")
        finish(s, "Voice connection lost. You can continue here.");
    };
    await pc.setLocalDescription(await pc.createOffer());
    if (pc.iceGatheringState !== "complete")
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pc.removeEventListener("icegatheringstatechange", check);
          reject(Error("Voice connection timed out. Try again."));
        }, 11000);
        function check() {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        }
        pc.addEventListener("icegatheringstatechange", check);
        check();
      });
    if (s.closed) return;
    const answer = await api(
      "voice",
      { venture, sdp: pc.localDescription.sdp },
      s.abort.signal,
    );
    if (s.closed) return;
    s.id = answer.runId;
    s.startedAt = performance.now();
    s.deadline = setTimeout(
      () => finish(s, "Voice did not connect. You can try again."),
      25000,
    );
    await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
  } catch (e) {
    if (!s.closed)
      finish(
        s,
        e.name === "NotAllowedError"
          ? "Microphone access was declined. You can type here."
          : e.message,
      );
  }
}
