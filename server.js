// Catchad – server utan beroenden. Realtid via Server-Sent Events, kommandon via POST.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const HTML = fs.readFileSync([path.join(__dirname, 'index.html'), path.join(__dirname, 'public', 'index.html')].find(f => fs.existsSync(f)));

// Fritextfrågor: [fråga, [godkända svar]]
const QUIZ = [
  ['Vilket land vann VM 2022?', ['Argentina']],
  ['Vem har gjort flest mål i VM-historien?', ['Miroslav Klose', 'Klose']],
  ['Vem är Sveriges meste landslagsmålskytt genom tiderna?', ['Zlatan Ibrahimovic', 'Zlatan', 'Ibrahimovic']],
  ['I vilken stad spelar FC Barcelona på Camp Nou?', ['Barcelona']],
  ['Vilket land arrangerade VM 2018?', ['Ryssland']],
  ['Vilken klubb har vunnit flest Champions League-titlar?', ['Real Madrid', 'Real']],
  ['Vilket land vann EM 2024?', ['Spanien']],
  ['Vilken klubb spelar sina hemmamatcher på Anfield?', ['Liverpool']],
  ['Vad heter Malmö FF:s hemmaarena?', ['Eleda Stadion', 'Eleda', 'Swedbank Stadion']],
  ['Vem vann Ballon d’Or 2023?', ['Lionel Messi', 'Messi']],
  ['Vilket land arrangerade VM 2014?', ['Brasilien']],
  ['Vad kallas det när en spelare gör tre mål i samma match?', ['Hattrick', 'Hat trick']],
  ['Vilken klubb spelar på Old Trafford?', ['Manchester United', 'Man United', 'Man Utd']],
  ['Vilket lag slog Sverige i VM-finalen 1958?', ['Brasilien']],
  ['Vem gjorde "Guds hand"-målet i VM 1986?', ['Diego Maradona', 'Maradona']],
  ['Vilket land har vunnit flest VM-titlar?', ['Brasilien']],
  ['I vilken stad spelar Juventus?', ['Turin', 'Torino']],
  ['Vilken engelsk klubb spelade Erling Haaland för 2023?', ['Manchester City', 'Man City', 'City']],
  ['Vilket land vann VM 2010?', ['Spanien']],
  ['Vem kallades "Kejsaren" och spelade för Bayern München?', ['Franz Beckenbauer', 'Beckenbauer']],
  ['Vilken svensk klubb har flest SM-guld?', ['Malmö FF', 'Malmö', 'MFF']],
  ['Vilket landslag spelar Cristiano Ronaldo för?', ['Portugal']],
  ['Vilken klubb har smeknamnet "Gamla damen"?', ['Juventus']],
  ['Vem tränade Barcelona när klubben tog sex titlar 2009?', ['Pep Guardiola', 'Guardiola']],
  ['I vilken stad ligger arenan Santiago Bernabéu?', ['Madrid']],
  ['Vem är Englands meste landslagsmålskytt?', ['Harry Kane', 'Kane']],
  ['Vilket land vann det allra första VM 1930?', ['Uruguay']],
  ['Vem var Sveriges förbundskapten vid VM 2018?', ['Janne Andersson', 'Andersson']],
  ['Vilken klubb har Lionel Messi representerat längst?', ['Barcelona', 'FC Barcelona']],
  ['Hur många spelare per lag får vara på planen samtidigt?', ['11', 'elva']],
];
// Gissningsfrågor (närmast vinner)
const NUM = [
  ['Hur många mål gjorde Miroslav Klose i VM-slutspel totalt?', 16],
  ['Vilket år spelades det första fotbolls-VM?', 1930],
  ['Hur många VM-titlar har Brasilien?', 5],
  ['Hur många mål gjorde Zlatan Ibrahimović för Sveriges landslag?', 62],
  ['Hur många lag deltog i VM 2022?', 32],
  ['Hur många mål gjorde Just Fontaine i VM 1958?', 13],
  ['Hur många VM-mål gjorde Cristiano Ronaldo totalt?', 8],
];

const rooms = new Map();
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const pick = a => a[Math.floor(Math.random() * a.length)];
function newCode() { let c; do { c = Array.from({ length: 4 }, () => pick([...'ABCDEFGHJKLMNPQRSTUVWXYZ'])).join(''); } while (rooms.has(c)); return c; }
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; }
function match(text, answers) {
  const t = norm(text); if (!t) return false;
  return answers.some(a => { a = norm(a);
    if (t === a) return true;
    if (a.length >= 4 && (' ' + t + ' ').includes(' ' + a + ' ')) return true;
    return a.length >= 5 && lev(t, a) <= (a.length > 9 ? 2 : 1); });
}

