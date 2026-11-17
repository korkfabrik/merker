// Einfacher Nachbau der Home-Assistant-Schnittstellen, die Merker nutzt (nur für Tests).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const ROOT = process.env.MERKER_DIR || new URL('../app', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8123);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const lists = {
  'todo.einkaufsliste': {
    name: 'Einkaufsliste',
    features: 127,
    items: [
      { uid: 'u1', summary: 'Brot', status: 'needs_action', due: null, description: null },
      { uid: 'u2', summary: 'Milch', status: 'needs_action', due: day(0), description: 'Fettarm, 1 Liter' },
      { uid: 'u3', summary: '❗ Arzt anrufen', status: 'needs_action', due: day(2), description: null },
      { uid: 'u4', summary: 'Altpapier rausstellen', status: 'needs_action', due: day(-1), description: null },
      { uid: 'u5', summary: 'Eier', status: 'completed', due: null, description: null },
      { uid: 'u6', summary: '<img src=x onerror=window.__xss=1>', status: 'needs_action', due: null, description: null },
    ],
  },
  'todo.haushalt': {
    name: 'Haushalt',
    features: 127,
    items: [{ uid: 'h1', summary: 'Rauchmelder testen', status: 'needs_action', due: day(5), description: null }],
  },
};

const open = (l) => String(l.items.filter((i) => i.status === 'needs_action').length);
const entityState = (id) => ({
  s: lists[id].unavailable ? 'unavailable' : open(lists[id]),
  a: { friendly_name: lists[id].name, supported_features: lists[id].features },
  c: 'ctx',
  lc: Date.now() / 1000,
});

const sockets = new Set();
const calls = [];
let seq = 0;
let failNext = false;
let dropOnAdd = false;
const userData = {};
let flowForbidden = false;
let refuseUntil = 0;
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));

function pushItems(id) {
  for (const s of sockets) {
    for (const [subId, entity] of s.itemSubs) send(s.ws, { id: subId, type: 'event', event: { items: lists[id].items } }, entity === id);
  }
}

