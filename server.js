// Mateo server: serves the site and answers questions with Claude (plus live web search).
// Run (Node 18+):   ANTHROPIC_API_KEY=your_key node server.js     then open http://localhost:3000
// Windows (PowerShell):  $env:ANTHROPIC_API_KEY="your_key"; node server.js
const http = require("http"), fs = require("fs"), path = require("path");

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-5-5";   // fast and sharp; try claude-opus-5-5 for maximum depth
const PORT = process.env.PORT || 3000;
const PERSONA = "You are Mateo, a calm, exceptionally capable search assistant: precise, quick, quietly confident, never flustered. " +
  "Lead with the direct answer in one or two plain sentences, then the key facts. Search the web when the question needs current or checkable facts, " +
  "rely on reliable sources, say so when you are unsure, and never invent facts or sources. " +
  "Plain text only, no markdown, because your answer is read aloud. Reply in the language of the question.";

const FILES = { "/": "index.html", "/index.html": "index.html", "/mateo.html": "mateo.html", "/mateo-voice.js": "mateo-voice.js" };   // public pages and voice script
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const hits = new Map();   // simple rate limit so a public endpoint can’t drain your API credit
const limited = ip => {
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 60000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > 15;
};

async function answer(query) {
  const call = withSearch => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 700, system: PERSONA,
      messages: [{ role: "user", content: query }],
      ...(withSearch && { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] })
    })
  });
  let r = await call(true);
  if (r.status === 400) r = await call(false);          // web search not enabled for this key: answer without it
  if (!r.ok) throw new Error("Claude API " + r.status);
  const j = await r.json();
  let text = "", url = "";
  for (const b of j.content) {
    if (b.type !== "text") continue;
    text += b.text;
    url = url || (b.citations && b.citations[0] && b.citations[0].url) || "";
  }
  return { answer: text.trim(), url };
}

const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (req.method === "POST" && u.pathname === "/api/answer") {
    if (!KEY) return send(res, 500, { error: "ANTHROPIC_API_KEY is not set" });
    if (limited(req.socket.remoteAddress)) return send(res, 429, { error: "slow down" });
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 4000) return send(res, 413, { error: "too long" }); }
    try {
      const { query } = JSON.parse(body);
      if (typeof query !== "string" || !query.trim() || query.length > 500) return send(res, 400, { error: "bad query" });
      return send(res, 200, await answer(query.trim()));
    } catch (e) { console.error(e.message); return send(res, 502, { error: "upstream error" }); }
  }
  const file = FILES[u.pathname];
  if (!file) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] });
  fs.createReadStream(path.join(__dirname, file)).pipe(res);
}).listen(PORT, () => console.log("Mateo is up at http://localhost:" + PORT + (KEY ? "" : "  (no ANTHROPIC_API_KEY set, so answers will use the Wikipedia fallback)")));