function view(room, pid) {
  const P = [...room.players.values()];
  const v = { code: room.code, phase: room.phase, target: room.target, hostId: room.hostId, you: pid, sitterId: room.sitterId,
    players: P.map(p => ({ id: p.id, name: p.name, score: p.score, on: p.conn > 0 })) };
  if (room.phase === 'opener') { v.q = room.opener.q[0]; v.done = [...room.opener.g.keys()]; v.mine = room.opener.g.has(pid) ? room.opener.g.get(pid).n : null; }
  if (room.phase === 'round') { const r = room.round;
    v.q = r.q[0]; v.mode = pid === room.sitterId ? r.mode : null; v.sitDone = !!r.mode;
    v.voted = r.votes.map(x => x.id); v.myVote = (r.votes.find(x => x.id === pid) || {}).v || null;
    if (pid === room.sitterId && r.mode === 'cheat') v.answer = r.q[1][0]; }
  if (['opener_result', 'reveal', 'over'].includes(room.phase)) v.result = room.result;
  return v;
}
function broadcast(room) {
  room.last = Date.now();
  for (const [pid, set] of room.clients) for (const res of set) res.write('data: ' + JSON.stringify(view(room, pid)) + '\n\n');
}

function startRound(room) {
  if (room.used.size >= QUIZ.length) room.used.clear();
  let i; do { i = Math.floor(Math.random() * QUIZ.length); } while (room.used.has(i));
  room.used.add(i);
  room.round = { q: QUIZ[i], mode: null, text: '', votes: [] };
  room.phase = 'round';
}
function resolveOpener(room) {
  const o = room.opener, ans = o.q[1];
  const list = [...o.g.entries()].map(([id, g]) => ({ id, n: g.n, diff: Math.abs(g.n - ans), t: g.t })).sort((a, b) => a.diff - b.diff || a.t - b.t);
  room.result = { kind: 'opener', q: o.q[0], answer: ans, list: list.map(({ id, n, diff }) => ({ id, n, diff })), winnerId: list[0].id };
  room.phase = 'opener_result';
}
function resolveRound(room) {
  const r = room.round, sid = room.sitterId, P = [...room.players.values()];
  const vmap = new Map(r.votes.map(x => [x.id, x.v]));
  const voters = P.filter(p => p.id !== sid && vmap.has(p.id));
  const cheated = r.mode === 'cheat';
  const correct = cheated || match(r.text, r.q[1]);
  const caught = cheated && voters.length > 0 && voters.every(p => vmap.get(p.id) === 'cheat');
  const d = {}; P.forEach(p => d[p.id] = 0);
  if (caught) d[sid] -= 15; else if (!cheated && !correct) d[sid] -= 30; else d[sid] += 10;
  voters.forEach(p => { const v = vmap.get(p.id);
    if (cheated) d[p.id] += v === 'cheat' ? 16 : -10;          // +15 rätt fuskrop, +1 bonus
    else if (v === 'know') d[p.id] += 10;
    else { d[p.id] -= 10; d[sid] += 1; } });                    // fel anklagelse, +1 till stolen
  P.forEach(p => p.score += d[p.id]);
  const out = caught || (!cheated && !correct);
  const top = P.filter(p => p.score >= room.target).sort((a, b) => b.score - a.score)[0];
  room.result = { kind: 'round', q: r.q[0], answer: r.q[1][0], mode: r.mode, text: r.text, correct, caught, out,
    votes: r.votes.map(x => ({ id: x.id, v: x.v })), d, sitterId: sid,
    next: out ? (r.votes[0] ? r.votes[0].id : sid) : sid, winnerId: top ? top.id : null };
  room.phase = 'reveal';
}
function progress(room) {
  if (room.phase === 'opener' && room.opener.g.size > 0 && [...room.players.values()].every(p => p.conn === 0 || room.opener.g.has(p.id))) resolveOpener(room);
  if (room.phase === 'round' && room.round.mode && room.round.votes.length > 0 &&
      [...room.players.values()].every(p => p.id === room.sitterId || p.conn === 0 || room.round.votes.some(x => x.id === p.id))) resolveRound(room);
}