function broadcastItems(id) {
  for (const s of sockets) {
    for (const [subId, entity] of s.itemSubs) if (entity === id) send(s.ws, { id: subId, type: 'event', event: { items: lists[id].items } });
    if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { c: { [id]: { '+': { s: open(lists[id]) } } } } });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/auth/authorize') {
    const redirect = new URL(url.searchParams.get('redirect_uri'));
    redirect.searchParams.set('code', 'mockcode');
    redirect.searchParams.set('state', url.searchParams.get('state'));
    res.writeHead(302, { Location: redirect.toString() }).end();
    return;
  }
  if (url.pathname === '/auth/token' && req.method === 'POST') {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_in: 1800, token_type: 'Bearer' }));
    });
    return;
  }
  if (url.pathname === '/auth/revoke') {
    req.resume();
    res.writeHead(200).end();
    return;
  }
  if (url.pathname === '/__mock/add-item' && req.method === 'POST') {
    const id = url.searchParams.get('entity');
    lists[id].items.push({ uid: `n${Date.now()}`, summary: url.searchParams.get('summary'), status: 'needs_action', due: url.searchParams.get('due'), description: url.searchParams.get('desc') });
    broadcastItems(id);
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/user-data') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(userData));
    return;
  }
  if (url.pathname === '/__mock/calls') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(calls));
    return;
  }
  if (url.pathname === '/__mock/items') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(lists[url.searchParams.get('entity')].items));
    return;
  }
  if (url.pathname === '/__mock/drop' && req.method === 'POST') {
    refuseUntil = Date.now() + Number(url.searchParams.get('ms') || 3000);
    for (const s of sockets) s.ws.terminate();
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/unavailable' && req.method === 'POST') {
    const id = url.searchParams.get('entity');
    lists[id].unavailable = url.searchParams.get('on') === '1';
    for (const s of sockets) if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { a: { [id]: entityState(id) } } });
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/drop-on-add' && req.method === 'POST') {
    dropOnAdd = true;
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/fail-next' && req.method === 'POST') {
    failNext = true;
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/add-list-ro' && req.method === 'POST') {
    lists['todo.nur_lesen'] = { name: 'Nur lesen', features: 0, items: [{ uid: 'r1', summary: 'Fester Eintrag', status: 'needs_action', due: null, description: null }] };
    for (const s of sockets) if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { a: { 'todo.nur_lesen': entityState('todo.nur_lesen') } } });
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/add-list-nodelete' && req.method === 'POST') {
    lists['todo.kein_loeschen'] = { name: 'Kein Löschen', features: 125, items: [{ uid: 'k1', summary: 'Bleibt stehen', status: 'needs_action', due: null, description: null }] };
    for (const s of sockets) if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { a: { 'todo.kein_loeschen': entityState('todo.kein_loeschen') } } });
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/add-list' && req.method === 'POST') {
    lists['todo.neu'] = { name: 'Neue Liste', features: 127, items: [] };
    for (const s of sockets) if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { a: { 'todo.neu': entityState('todo.neu') } } });
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/noise' && req.method === 'POST') {
    // Zustandsänderung einer fremden Entität: darf Merker nicht neu zeichnen lassen.
    for (const s of sockets) if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { c: { 'sensor.x': { '+': { s: String(Math.random()) } } } } });
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname === '/__mock/flow-forbidden' && req.method === 'POST') {
    flowForbidden = true;
    res.writeHead(200).end('ok');
    return;
  }
  if (url.pathname.startsWith('/api/config/config_entries/flow') && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const json = (code, obj) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
      if (req.headers.authorization !== 'Bearer tok') return json(401, { message: 'Unauthorized' });
      if (flowForbidden) return json(403, { message: 'Unauthorized' });
      const data = JSON.parse(body || '{}');
      if (url.pathname.endsWith('/flow')) {
        calls.push({ domain: 'config', service: 'flow_start', data, target: {} });
        return json(200, { type: 'form', flow_id: 'f1', handler: 'local_todo', step_id: 'user', data_schema: [{ type: 'string', name: 'todo_list_name', required: true }], errors: null });
      }
      calls.push({ domain: 'config', service: 'flow_step', data, target: {} });
      const name = data.todo_list_name;
      const slug = String(name).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      const id = `todo.${slug}`;
      if (lists[id]) return json(200, { type: 'abort', reason: 'already_configured' });
      lists[id] = { name, features: 127, items: [] };
      for (const s of sockets) if (s.entitiesSubId) send(s.ws, { id: s.entitiesSubId, type: 'event', event: { a: { [id]: entityState(id) } } });
      json(200, { type: 'create_entry', title: name, result: { entry_id: 'e1' } });
    });
    return;
  }
  if (url.pathname.startsWith('/local/merker')) {
    let rel = url.pathname.replace('/local/merker', '') || '/';
    if (rel.endsWith('/')) return res.writeHead(404).end('nicht gefunden'); // wie Home Assistant: kein Verzeichnis-Index
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end('nicht gefunden');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=2678400' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404).end('nicht gefunden');
});

