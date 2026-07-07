/* Lemonade Work OS — tiny zero-dependency server for Railway
 * Serves the task manager UI + a JSON API secured by API_KEY.
 * Storage: JSON file in DATA_DIR (attach a Railway volume for persistence).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const KEY = process.env.API_KEY || 'lemonade-dev-key';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'tasks.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function readState() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return null; }
}
function writeState(s) { fs.writeFileSync(FILE, JSON.stringify(s, null, 2)); }
function blankState() {
  return { activeBoard: 0, people: [], boards: [{ name: 'My Tasks', groups: [{ name: 'Inbox', color: '#0073ea', collapsed: false, items: [] }] }] };
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj, null, 2));
}
function authed(q, req) {
  const k = q.get('key') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return k === KEY;
}
function findGroup(state, boardParam, groupParam) {
  let bi = 0;
  if (boardParam) {
    const asNum = parseInt(boardParam, 10);
    if (!isNaN(asNum) && state.boards[asNum]) bi = asNum;
    else {
      const idx = state.boards.findIndex(b => b.name.toLowerCase() === String(boardParam).toLowerCase());
      if (idx >= 0) bi = idx;
    }
  }
  const b = state.boards[bi];
  if (!b.groups.length) b.groups.push({ name: 'Inbox', color: '#0073ea', collapsed: false, items: [] });
  let gi = 0;
  if (groupParam) {
    const asNum = parseInt(groupParam, 10);
    if (!isNaN(asNum) && b.groups[asNum]) gi = asNum;
    else {
      const idx = b.groups.findIndex(g => g.name.toLowerCase() === String(groupParam).toLowerCase());
      if (idx >= 0) gi = idx;
    }
  }
  return { board: b, group: b.groups[gi], bi, gi };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const q = u.searchParams;

  // ---------- static ----------
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) { send(res, 500, { error: 'index.html missing' }); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }
  if (p === '/health') { send(res, 200, { ok: true }); return; }

  // ---------- api ----------
  if (p.startsWith('/api/')) {
    if (!authed(q, req)) { send(res, 401, { error: 'bad or missing key' }); return; }

    // full state
    if (p === '/api/tasks' && req.method === 'GET') {
      send(res, 200, readState() || {}); return;
    }
    if (p === '/api/tasks' && (req.method === 'PUT' || req.method === 'POST')) {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
      req.on('end', () => {
        try {
          const s = JSON.parse(body);
          if (!s || !Array.isArray(s.boards)) { send(res, 400, { error: 'invalid state' }); return; }
          writeState(s); send(res, 200, { ok: true });
        } catch (e) { send(res, 400, { error: 'invalid JSON' }); }
      });
      return;
    }

    // add one item: /api/add?key=K&name=...&board=0&group=Inbox&prio=high&date=2026-07-10&owner=Tal&status=work
    if (p === '/api/add' && req.method === 'GET') {
      const name = (q.get('name') || '').trim();
      if (!name) { send(res, 400, { error: 'name required' }); return; }
      const state = readState() || blankState();
      const { group, board } = findGroup(state, q.get('board'), q.get('group'));
      const item = {
        name,
        owner: q.get('owner') || '',
        status: ['not', 'work', 'stuck', 'done'].includes(q.get('status')) ? q.get('status') : 'not',
        prio: ['crit', 'high', 'med', 'low'].includes(q.get('prio')) ? q.get('prio') : 'med',
        date: q.get('date') || ''
      };
      group.items.push(item);
      writeState(state);
      send(res, 200, { ok: true, board: board.name, group: group.name, item });
      return;
    }

    // update first item whose name contains `find` (case-insensitive):
    // /api/update?key=K&find=weekly+report&status=done&prio=low&date=...&owner=...&rename=...
    if (p === '/api/update' && req.method === 'GET') {
      const find = (q.get('find') || '').trim().toLowerCase();
      if (!find) { send(res, 400, { error: 'find required' }); return; }
      const state = readState();
      if (!state) { send(res, 404, { error: 'no data yet' }); return; }
      for (const b of state.boards) for (const g of b.groups) for (const it of g.items) {
        if (it.name.toLowerCase().includes(find)) {
          if (q.get('status') && ['not', 'work', 'stuck', 'done'].includes(q.get('status'))) it.status = q.get('status');
          if (q.get('prio') && ['crit', 'high', 'med', 'low'].includes(q.get('prio'))) it.prio = q.get('prio');
          if (q.get('date') !== null) it.date = q.get('date') === null ? it.date : q.get('date');
          if (q.get('owner') !== null) it.owner = q.get('owner') === null ? it.owner : q.get('owner');
          if (q.get('rename')) it.name = q.get('rename');
          writeState(state);
          send(res, 200, { ok: true, board: b.name, group: g.name, item: it });
          return;
        }
      }
      send(res, 404, { error: 'no item matching "' + find + '"' });
      return;
    }

    // quick digest: /api/summary?key=K
    if (p === '/api/summary' && req.method === 'GET') {
      const state = readState();
      if (!state) { send(res, 200, { empty: true }); return; }
      const today = new Date().toISOString().slice(0, 10);
      const counts = { not: 0, work: 0, stuck: 0, done: 0 };
      const overdue = [], dueToday = [], stuck = [];
      for (const b of state.boards) for (const g of b.groups) for (const it of g.items) {
        counts[it.status] = (counts[it.status] || 0) + 1;
        const ref = { board: b.name, group: g.name, name: it.name, date: it.date, prio: it.prio, status: it.status };
        if (it.status === 'stuck') stuck.push(ref);
        if (it.date && it.status !== 'done') {
          if (it.date < today) overdue.push(ref);
          else if (it.date === today) dueToday.push(ref);
        }
      }
      send(res, 200, { date: today, counts, overdue, dueToday, stuck });
      return;
    }

    send(res, 404, { error: 'unknown endpoint' });
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => console.log('Lemonade Work OS on :' + PORT));
