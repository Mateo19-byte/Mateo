/*! Mateo Voice v1
 * Say “Mateo” to wake it, ask anything, and it answers out loud.
 * Install: <script src="mateo-voice.js" defer></script>
 * Optional config, set BEFORE the script tag:
 *   <script>window.MATEO_VOICE = { searchInput: "#q", answerEndpoint: "/api/answer" }</script>
 * Needs HTTPS (or localhost) and microphone permission. Best in Chrome, Edge and Safari.
 */
(() => {
  "use strict";

  const CFG = Object.assign({
    name: "Mateo",
    lang: "en-US",               // recognition language, e.g. "en-GB"
    searchInput: "",             // CSS selector of your search box (optional)
    answerEndpoint: "",          // your server: POST {query, persona} -> {answer, url?}
    ttsEndpoint: "",             // your server: POST {text} -> audio bytes (mp3/wav) for the full suit voice
    trigger: "",                 // CSS selector of YOUR mic button; the floating orb is hidden and yours is used
    statusOnly: false,           // true = the small HUD shows only status; your page shows the answers
    pronounce: { mateo: "Mah-tay-oh" },   // how the voice says words; tweak the spelling by ear
    maxSpoken: 420,              // characters spoken aloud; the full answer stays on screen
    pitch: 0.88, rate: 0.96, pause: 200,   // calm, even delivery
    metal: 0,                    // 0 = clean voice; up to 1 adds a robotic edge (only with ttsEndpoint)
    acks: ["Yes?", "I’m listening.", "Go ahead."],
    hideOrb: false,              // true = hide the floating bubble and use only your own trigger buttons
    awakeMs: 9000,               // how long it waits for your question after hearing its name
    intro: "Mateo online. Say my name when you need me.",
    persona: "You are Mateo, a calm, exceptionally capable search assistant: precise, quick, quietly confident, never flustered. Lead with the direct answer in one or two plain sentences, then the key facts. Rely on reliable sources, say so when you are unsure, and never invent facts or sources. Plain text only, no markdown, because your answer is read aloud. Reply in the language of the question."
  }, window.MATEO_VOICE || {});

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const LABEL = {
    off: "Offline. Tap the core to start.",
    sleeping: "Standing by. Say “Mateo”.",
    awake: "Listening…",
    thinking: "Working on it…",
    speaking: "Responding…"
  };

  /* ---------- wake-word matching ---------- */
  const WAKE = CFG.name.toLowerCase();
  const ALIASES = CFG.wakeAliases || [WAKE, "matteo", "mateu", "matheo", "matayo", "mattayo"];
  const lev = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  const isWake = w => ALIASES.includes(w) || (w.length >= 4 && lev(w, WAKE) <= 1);

  function findWake(text) {
    const t = text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < t.length; i++) {
      if (isWake(t[i])) return { rest: t.slice(i + 1).join(" ") };
      if (t[i + 1] && isWake(t[i] + t[i + 1])) return { rest: t.slice(i + 2).join(" ") };   // “ma teo”, “mat eo”
    }
    return null;
  }

  /* ---------- UI (shadow DOM so your site’s CSS can’t clash) ---------- */
  const host = document.createElement("div");
  host.id = "mateo-voice";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host{all:initial}
    .wrap{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));width:60px;height:60px;z-index:2147483000;
      font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e6f4fa;touch-action:none}
    .wrap.snap{transition:left .25s ease,top .25s ease}
    .panel{position:absolute;right:0;bottom:72px;width:min(340px,calc(100vw - 36px));max-height:50vh;overflow:auto;padding:14px 16px;border-radius:16px;
      background:rgba(8,13,22,.9);border:1px solid rgba(110,205,255,.28);box-shadow:0 8px 40px rgba(0,0,0,.35);backdrop-filter:blur(12px)}
    .wrap.left .panel{right:auto;left:0}
    .wrap.flip .panel{bottom:auto;top:72px}
    .panel[hidden]{display:none}
    .status{margin:0;font-size:13px;color:#7fdcff}
    .you{margin:8px 0 0;color:#8fa6b3}
    .ans{margin:8px 0 0;white-space:pre-wrap}
    .ans a{color:#8fd3ff}
    .type{margin-top:10px;display:flex;gap:6px}
    .type input{flex:1;min-width:0;padding:8px 10px;border-radius:8px;border:1px solid #1f3442;background:#0b121b;color:inherit;font:inherit}
    .type input:focus-visible,.orb:focus-visible{outline:2px solid #9b8cff;outline-offset:2px}
    .orb{width:60px;height:60px;border-radius:50%;border:1.5px solid rgba(127,220,255,.85);cursor:pointer;padding:0;touch-action:none;
      background:radial-gradient(circle at 35% 30%,#fff 0 6%,#7fdcff 7% 22%,#0c3550 23% 56%,#080d16 57%);
      box-shadow:0 0 18px rgba(127,220,255,.45),0 4px 14px rgba(0,0,0,.4);animation:breathe 4s ease-in-out infinite}
    [data-state=off] .orb{filter:grayscale(1) brightness(.65);animation:none;box-shadow:0 4px 14px rgba(0,0,0,.4)}
    [data-state=awake] .orb{border-color:#fff;box-shadow:0 0 0 6px rgba(127,220,255,.25),0 0 30px rgba(127,220,255,.8);animation:breathe 1s ease-in-out infinite}
    [data-state=thinking] .orb{border-color:#9b8cff;box-shadow:0 0 24px rgba(155,140,255,.7);animation:breathe 1.2s ease-in-out infinite}
    [data-state=speaking] .orb{border-color:#7fffd4;box-shadow:0 0 26px rgba(127,255,212,.6);animation:ripple 1.3s ease-out infinite}
    @keyframes breathe{50%{transform:scale(1.05)}}
    @keyframes ripple{0%{box-shadow:0 0 0 0 rgba(127,255,212,.5)}100%{box-shadow:0 0 0 18px rgba(127,255,212,0)}}
    .wrap.min .you,.wrap.min .ans,.wrap.min .type{display:none}
    .wrap.min .ans.notice{display:block}
    @media (prefers-reduced-motion:reduce){.orb{animation:none!important}}
  </style>
  <div class="wrap" data-state="off">
    <div class="panel" hidden>
      <p class="status" aria-live="polite"></p>
      <p class="you"></p><p class="ans" aria-live="polite"></p>
      <div class="type"><input type="text" placeholder="Or type a question" aria-label="Type a question"></div>
    </div>
    <button class="orb" type="button" aria-label="Activate Mateo voice assistant"></button>
  </div>`;
  const $ = s => root.querySelector(s);
  const wrap = $(".wrap"), panel = $(".panel"), statusEl = $(".status"), youEl = $(".you"), ansEl = $(".ans");
  const orb = $(".orb"), typed = $(".type input");

  let state = "off", armed = false, rec = null, recOn = false, awakeTimer = 0, stopSpeech = false, voice = null, actx = null, ackBusy = false, acked = false;
  const trigs = CFG.trigger ? [...document.querySelectorAll(CFG.trigger)] : [];

  function setState(s) { state = s; wrap.dataset.state = s; statusEl.textContent = LABEL[s]; trigs.forEach(t => { t.dataset.mateoState = s; }); document.dispatchEvent(new CustomEvent("mateo:state", { detail: { state: s, label: LABEL[s] } })); }
  function showAnswer(q, text, url) {
    ansEl.classList.remove("notice");
    youEl.textContent = q ? "You: " + q : "";
    ansEl.textContent = text;
    if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = " Source"; ansEl.append(a); }
  }
  function notice(msg) { showAnswer("", msg); ansEl.classList.add("notice"); document.dispatchEvent(new CustomEvent("mateo:notice", { detail: msg })); }   // stays visible even in statusOnly mode
  const audio = () => (actx = actx || new (window.AudioContext || window.webkitAudioContext)());

  /* ---------- listening ---------- */
  function startRec() {
    if (!SR || !armed || recOn || state === "speaking" || state === "thinking") return;
    rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = CFG.lang;
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i], t = r[0].transcript.trim();
        if (ackBusy) continue;
        if (state === "sleeping" && !r.isFinal && findWake(t)) wake();      // react the instant the name is heard
        else if (state === "awake" && !r.isFinal) {
          const w = findWake(t), live = w ? w.rest : t;
          youEl.textContent = live ? "You: " + live : "";
          document.dispatchEvent(new CustomEvent("mateo:heard", { detail: live }));
        }
        if (r.isFinal && t) heard(t);
      }
    };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        armed = false; setState("off");
        notice("Microphone access is blocked. Allow it in your browser’s site settings, then tap the mic again.");
      }
    };
    rec.onend = () => { recOn = false; if (armed) setTimeout(startRec, 250); };
    try { rec.start(); recOn = true; } catch (_) { /* already running */ }
  }
  const stopRec = () => { try { rec && rec.abort(); } catch (_) {} recOn = false; };

  function heard(text) {
    if (ackBusy) return;
    const w = findWake(text);
    if (state === "sleeping") {
      if (!w) return;
      if (w.rest) return ask(w.rest);              // “Mateo, what is photosynthesis”
      wake(); ack();
    } else if (state === "awake") {
      const q = (w ? w.rest : text).trim();
      if (!q) { ack(); resetAwake(); return; }     // just the name, then a pause
      ask(q);
    }
  }
  function resetAwake() {
    clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => { if (state === "awake") setState("sleeping"); }, CFG.awakeMs);
  }
  function wake() {
    if (state === "awake") return;
    setState("awake"); acked = false; chime(); resetAwake();
  }
  function ack() {                                 // short spoken “Yes?”, once per wake-up (browser voice, for speed)
    if (acked) return; acked = true;
    if (CFG.ttsEndpoint || !synth || !(CFG.acks || []).length) return;
    const u = new SpeechSynthesisUtterance(CFG.acks[Math.floor(Math.random() * CFG.acks.length)]), v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.pitch = CFG.pitch; u.rate = CFG.rate + .08; ackBusy = true;
    u.onend = u.onerror = () => setTimeout(() => { ackBusy = false; }, 250);
    synth.speak(u);
  }
  const chime = () => {
    try {
      const c = audio(), t = c.currentTime;
      [660, 990].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t + i * .09); g.gain.exponentialRampToValueAtTime(.18, t + i * .09 + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t + i * .09 + .22);
        o.connect(g).connect(c.destination); o.start(t + i * .09); o.stop(t + i * .09 + .25);
      });
    } catch (_) {}
  };

  /* ---------- answering ---------- */
  async function ask(q) {
    q = q.trim();
    if (/^(stop|cancel|never ?mind|go to sleep|that’?s all|that's all)\b/i.test(q)) { stopSpeaking(); return setState(armed ? "sleeping" : "off"); }
    clearTimeout(awakeTimer);
    setState("thinking"); panel.hidden = false; showAnswer(q, "…");
    document.dispatchEvent(new CustomEvent("mateo:query", { detail: { query: q } }));
    const input = CFG.searchInput && document.querySelector(CFG.searchInput);
    if (input) { input.value = q; input.dispatchEvent(new Event("input", { bubbles: true })); }
    let res;
    try { res = await getAnswer(q); }
    catch (_) { res = { text: "I couldn’t reach my sources just now. Please try again in a moment." }; }
    showAnswer(q, res.text, res.url);
    document.dispatchEvent(new CustomEvent("mateo:answer", { detail: { query: q, ...res } }));
    await speak(toSpeech(res.text));
  }

  async function getAnswer(q) {
    const lc = q.toLowerCase();
    if (/\bwhat('?s| is) the time\b|\bwhat time is it\b/.test(lc)) return { text: "It is " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." };
    if (/\b(today’?s|today's|the) date\b|\bwhat day is it\b/.test(lc)) return { text: "Today is " + new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + "." };
    if (CFG.answerEndpoint) try {
      const r = await fetch(CFG.answerEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, persona: CFG.persona }) });
      if (!r.ok) throw new Error("answer endpoint " + r.status);
      const j = await r.json();
      return { text: j.answer || j.text, url: j.url };
    } catch (_) { /* fall back to the built-in Wikipedia lookup */ }
    return wikiAnswer(q);   // factual fallback until you connect your own backend
  }

  async function wikiAnswer(q) {
    const term = q.replace(/^(mateo[, ]*)?(please )?(what('?s| is| are| was)|who('?s| is| was)|tell me about|explain|define|search( for)?|find|how does|how do)\s+/i, "").replace(/[?.!]+$/, "");
    const s = await (await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=" + encodeURIComponent(term))).json();
    const hit = s.query && s.query.search && s.query.search[0];
    if (!hit) return { text: "I found nothing reliable on that. Try rephrasing the question." };
    const p = await (await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(hit.title))).json();
    return { text: p.extract || "I found a page on " + hit.title + " but no summary.", url: p.content_urls && p.content_urls.desktop.page };
  }

  function toSpeech(t) {
    t = String(t).replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\([^)]{0,40}\)/g, "").replace(/[*_#>`~|]/g, "").replace(/\s+/g, " ").trim();
    const parts = t.match(/[^.!?]+[.!?]+/g) || [t];
    let out = "";
    for (const p of parts) { if ((out + p).length > CFG.maxSpoken && out) break; out += p; }
    return out.slice(0, CFG.maxSpoken * 1.5).trim();
  }

  /* ---------- the voice: JARVIS poise, Ultron weight ---------- */
  function pickVoice() {
    if (voice) return voice;
    const best = synth.getVoices().map(v => {
      let s = 0;
      if (/^en/i.test(v.lang)) s += 1; else s -= 10;
      if (/en-GB/i.test(v.lang)) s += 4;
      if (/Daniel|Ryan|Guy|Davis|Christopher|Eric|Arthur|George|Oliver|Thomas|UK English Male|Alex|Fred/i.test(v.name)) s += 5;
      if (/Natural|Online|Neural/i.test(v.name)) s += 2;
      if (/Female|Samantha|Karen|Serena|Zira|Hazel|Susan|Moira|Fiona|Tessa|Victoria/i.test(v.name)) s -= 6;
      return { v, s };
    }).sort((a, b) => b.s - a.s)[0];
    return (voice = best ? best.v : null);
  }
  if (synth) synth.onvoiceschanged = () => { voice = null; };

  function speakBrowser(text) {
    if (!synth) return Promise.resolve();
    const v = pickVoice();
    return (text.match(/[^.!?]+[.!?]*/g) || [text]).reduce((chain, part) => chain.then(() => new Promise(done => {
      if (stopSpeech || !part.trim()) return done();
      const u = new SpeechSynthesisUtterance(part.trim());
      if (v) { u.voice = v; u.lang = v.lang; }
      u.pitch = CFG.pitch; u.rate = CFG.rate;
      u.onend = u.onerror = () => setTimeout(done, CFG.pause);
      synth.speak(u);
    })), Promise.resolve());
  }

  // Browser voices can’t be post-processed. With ttsEndpoint set, the audio from your TTS service
  // runs through this chain: a warm low end plus an optional metallic edge (metal: 0 to 1).
  async function speakSuit(text) {
    const r = await fetch(CFG.ttsEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error("tts " + r.status);
    const c = audio(); if (c.state === "suspended") await c.resume();
    const buf = await c.decodeAudioData(await r.arrayBuffer());
    return new Promise(done => {
      const src = c.createBufferSource(); src.buffer = buf;
      const low = c.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 180; low.gain.value = 4;
      const dry = c.createGain(); dry.gain.value = .85;
      const ring = c.createGain(); ring.gain.value = 0;                      // gain driven by the oscillator = ring modulation
      const osc = c.createOscillator(); osc.frequency.value = 55;
      const depth = c.createGain(); depth.gain.value = .35 * (CFG.metal || 0); osc.connect(depth).connect(ring.gain);
      const echo = c.createDelay(); echo.delayTime.value = .013;
      const fb = c.createGain(); fb.gain.value = .32;
      const wet = c.createGain(); wet.gain.value = .4 * (CFG.metal || 0);
      const comp = c.createDynamicsCompressor();
      src.connect(low); low.connect(dry).connect(comp);
      low.connect(ring).connect(comp);
      low.connect(echo); echo.connect(fb).connect(echo); echo.connect(wet).connect(comp);
      comp.connect(c.destination);
      src.onended = () => { try { osc.stop(); } catch (_) {} done(); };
      osc.start(); src.start();
    });
  }

  const say = t => Object.entries(CFG.pronounce || {}).reduce((acc, [k, v]) => acc.replace(new RegExp("\\b" + k + "\\b", "gi"), v), t);

  async function speak(text) {
    text = say(text);
    stopSpeech = false; stopRec(); setState("speaking");
    try { await (CFG.ttsEndpoint ? speakSuit(text) : speakBrowser(text)); }
    catch (_) { await speakBrowser(text); }
    setState(armed ? "sleeping" : "off");
    if (armed) setTimeout(startRec, 200);
  }
  function stopSpeaking() { stopSpeech = true; if (synth) synth.cancel(); }

  /* ---------- controls ---------- */
  const toggle = () => {
    if (state === "speaking") return stopSpeaking();
    if (armed) { armed = false; remember(false); stopRec(); stopSpeaking(); setState("off"); panel.hidden = true; return; }
    if (!window.isSecureContext) { panel.hidden = false; return notice("Voice needs a secure page. Open this site over https:// or at http://localhost, then tap the mic again."); }
    armed = true; remember(true); panel.hidden = false; audio();                         // click = the user gesture browsers require
    setState("sleeping");
    if (!SR) notice("Wake-word listening isn’t supported in this browser. Use Chrome, Edge or Safari, or type your question instead.");
    else showAnswer("", "Say “Mateo”, then ask your question.");
    speak(CFG.intro);
  };
  orb.addEventListener("click", () => { if (suppress) return; toggle(); });
  trigs.forEach(t => { t.dataset.mateoState = "off"; t.addEventListener("click", toggle); });
  if (CFG.hideOrb) orb.style.display = "none";
  if (CFG.statusOnly) wrap.classList.add("min");
  typed.addEventListener("keydown", e => { if (e.key === "Enter" && typed.value.trim()) { const q = typed.value; typed.value = ""; ask(q); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && armed) startRec(); });

  /* draggable bubble (Bixby-style): drag it anywhere, it snaps to the nearest screen edge */
  const SZ = 60, EDGE = 14;
  let drag = null, dragged = false, suppress = false;
  function placeAt(x, y, snap) {
    x = Math.max(EDGE, Math.min(innerWidth - SZ - EDGE, x)); y = Math.max(EDGE, Math.min(innerHeight - SZ - EDGE, y));
    wrap.classList.toggle("snap", !!snap);
    Object.assign(wrap.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
    wrap.classList.toggle("left", x + SZ / 2 < innerWidth / 2);
    wrap.classList.toggle("flip", y < 300);
  }
  const edgeX = r => (r.left + SZ / 2 < innerWidth / 2 ? EDGE : innerWidth - SZ - EDGE);
  orb.addEventListener("pointerdown", e => {
    const r = wrap.getBoundingClientRect();
    drag = { ox: e.clientX - r.left, oy: e.clientY - r.top, sx: e.clientX, sy: e.clientY }; dragged = false;
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener("pointermove", e => {
    if (!drag) return;
    if (!dragged && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    dragged = true; placeAt(e.clientX - drag.ox, e.clientY - drag.oy, false);
  });
  const endDrag = () => {
    if (!drag) return; drag = null;
    if (!dragged) return;
    suppress = true; setTimeout(() => { suppress = false; }, 80);
    const r = wrap.getBoundingClientRect(); placeAt(edgeX(r), r.top, true);
  };
  orb.addEventListener("pointerup", endDrag); orb.addEventListener("pointercancel", endDrag);
  addEventListener("resize", () => { if (wrap.style.left) { const r = wrap.getBoundingClientRect(); placeAt(edgeX(r), r.top, false); } });

  function remember(on) { try { localStorage.setItem("mateo-on", on ? "1" : "0"); } catch (_) {} }
  async function autoArm() {      // returning visitors: listen again without a tap once the mic is already allowed
    try {
      if (!SR || !window.isSecureContext || localStorage.getItem("mateo-on") !== "1") return;
      const p = await navigator.permissions.query({ name: "microphone" });
      if (p.state !== "granted") return;
      armed = true; panel.hidden = false; setState("sleeping"); startRec();
      const unlock = () => { audio().resume(); removeEventListener("pointerdown", unlock); removeEventListener("keydown", unlock); };
      addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);   // browsers need one tap before sound
    } catch (_) {}
  }

  const mount = () => document.body.appendChild(host);
  document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);
  window.MateoVoice = { ask, answer: getAnswer, speak, stop: stopSpeaking, config: CFG };
  autoArm();
})();