function act(room, p, m) {
  const host = room.hostId === p.id;
  switch (m.type) {
    case 'start':
      if (!host || room.phase !== 'lobby') return 'Bara värden kan starta.';
      if (room.players.size < 2) return 'Det krävs minst 2 spelare.';
      room.target = Math.max(50, Math.min(200, Math.round(+m.target || 100)));
      room.players.forEach(x => x.score = 0); room.used.clear();
      room.opener = { q: pick(NUM), g: new Map() }; room.phase = 'opener'; break;
    case 'guess': {
      const n = Number(m.n);
      if (room.phase !== 'opener' || !isFinite(n) || room.opener.g.has(p.id)) return 'Ogiltig gissning.';
      room.opener.g.set(p.id, { n, t: Date.now() }); break; }
    case 'answer':
      if (room.phase !== 'round' || p.id !== room.sitterId || room.round.mode) return 'Det går inte nu.';
      room.round.mode = 'know'; room.round.text = String(m.text || '').slice(0, 80); break;
    case 'cheat':
      if (room.phase !== 'round' || p.id !== room.sitterId || room.round.mode) return 'Det går inte nu.';
      room.round.mode = 'cheat'; break;
    case 'vote':
      if (room.phase !== 'round' || p.id === room.sitterId || room.round.votes.some(x => x.id === p.id) || !['know', 'cheat'].includes(m.v)) return 'Det går inte nu.';
      room.round.votes.push({ id: p.id, v: m.v }); break;
    case 'next':
      if (!host) return 'Bara värden kan gå vidare.';
      if (room.phase === 'opener_result') { room.sitterId = room.result.winnerId; startRound(room); }
      else if (room.phase === 'reveal') { if (room.result.winnerId) room.phase = 'over'; else { room.sitterId = room.result.next; startRound(room); } }
      else return 'Det går inte nu.';
      break;
    case 'force':
      if (!host) return 'Bara värden kan göra det.';
      if (room.phase === 'opener' && room.opener.g.size) resolveOpener(room);
      else if (room.phase === 'round' && room.round.mode && room.round.votes.length) resolveRound(room);
      else return 'Det finns inget att gå vidare med än.';
      break;
    case 'again':
      if (!host || room.phase !== 'over') return 'Det går inte nu.';
      room.phase = 'lobby'; room.sitterId = null; break;
    default: return 'Okänt kommando.';
  }
  progress(room); broadcast(room); return null;
}

function addPlayer(room, name) {
  const p = { id: rid(), name: String(name || '').trim().slice(0, 16), score: 0, conn: 0 };
  room.players.set(p.id, p); if (!room.hostId) room.hostId = p.id; return p;
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(HTML); }
  if (req.method === 'GET' && u.pathname === '/events') {
    const room = rooms.get(u.searchParams.get('room')), p = room && room.players.get(u.searchParams.get('pid'));
    if (!p) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    if (!room.clients.has(p.id)) room.clients.set(p.id, new Set());
    room.clients.get(p.id).add(res); p.conn++;
    res.write('data: ' + JSON.stringify(view(room, p.id)) + '\n\n'); broadcast(room);
    req.on('close', () => {
      room.clients.get(p.id).delete(res); p.conn = Math.max(0, p.conn - 1);
      if (!p.conn && room.hostId === p.id) { const n = [...room.players.values()].find(x => x.conn > 0); if (n) room.hostId = n.id; }
      progress(room); broadcast(room);
    });
    return;
  }
  if (req.method === 'POST' && u.pathname === '/api') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 5000) req.destroy(); });
    req.on('end', () => {
      let m; try { m = JSON.parse(body); } catch { return json(res, 400, { error: 'Ogiltig begäran.' }); }
      if (m.type === 'create') {
        if (!String(m.name || '').trim()) return json(res, 400, { error: 'Skriv ditt namn.' });
        const room = { code: newCode(), hostId: null, players: new Map(), clients: new Map(), phase: 'lobby', target: 100, sitterId: null, used: new Set(), last: Date.now() };
        rooms.set(room.code, room); const p = addPlayer(room, m.name); return json(res, 200, { room: room.code, pid: p.id });
      }
      const room = rooms.get(String(m.room || '').toUpperCase());
      if (!room) return json(res, 404, { error: 'Hittar inget rum med den koden.' });
      if (m.type === 'join') {
        if (!String(m.name || '').trim()) return json(res, 400, { error: 'Skriv ditt namn.' });
        if (room.phase !== 'lobby') return json(res, 400, { error: 'Spelet har redan startat.' });
        if (room.players.size >= 12) return json(res, 400, { error: 'Rummet är fullt.' });
        const p = addPlayer(room, m.name); broadcast(room); return json(res, 200, { room: room.code, pid: p.id });
      }
      const p = room.players.get(m.pid);
      if (!p) return json(res, 404, { error: 'Du är inte med i rummet.' });
      const err = act(room, p, m); json(res, err ? 400 : 200, err ? { error: err } : { ok: true });
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log('Catchad kör på port ' + PORT));

setInterval(() => { for (const [c, r] of rooms) if (Date.now() - r.last > 6 * 3600e3) rooms.delete(c); }, 600e3);
setInterval(() => { for (const r of rooms.values()) for (const s of r.clients.values()) for (const res of s) res.write(': ping\n\n'); }, 20e3);