const wss = new WebSocketServer({ server, path: '/api/websocket' });
wss.on('connection', (ws) => {
  if (Date.now() < refuseUntil) return ws.terminate();
  const s = { ws, itemSubs: new Map(), entitiesSubId: null };
  sockets.add(s);
  ws.on('close', () => sockets.delete(s));
  send(ws, { type: 'auth_required', ha_version: '2026.9.0' });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'auth') return send(ws, msg.access_token === 'tok' ? { type: 'auth_ok', ha_version: '2026.9.0' } : { type: 'auth_invalid', message: 'x' });
    const ok = (result = null) => send(ws, { id: msg.id, type: 'result', success: true, result });
    switch (msg.type) {
      case 'frontend/get_user_data':
        return ok({ value: userData[msg.key] ?? null });
      case 'frontend/set_user_data':
        userData[msg.key] = msg.value;
        calls.push({ domain: 'frontend', service: 'set_user_data', data: { key: msg.key, value: msg.value }, target: {} });
        return ok();
      case 'supported_features':
      case 'unsubscribe_events':
        return ok();
      case 'ping':
        return send(ws, { id: msg.id, type: 'pong' });
      case 'subscribe_entities': {
        s.entitiesSubId = msg.id;
        ok();
        const a = Object.fromEntries(Object.keys(lists).map((id) => [id, entityState(id)]));
        a['sensor.x'] = { s: '1', a: { friendly_name: 'Rauschen' }, c: 'ctx', lc: Date.now() / 1000 };
        return send(ws, { id: msg.id, type: 'event', event: { a } });
      }
      case 'todo/item/subscribe':
        if (!lists[msg.entity_id]) return send(ws, { id: msg.id, type: 'result', success: false, error: { code: 'invalid_entity_id', message: 'x' } });
        s.itemSubs.set(msg.id, msg.entity_id);
        ok();
        return send(ws, { id: msg.id, type: 'event', event: { items: lists[msg.entity_id].items } });
      case 'todo/item/move': {
        const list = lists[msg.entity_id];
        calls.push({ domain: 'todo', service: 'move', data: { uid: msg.uid, previous_uid: msg.previous_uid ?? null }, target: { entity_id: msg.entity_id } });
        if (failNext) {
          failNext = false;
          return send(ws, { id: msg.id, type: 'result', success: false, error: { code: 'failed', message: 'Verschieben nicht möglich' } });
        }
        const item = list?.items.find((i) => i.uid === msg.uid);
        if (!item) return send(ws, { id: msg.id, type: 'result', success: false, error: { code: 'not_found', message: 'x' } });
        list.items.splice(list.items.indexOf(item), 1);
        const at = msg.previous_uid ? list.items.findIndex((i) => i.uid === msg.previous_uid) + 1 : 0;
        list.items.splice(at, 0, item);
        broadcastItems(msg.entity_id);
        return ok();
      }
      case 'call_service': {
        calls.push({ domain: msg.domain, service: msg.service, data: msg.service_data, target: msg.target });
        const entity = [].concat(msg.target?.entity_id ?? [])[0];
        const list = lists[entity];
        const fail = (code, message) => send(ws, { id: msg.id, type: 'result', success: false, error: { code, message } });
        if (failNext) {
          failNext = false;
          return fail('home_assistant_error', 'Speichern nicht möglich');
        }
        if (!list || msg.domain !== 'todo') return fail('not_found', 'Liste unbekannt');
        const d = msg.service_data ?? {};
        if (list.unavailable) return ok({ context: { id: 'c' } }); // wie Home Assistant: nicht verfügbare Entität wird übersprungen
        if (msg.service === 'add_item' && dropOnAdd) {
          // Aufgabe anlegen, aber die Antwort kommt nicht mehr an (Verbindung reißt ab)
          dropOnAdd = false;
          list.items.push({ uid: `n${++seq}`, summary: d.item, status: 'needs_action', due: d.due_datetime ?? d.due_date ?? null, description: d.description ?? null });
          refuseUntil = Date.now() + 1500;
          for (const x of sockets) x.ws.terminate();
          return;
        }
        const find = (key) => list.items.find((i) => i.uid === key) ?? list.items.find((i) => i.summary === key);
        if (msg.service === 'add_item') {
          list.items.push({ uid: `n${++seq}`, summary: d.item, status: 'needs_action', due: d.due_datetime ?? d.due_date ?? null, description: d.description ?? null });
        } else if (msg.service === 'update_item') {
          const item = find(d.item);
          if (!item) return fail('service_validation_error', 'Eintrag nicht gefunden');
          if ('rename' in d) item.summary = d.rename;
          if ('status' in d) item.status = d.status;
          if ('due_date' in d) item.due = d.due_date;
          if ('due_datetime' in d) item.due = d.due_datetime;
          if ('description' in d) item.description = d.description;
        } else if (msg.service === 'remove_item') {
          for (const key of [].concat(d.item)) {
            const item = find(key);
            if (!item) return fail('service_validation_error', 'Eintrag nicht gefunden');
            list.items.splice(list.items.indexOf(item), 1);
          }
        } else if (msg.service === 'remove_completed_items') {
          list.items = list.items.filter((i) => i.status !== 'completed');
        } else {
          return fail('not_found', 'Dienst unbekannt');
        }
        broadcastItems(entity);
        return ok({ context: { id: 'c' } });
      }
      default:
        return send(ws, { id: msg.id, type: 'result', success: false, error: { code: 'unknown_command', message: msg.type } });
    }
  });
});

server.listen(PORT, () => console.log(`Mock-HA auf http://localhost:${PORT}`));
