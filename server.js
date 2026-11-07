// Heladería Scannapieco · Colegiales, desde 1938 — web pública con SEO + sistema de la fábrica
// (pedidos, QR de mostrador, pantalla de turnos, tarjeta de sellos, tortas por encargo, vitrina, producción y caja).
// Node 24, sin dependencias: http + node:sqlite.
process.env.TZ = process.env.TZ || 'America/Argentina/Buenos_Aires';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DIR = import.meta.dirname;
try { process.loadEnvFile(path.join(DIR, '.env')); } catch {}
const PORT = Number(process.env.PORT) || 3004;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUB = path.join(DIR, 'public'), VIEWS = path.join(DIR, 'views');
const DATA = process.env.DATA_DIR || path.join(DIR, 'data');
const V = Date.now().toString(36);
fs.mkdirSync(DATA, { recursive: true });

/* ---------- datos del negocio (de su Instagram y notas de prensa; confirmar con la familia) ---------- */
const BIZ = {
  name: 'Heladería Scannapieco', street: 'Av. Álvarez Thomas 10', hood: 'Colegiales', city: 'Ciudad Autónoma de Buenos Aires',
  ig: 'scannapiecohelados', phone: '4777-3528', phoneIntl: '+541147773528', wa: '5491123233780', since: 1938,
  transit: 'A media cuadra de Av. Federico Lacroze. Subte B, estación Federico Lacroze, y tren Urquiza.',
  hoursText: 'Domingo a jueves de 12 a 24 · Viernes y sábado de 12 a 1',
  zones: 'Colegiales, Palermo Hollywood, Chacarita, Belgrano R y Villa Ortúzar',
};
// minutos desde las 00:00 (1500 = 1 de la madrugada). Índice 0 = domingo.
const HOURS = [[720, 1440], [720, 1440], [720, 1440], [720, 1440], [720, 1440], [720, 1500], [720, 1500]];
const CATS = [['dulces', 'Dulces de leche'], ['chocolates', 'Chocolates'], ['cremas', 'Cremas'], ['frutales', 'Frutales'], ['al-agua', 'Al agua (veganos)']];
const CAT = Object.fromEntries(CATS);
const PAYS = { efectivo: 'Efectivo', mp: 'Mercado Pago', transferencia: 'Transferencia', debito: 'Débito' };
const STATUS = ['nuevo', 'preparando', 'listo', 'en camino', 'entregado', 'cancelado'];
const GOAL = 8; // sellos para el premio
const TUB = 5000; // gramos de una bacha llena
// [slug, nombre, categoría, descripción, color del gusto, vegano, sin TACC, peso de ventas]
const FLAVORS = [
  ['dulce-de-leche', 'Dulce de leche', 'dulces', 'El más pedido de la casa. Dulce de leche cocido lento, sin vueltas.', '#c4864a', 0, 1, 10],
  ['dulce-de-leche-granizado', 'Dulce de leche granizado', 'dulces', 'Dulce de leche con lluvia de chocolate amargo.', '#b57a45', 0, 1, 7],
  ['super-dulce-de-leche', 'Súper dulce de leche', 'dulces', 'Con más dulce de leche adentro: vetas espesas en cada cucharada.', '#a8693a', 0, 1, 6],
  ['dulce-de-leche-con-nuez', 'Dulce de leche con nuez', 'dulces', 'Nueces tostadas sobre base de dulce de leche.', '#9b6a40', 0, 0, 3],
  ['chocolate', 'Chocolate', 'chocolates', 'Chocolate con leche, cremoso, el de siempre.', '#6b3f2a', 0, 1, 7],
  ['chocolate-amargo', 'Chocolate amargo', 'chocolates', 'Cacao intenso, poco dulce.', '#4a2a1d', 0, 1, 5],
  ['chocolate-suizo', 'Chocolate suizo', 'chocolates', 'Chocolate con trozos de chocolate.', '#5c3423', 0, 1, 4],
  ['chocolate-con-almendras', 'Chocolate con almendras', 'chocolates', 'Almendras tostadas y chocolate con leche.', '#6e4630', 0, 0, 3],
  ['sambayon', 'Sambayón', 'cremas', 'Receta italiana con yemas y vino marsala.', '#e7c45a', 0, 1, 4],
  ['crema-americana', 'Crema americana', 'cremas', 'Crema de leche pura. Combina con todo.', '#f3ead2', 0, 1, 5],
  ['tramontana', 'Tramontana', 'cremas', 'Crema americana con dulce de leche y bocaditos de galletita bañada.', '#e9d6b4', 0, 0, 4],
  ['pistacho', 'Pistacho', 'cremas', 'Pistacho tostado, color natural.', '#9db26b', 0, 1, 4],
  ['tiramisu', 'Tiramisú', 'cremas', 'Mascarpone, café y cacao, como el postre.', '#cdb08c', 0, 0, 2],
  ['banana-split', 'Banana split', 'cremas', 'Banana con dulce de leche y chocolate.', '#ead58e', 0, 1, 3],
  ['menta-granizada', 'Menta granizada', 'cremas', 'Menta fresca con chocolate en lluvia.', '#a9d6c2', 0, 1, 2],
  ['frutilla-a-la-crema', 'Frutilla a la crema', 'frutales', 'Frutillas frescas y crema.', '#eb8f9b', 0, 1, 5],
  ['frambuesa-a-la-crema', 'Frambuesa a la crema', 'frutales', 'Frambuesas con su acidez justa.', '#d9606f', 0, 1, 2],
  ['limon', 'Limón', 'al-agua', 'Al agua, bien ácido. Sin lácteos.', '#efe08a', 1, 1, 4],
  ['frutilla-al-agua', 'Frutilla al agua', 'al-agua', 'Solo fruta, agua y azúcar. Sin lácteos.', '#e0566b', 1, 1, 3],
  ['mango', 'Mango', 'al-agua', 'Mango maduro, al agua. Sin lácteos.', '#f2b23e', 1, 1, 3],
  ['chocolate-vegano', 'Chocolate vegano', 'al-agua', 'Cacao amargo con base de almendras. Sin lácteos.', '#55301f', 1, 1, 2],
];
// [clave, nombre, gramos, gustos máximos, precio de ejemplo]
const SIZES = [['cucurucho', 'Cucurucho', 180, 2, 4800], ['cuarto', '1/4 kg', 250, 3, 8200], ['medio', '1/2 kg', 500, 3, 14500], ['kilo', '1 kg', 1000, 4, 25900]];
// [slug, nombre, descripción, precio de ejemplo, color]
const CAKES = [
  ['torta-oreo', 'Torta helada de cookies', 'Base de galletitas de chocolate, crema americana y dulce de leche. 12 porciones.', 34900, '#3a2a24'],
  ['almendrado', 'Almendrado', 'Helado de almendras con praliné crocante, para cortar en rodajas. 10 porciones.', 29900, '#d9b98a'],
  ['torta-dulce-de-leche', 'Torta helada de dulce de leche', 'Bizcochuelo, dulce de leche granizado y merengue. 12 porciones.', 36900, '#c4864a'],
  ['bombon-escoces', 'Caja de bombones escoceses', 'Doce bombones de crema americana bañados en chocolate.', 18900, '#4a2a1d'],
];
const CAKE_TIMES = ['14:00', '16:00', '18:00', '20:00'];
const FAQ = [
  ['¿Dónde queda la Heladería Scannapieco?', `En ${BIZ.street}, ${BIZ.hood}, Buenos Aires. ${BIZ.transit}`],
  ['¿Qué horario tiene?', BIZ.hoursText + '.'],
  ['¿Hacen envíos de helado?', `Sí, a ${BIZ.zones}. Armás el pedido en la web y seguís en vivo cuándo sale. También podés pedir para retirar.`],
  ['¿Desde cuándo existe la heladería?', 'Desde 1938. La fundó la familia Scannapieco en Av. Córdoba y desde 2013 está en Colegiales.'],
  ['¿Tienen helados veganos o sin TACC?', 'Sí. Los gustos al agua no llevan lácteos, y en la vitrina de esta página podés filtrar los aptos sin TACC.'],
  ['¿Se pueden encargar tortas heladas?', 'Sí, con 48 horas de anticipación. Elegís la torta, el día y el horario de retiro desde esta página.'],
];

/* ---------- base de datos ---------- */
const db = new DatabaseSync(path.join(DATA, 'scannapieco.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS flavors(id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT, cat TEXT, description TEXT, color TEXT, vegan INTEGER, gf INTEGER, level INTEGER DEFAULT 100, available INTEGER DEFAULT 1, sort INTEGER);
CREATE TABLE IF NOT EXISTS sizes(key TEXT PRIMARY KEY, name TEXT, grams INTEGER, max INTEGER, price INTEGER, sort INTEGER);
CREATE TABLE IF NOT EXISTS cakes(id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT, description TEXT, price INTEGER, color TEXT, available INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, code TEXT UNIQUE, kind TEXT, status TEXT DEFAULT 'nuevo', turn INTEGER, name TEXT, phone TEXT, address TEXT, date TEXT, time TEXT, pay TEXT, notes TEXT, card TEXT, fee INTEGER DEFAULT 0, total INTEGER, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, name TEXT, detail TEXT, grams INTEGER DEFAULT 0, price INTEGER, qty INTEGER);
CREATE TABLE IF NOT EXISTS item_flavors(item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, flavor_id INTEGER, grams INTEGER);
CREATE TABLE IF NOT EXISTS cards(id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, phone TEXT UNIQUE, stamps INTEGER DEFAULT 0, rewards INTEGER DEFAULT 0, created_at TEXT, last_at TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER);`);
const get = (sql, ...a) => db.prepare(sql).get(...a);
const all = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const S = (k) => get('SELECT v FROM settings WHERE k=?', k)?.v ?? '';
const setS = (k, v) => run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));

if (!get('SELECT COUNT(*) n FROM flavors').n) tx(() => FLAVORS.forEach((f, i) => run('INSERT INTO flavors(slug,name,cat,description,color,vegan,gf,sort) VALUES(?,?,?,?,?,?,?,?)', ...f.slice(0, 7), i)));
if (!get('SELECT COUNT(*) n FROM sizes').n) tx(() => SIZES.forEach((s, i) => run('INSERT INTO sizes VALUES(?,?,?,?,?,?)', ...s, i)));
if (!get('SELECT COUNT(*) n FROM cakes').n) tx(() => CAKES.forEach((c) => run('INSERT INTO cakes(slug,name,description,price,color) VALUES(?,?,?,?,?)', ...c)));
for (const [k, v] of [['delivery', '1'], ['pickup', '1'], ['fee', '1900'], ['note', ''], ['fotd', 'super-dulce-de-leche'], ['cakesPerDay', '6']]) if (!get('SELECT 1 FROM settings WHERE k=?', k)) setS(k, v);

/* ---------- utilidades ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d = new Date()) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const digits = (s) => String(s || '').replace(/\D/g, '');
function newCode(prefix, table, len = 4) {
  for (;;) { const c = prefix + '-' + Array.from(crypto.randomBytes(len), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join(''); if (!get(`SELECT 1 FROM ${table} WHERE code=?`, c)) return c; }
}
function openInfo(d = new Date()) {
  const mins = d.getHours() * 60 + d.getMinutes(), dow = d.getDay(), [o, c] = HOURS[dow], prev = HOURS[(dow + 6) % 7];
  if (prev[1] > 1440 && mins < prev[1] - 1440) return { open: true, text: `Abierto · cierra a la ${hm(prev[1])}` };
  if (mins >= o && mins < c) return { open: true, text: `Abierto · cierra ${c >= 1440 ? (c === 1440 ? 'a las 24' : 'a la ' + hm(c)) : 'a las ' + hm(c)}` };
  if (mins < o) return { open: false, text: `Cerrado · abre hoy a las ${hm(o)}` };
  return { open: false, text: `Cerrado · abre mañana a las ${hm(HOURS[(dow + 1) % 7][0])}` };
}
function pickupTimes(d = new Date()) {
  const dow = d.getDay(), nowMin = d.getHours() * 60 + d.getMinutes(), prev = HOURS[(dow + 6) % 7];
  let [o, c] = HOURS[dow];
  if (prev[1] > 1440 && nowMin < prev[1] - 1440) { o = 0; c = prev[1] - 1440; }
  const out = [], from = Math.ceil((Math.max(nowMin, o) + 20) / 15) * 15;
  for (let t = from; t <= Math.min(c - 15, 1439); t += 15) out.push(hm(t));
  return out;
}
const flavorsPub = () => all('SELECT id,slug,name,cat,description,color,vegan,gf,level,available FROM flavors ORDER BY sort');
function publicMenu() {
  return {
    cats: CATS.map(([key, label]) => ({ key, label })), flavors: flavorsPub(), sizes: all('SELECT key,name,grams,max,price FROM sizes ORDER BY sort'),
    cakes: all('SELECT id,slug,name,description,price,color,available FROM cakes ORDER BY id'), cakeTimes: CAKE_TIMES,
    open: openInfo(), times: pickupTimes(), fee: Number(S('fee')) || 0, delivery: S('delivery') === '1', pickup: S('pickup') === '1',
    note: S('note'), fotd: S('fotd'), goal: GOAL, zones: BIZ.zones,
  };
}

/* ---------- pedidos ---------- */
function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) throw bad('El pedido está vacío');
  if (items.length > 12) throw bad('Demasiados potes en un solo pedido');
  return items.map((it) => {
    const s = get('SELECT * FROM sizes WHERE key=?', str(it?.size, 20)), qty = Math.trunc(Number(it?.qty) || 1);
    if (!s) throw bad('Elegí un tamaño');
    if (!(qty >= 1 && qty <= 10)) throw bad('Cantidad inválida');
    const ids = [...new Set((Array.isArray(it.flavors) ? it.flavors : []).map((x) => Math.trunc(Number(x))))];
    if (!ids.length) throw bad(`Elegí al menos un gusto para el ${s.name}`);
    if (ids.length > s.max) throw bad(`El ${s.name} lleva hasta ${s.max} gustos`);
    const fl = ids.map((id) => { const f = get('SELECT * FROM flavors WHERE id=?', id); if (!f) throw bad('Hay un gusto que no existe'); if (!f.available || f.level <= 0) throw bad(`${f.name} se terminó por hoy. Cambialo por otro.`); return f; });
    return { s, qty, fl };
  });
}
function nextTurn(at) { return (get('SELECT MAX(turn) n FROM orders WHERE substr(created_at,1,10)=? AND kind!=?', ymd(at), 'encargo').n || 0) + 1; }
function insertOrder(o, items, at = new Date(), { useStock = true } = {}) {
  const fee = o.kind === 'envio' ? Number(S('fee')) || 0 : 0, ts = stamp(at);
  const total = items.reduce((t, i) => t + i.s.price * i.qty, 0) + fee;
  const { lastInsertRowid: id } = run('INSERT INTO orders(code,kind,status,turn,name,phone,address,date,time,pay,notes,card,fee,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    newCode(o.kind === 'mostrador' ? 'M' : o.kind === 'envio' ? 'E' : 'R', 'orders'), o.kind, o.status || 'nuevo', nextTurn(at), o.name || '', o.phone || '', o.address || '', ymd(at), o.time || '', o.pay || '', o.notes || '', o.card || '', fee, total, ts, ts);
  for (const i of items) {
    const per = Math.round(i.s.grams / i.fl.length);
    const { lastInsertRowid: iid } = run('INSERT INTO items(order_id,name,detail,grams,price,qty) VALUES(?,?,?,?,?,?)', id, i.s.name, i.fl.map((f) => f.name).join(', '), i.s.grams, i.s.price, i.qty);
    for (const f of i.fl) {
      run('INSERT INTO item_flavors VALUES(?,?,?)', iid, f.id, per * i.qty);
      if (useStock) run('UPDATE flavors SET level=MAX(0, level-?) WHERE id=?', Math.max(1, Math.round((per * i.qty / TUB) * 100)), f.id);
    }
  }
  return get('SELECT * FROM orders WHERE id=?', Number(id));
}
function setStatus(id, status, at = new Date()) {
  const o = get('SELECT * FROM orders WHERE id=?', id); if (!o) throw bad('No existe el pedido', 404);
  run('UPDATE orders SET status=?, updated_at=? WHERE id=?', status, stamp(at), id);
  // la tarjeta suma un sello cuando el pedido se entrega
  if (status === 'entregado' && o.status !== 'entregado' && o.card) run('UPDATE cards SET stamps=stamps+1, last_at=? WHERE code=?', stamp(at), o.card);
}
function withItems(o) { return { ...o, items: all('SELECT name,detail,grams,price,qty FROM items WHERE order_id=?', o.id) }; }
function board() {
  return all("SELECT * FROM orders WHERE kind!='encargo' AND (status IN ('nuevo','preparando','listo','en camino') OR (status IN ('entregado','cancelado') AND updated_at>=?)) ORDER BY id", stamp(new Date(Date.now() - 3 * 3600e3))).map(withItems);
}
function cakeLeft(date) { return (Number(S('cakesPerDay')) || 6) - get("SELECT COUNT(*) n FROM orders WHERE kind='encargo' AND date=? AND status!='cancelado'", date).n; }
function report(days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = ymd(new Date(Date.now() - i * 864e5));
    const t = get("SELECT COALESCE(SUM(total),0) s, COUNT(*) n FROM orders WHERE status='entregado' AND substr(updated_at,1,10)=?", d);
    const g = get("SELECT COALESCE(SUM(i.grams*i.qty),0) g FROM items i JOIN orders o ON o.id=i.order_id WHERE o.status='entregado' AND o.kind!='encargo' AND substr(o.updated_at,1,10)=?", d);
    out.push({ date: d, sales: t.s, orders: t.n, kilos: Math.round(g.g / 100) / 10 });
  }
  const from = out[0].date;
  const top = all("SELECT f.name, f.color, SUM(x.grams) g FROM item_flavors x JOIN flavors f ON f.id=x.flavor_id JOIN items i ON i.id=x.item_id JOIN orders o ON o.id=i.order_id WHERE o.status!='cancelado' AND substr(o.created_at,1,10)>=? GROUP BY f.id ORDER BY g DESC LIMIT 8", from);
  const pay = all("SELECT pay, SUM(total) s FROM orders WHERE status='entregado' AND substr(updated_at,1,10)>=? GROUP BY pay ORDER BY s DESC", from);
  const kinds = all("SELECT kind, COUNT(*) n, SUM(total) s FROM orders WHERE status='entregado' AND substr(updated_at,1,10)>=? GROUP BY kind", from);
  return { days: out, top, pay, kinds };
}
function production() {
  const from = ymd(new Date(Date.now() - 7 * 864e5));
  return all('SELECT * FROM flavors ORDER BY sort').map((f) => {
    const g = get("SELECT COALESCE(SUM(x.grams),0) g FROM item_flavors x JOIN items i ON i.id=x.item_id JOIN orders o ON o.id=i.order_id WHERE x.flavor_id=? AND o.status!='cancelado' AND substr(o.created_at,1,10)>=?", f.id, from).g;
    const daily = g / 7, stock = (f.level / 100) * TUB, need = Math.max(0, daily * 1.2 - stock);
    return { id: f.id, name: f.name, color: f.color, level: f.level, available: f.available, daily: Math.round(daily / 100) / 10, tubs: Math.ceil(need / TUB * 2) / 2 };
  });
}
function adminState() {
  return {
    now: stamp(), board: board(), pays: PAYS, cats: CATS, goal: GOAL,
    encargos: all("SELECT * FROM orders WHERE kind='encargo' AND date>=? ORDER BY date,time", ymd(new Date(Date.now() - 864e5))).map(withItems),
    flavors: all('SELECT * FROM flavors ORDER BY sort'), sizes: all('SELECT * FROM sizes ORDER BY sort'), cakes: all('SELECT * FROM cakes ORDER BY id'),
    cards: all('SELECT * FROM cards ORDER BY COALESCE(last_at,created_at) DESC LIMIT 60'),
    settings: { delivery: S('delivery'), pickup: S('pickup'), fee: S('fee'), note: S('note'), fotd: S('fotd'), cakesPerDay: S('cakesPerDay'), demo: S('demo') },
    report: report(7), production: production(),
  };
}

/* ---------- datos de ejemplo para que la demo no arranque vacía ---------- */
function seedDemo() {
  if (get('SELECT COUNT(*) n FROM orders').n) return;
  const F = all('SELECT * FROM flavors'), Z = all('SELECT * FROM sizes'), r = (n) => Math.floor(Math.random() * n);
  const pool = F.flatMap((f) => Array(FLAVORS.find((x) => x[0] === f.slug)[7]).fill(f));
  const pick = (n) => { const s = new Set(); while (s.size < n) s.add(pool[r(pool.length)]); return [...s]; };
  const item = (key, n) => { const s = Z.find((z) => z.key === key); return { s, qty: 1, fl: pick(Math.min(n, s.max)) }; };
  const names = ['Martina', 'Lucas', 'Sofía', 'Juan', 'Valen', 'Tomás', 'Cami', 'Nico', 'Flor', 'Agus', 'Pau', 'Manu'];
  tx(() => {
    for (let i = 7; i >= 1; i--) {
      const n = 22 + r(16), day = new Date(Date.now() - i * 864e5);
      for (let k = 0; k < n; k++) {
        const at = new Date(day); at.setHours(13 + r(10), r(60), 0);
        const kind = ['mostrador', 'mostrador', 'retiro', 'envio'][r(4)], key = kind === 'mostrador' ? ['cucurucho', 'cuarto', 'cuarto', 'medio'][r(4)] : ['medio', 'kilo', 'kilo', 'cuarto'][r(4)];
        const o = insertOrder({ kind, name: names[r(12)], phone: '1155550000', address: kind === 'envio' ? 'Zabala 3400' : '', pay: Object.keys(PAYS)[r(4)] }, [item(key, 2 + r(3))], at, { useStock: false });
        setStatus(o.id, 'entregado', new Date(at.getTime() + 25 * 6e4));
      }
    }
    const ago = (m) => new Date(Date.now() - m * 6e4);
    const mk = (kind, status, m, items, extra = {}) => { const o = insertOrder({ kind, name: names[r(12)] + ' ' + 'GMRTPS'[r(6)] + '.', phone: '1155550000', pay: 'mp', ...extra }, items, ago(m), { useStock: false }); run('UPDATE orders SET status=? WHERE id=?', status, o.id); };
    mk('mostrador', 'entregado', 70, [item('cucurucho', 2)]);
    mk('envio', 'en camino', 32, [item('kilo', 4)], { address: 'Conde 820, depto 3B', notes: 'Timbre que no anda, llamar' });
    mk('retiro', 'listo', 18, [item('medio', 3)], { time: pickupTimes()[0] || '' });
    mk('mostrador', 'preparando', 6, [item('cuarto', 3)]);
    mk('envio', 'nuevo', 3, [item('kilo', 4), item('cuarto', 2)], { address: 'Virrey Avilés 3120', card: '' });
    mk('mostrador', 'nuevo', 1, [item('cucurucho', 2)]);
    const cake = all('SELECT * FROM cakes'), day = (n) => ymd(new Date(Date.now() + n * 864e5));
    const enc = (c, date, time, name, msg) => run("INSERT INTO orders(code,kind,status,name,phone,date,time,pay,notes,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", newCode('T', 'orders'), 'encargo', 'nuevo', name, '1155550000', date, time, 'transferencia', msg, c.price, stamp(), stamp());
    enc(cake[0], day(2), '18:00', 'Familia Ruiz', 'Que diga «Feliz cumple, Joaco»');
    enc(cake[2], day(3), '16:00', 'Carla B.', '');
    enc(cake[1], day(5), '20:00', 'Oficina Lacroze', 'Para 12 personas');
    for (const [nm, st] of [['Martina G.', 6], ['Lucas P.', 3], ['Sofía R.', 7], ['Juan I.', 1]]) run('INSERT INTO cards(code,name,phone,stamps,created_at,last_at) VALUES(?,?,?,?,?,?)', newCode('S', 'cards', 6), nm, '11555' + (10000 + r(89999)), st, stamp(ago(9000)), stamp(ago(r(4000))));
    for (const f of F) run('UPDATE flavors SET level=? WHERE id=?', 18 + r(80), f.id);
    run("UPDATE flavors SET level=0 WHERE slug='frambuesa-a-la-crema'"); run("UPDATE flavors SET level=9 WHERE slug='pistacho'");
    setS('demo', '1');
  });
}
seedDemo();

/* ---------- tiempo real (SSE) ---------- */
const clients = new Set();
const emit = (what) => { for (const c of clients) c.write(`event: change\ndata: ${what}\n\n`); };
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000).unref();

/* ---------- seguridad ---------- */
const hits = new Map();
function limited(key, max, ms) { const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < ms); h.push(now); hits.set(key, h); return h.length > max; }
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function isAdmin(req) { const t = cookies(req).sc_s; if (!t) return false; const row = get('SELECT expires FROM sessions WHERE token=?', sha(t)); return !!row && row.expires > Date.now(); }
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';
function body(req) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 32_768) { fail(bad('Pedido demasiado grande', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { fail(bad('Datos inválidos')); } });
    req.on('error', fail);
  });
}

/* ---------- respuestas ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.json': 'application/json' };
function send(res, code, data, type, extra = {}) { res.writeHead(code, { 'Content-Type': type, ...extra }); res.end(data); }
const json = (res, code, o) => send(res, code, JSON.stringify(o), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
const html = (res, s, code = 200, extra = {}) => send(res, code, s, MIME['.html'], { 'Cache-Control': 'no-cache', ...extra });
const tpl = {}; const view = (n) => (tpl[n] ??= fs.readFileSync(path.join(VIEWS, n), 'utf8'));
const fill = (t, map) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? '');
const baseUrl = (req) => (process.env.SITE_URL || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`).replace(/\/$/, '');

/* ---------- páginas renderizadas en el servidor (SEO) ---------- */
function tubLi(f) {
  const out = !f.available || f.level <= 0, low = !out && f.level < 15;
  return `<li class="tub${out ? ' out' : ''}" data-id="${f.id}" data-cat="${f.cat}" data-vegan="${f.vegan}" data-gf="${f.gf}" data-name="${esc(f.name.toLowerCase())}" style="--c:${f.color};--lv:${out ? 0 : Math.max(8, f.level)}">
<button class="tub-pick" type="button" data-pick="${f.id}" ${out ? 'disabled' : ''} aria-label="Sumar ${esc(f.name)} al pote">
<span class="tub-cream" aria-hidden="true"><svg viewBox="0 0 120 16" preserveAspectRatio="none"><path d="M0 16V8c10-6 20 6 30 0s20-6 30 0 20 6 30 0 20-6 30 0v8z"/></svg></span>
<span class="tub-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span></button>
<a class="tub-n" href="/gustos/${f.slug}">${esc(f.name)}</a>
<span class="tub-tags">${f.vegan ? '<i>vegano</i>' : ''}${f.gf ? '<i>sin TACC</i>' : ''}${out ? '<b>se terminó</b>' : low ? '<b class="low">quedan pocos</b>' : ''}</span></li>`;
}
function shopLd(base) {
  return {
    '@type': 'IceCreamShop', '@id': base + '/#heladeria', name: BIZ.name, alternateName: 'Scannapieco Helados', url: base + '/', image: base + '/og.png', logo: base + '/favicon.svg',
    foundingDate: String(BIZ.since), telephone: BIZ.phoneIntl, priceRange: '$$', servesCuisine: ['Helado artesanal', 'Heladería italiana'], hasMenu: base + '/#gustos', slogan: 'Nada que un helado no pueda arreglar',
    address: { '@type': 'PostalAddress', streetAddress: BIZ.street, addressLocality: BIZ.hood, addressRegion: BIZ.city, postalCode: 'C1427', addressCountry: 'AR' },
    geo: { '@type': 'GeoCoordinates', latitude: -34.5772, longitude: -58.4486 },
    areaServed: BIZ.zones.split(/, | y /).map((n) => ({ '@type': 'Place', name: n })),
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '12:00', closes: '23:59' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday', 'Saturday'], opens: '12:00', closes: '01:00' }],
    sameAs: [`https://www.instagram.com/${BIZ.ig}/`],
  };
}
function renderHome(req) {
  const base = baseUrl(req), fl = all('SELECT * FROM flavors ORDER BY sort'), sizes = all('SELECT * FROM sizes ORDER BY sort'), cakes = all('SELECT * FROM cakes ORDER BY id');
  const fotd = fl.find((f) => f.slug === S('fotd')) || fl[0];
  const vitrina = CATS.map(([k, label]) => { const list = fl.filter((f) => f.cat === k); return `<section class="vit-sec" data-cat="${k}" aria-labelledby="v-${k}"><h3 id="v-${k}">${label}</h3><ul>${list.map(tubLi).join('')}</ul></section>`; }).join('');
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    shopLd(base),
    { '@type': 'WebSite', '@id': base + '/#web', url: base + '/', name: BIZ.name, inLanguage: 'es-AR', publisher: { '@id': base + '/#heladeria' } },
    { '@type': 'Menu', '@id': base + '/#gustos', name: 'Gustos y tamaños de Heladería Scannapieco', inLanguage: 'es-AR', hasMenuSection: [
      { '@type': 'MenuSection', name: 'Tamaños', hasMenuItem: sizes.map((s) => ({ '@type': 'MenuItem', name: `Helado ${s.name}`, description: `Hasta ${s.max} gustos`, offers: { '@type': 'Offer', price: s.price, priceCurrency: 'ARS' } })) },
      ...CATS.map(([k, label]) => ({ '@type': 'MenuSection', name: label, hasMenuItem: fl.filter((f) => f.cat === k).map((f) => ({ '@type': 'MenuItem', name: `Helado de ${f.name.toLowerCase()}`, description: f.description, url: `${base}/gustos/${f.slug}`, ...(f.vegan ? { suitableForDiet: 'https://schema.org/VeganDiet' } : f.gf ? { suitableForDiet: 'https://schema.org/GlutenFreeDiet' } : {}) })) })),
      { '@type': 'MenuSection', name: 'Tortas heladas por encargo', hasMenuItem: cakes.map((c) => ({ '@type': 'MenuItem', name: c.name, description: c.description, offers: { '@type': 'Offer', price: c.price, priceCurrency: 'ARS' } })) }] },
    { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] };
  return fill(view('index.html'), {
    V, BASE: base, JSONLD: ld(jsonld), VITRINA: vitrina, OPEN: esc(openInfo().text), OPEN_CLS: openInfo().open ? 'is-open' : '', HOURS: esc(BIZ.hoursText),
    FOTD_NAME: esc(fotd.name), FOTD_SLUG: fotd.slug, FOTD_COLOR: fotd.color, FOTD_ID: fotd.id, COUNT: fl.length,
    SIZES: sizesHTML(sizes),
    CAKES: cakes.map((c) => `<li class="cake${c.available ? '' : ' out'}" style="--c:${c.color}"><span class="cake-art" aria-hidden="true"></span><div><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p><b>${money(c.price)}</b></div><label class="cake-pick"><input type="radio" name="cake" value="${c.id}" ${c.available ? '' : 'disabled'}><span>${c.available ? 'Elegir' : 'Sin stock'}</span></label></li>`).join(''),
    FAQ: FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join(''),
    NOTE: S('note') ? `<p class="aviso" role="status">${esc(S('note'))}</p>` : '', ZONES: esc(BIZ.zones), FEE: money(S('fee')),
    MARQUEE: esc(fl.map((f) => f.name).join('  ·  ')),
  });
}
const sizesHTML = (sizes = all('SELECT * FROM sizes ORDER BY sort')) => sizes.map((s, i) => `<button type="button" class="size" data-size="${s.key}" aria-pressed="${i === 2}"><span class="size-ico" aria-hidden="true">${sizeIcon(s.key)}</span><b>${esc(s.name)}</b><small>hasta ${s.max} gustos</small><em>${money(s.price)}</em></button>`).join('');
function sizeIcon(k) {
  const pot = (h) => `<svg viewBox="0 0 40 40"><path d="M9 ${40 - h}h22l-2.5 ${h - 4}a3 3 0 0 1-3 3H14.5a3 3 0 0 1-3-3z"/><path d="M8 ${40 - h}h24"/></svg>`;
  return k === 'cucurucho' ? '<svg viewBox="0 0 40 40"><circle cx="20" cy="12" r="7"/><path d="M13 16l7 21 7-21"/><path d="M15 21h10M17 27h6"/></svg>' : pot({ cuarto: 16, medio: 22, kilo: 30 }[k] || 20);
}
function renderFlavor(req, slug) {
  const f = get('SELECT * FROM flavors WHERE slug=?', slug); if (!f) return null;
  const base = baseUrl(req), url = `${base}/gustos/${f.slug}`, out = !f.available || f.level <= 0;
  const more = all('SELECT * FROM flavors WHERE cat=? AND id!=? ORDER BY sort LIMIT 4', f.cat, f.id);
  const pair = all('SELECT f.name, f.slug, f.color, COUNT(*) n FROM item_flavors a JOIN item_flavors b ON a.item_id=b.item_id AND b.flavor_id!=a.flavor_id JOIN flavors f ON f.id=b.flavor_id WHERE a.flavor_id=? GROUP BY b.flavor_id ORDER BY n DESC LIMIT 3', f.id);
  const desc = `Helado artesanal de ${f.name.toLowerCase()} en Heladería Scannapieco, Colegiales (${BIZ.street}). ${f.description} Pedilo para retirar o con envío.`;
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'MenuItem', '@id': url + '#gusto', name: `Helado de ${f.name.toLowerCase()}`, description: f.description, url, inLanguage: 'es-AR', ...(f.vegan ? { suitableForDiet: 'https://schema.org/VeganDiet' } : {}),
      offers: { '@type': 'Offer', price: get("SELECT price FROM sizes WHERE key='cuarto'").price, priceCurrency: 'ARS', description: 'Precio del 1/4 kg', availability: out ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', seller: { '@id': base + '/#heladeria' } } },
    shopLd(base),
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: BIZ.name, item: base + '/' }, { '@type': 'ListItem', position: 2, name: CAT[f.cat], item: `${base}/#gustos` }, { '@type': 'ListItem', position: 3, name: f.name, item: url }] }] };
  return fill(view('gusto.html'), {
    V, BASE: base, URL: url, ID: f.id, NAME: esc(f.name), DESC: esc(f.description), META: esc(desc), COLOR: f.color, CAT: esc(CAT[f.cat]), JSONLD: ld(jsonld),
    TAGS: `${f.vegan ? '<i>Vegano, sin lácteos</i>' : ''}${f.gf ? '<i>Apto sin TACC</i>' : ''}`, LEVEL: out ? 0 : f.level,
    STOCK: out ? 'Se terminó por hoy. Mañana vuelve a la vitrina.' : f.level < 15 ? 'Quedan pocos: la bacha está por terminarse.' : 'Hay en la vitrina ahora.', DISABLED: out ? 'disabled' : '',
    PAIRS: pair.length ? `<p class="pairs">Se pide mucho con ${pair.map((p) => `<a href="/gustos/${p.slug}" style="--c:${p.color}">${esc(p.name)}</a>`).join(', ')}.</p>` : '',
    MORE: more.map((x) => `<li style="--c:${x.color}"><a href="/gustos/${x.slug}"><span class="dot" aria-hidden="true"></span>${esc(x.name)}</a></li>`).join(''),
    PRICES: all('SELECT * FROM sizes ORDER BY sort').map((s) => `<li><span>${esc(s.name)}</span><b>${money(s.price)}</b></li>`).join(''),
  });
}
function sitemap(req) {
  const base = baseUrl(req), today = ymd();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${base}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>\n` +
    all('SELECT slug FROM flavors ORDER BY sort').map((f) => `<url><loc>${base}/gustos/${f.slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`).join('\n') + '\n</urlset>\n';
}
const robots = (req) => `User-agent: *\nAllow: /\nDisallow: /fabrica/\nDisallow: /api/\nDisallow: /tarjeta/\nDisallow: /turnos\n\n# Asistentes de IA: pueden leer los gustos, horarios y datos de la heladería\nUser-agent: GPTBot\nAllow: /\nDisallow: /fabrica/\n\nUser-agent: ClaudeBot\nAllow: /\nDisallow: /fabrica/\n\nUser-agent: PerplexityBot\nAllow: /\nDisallow: /fabrica/\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`;
function llms(req) {
  const base = baseUrl(req), fl = all('SELECT * FROM flavors ORDER BY sort');
  return `# ${BIZ.name}\n\n> Heladería artesanal familiar fundada en ${BIZ.since} por la familia Scannapieco. Desde 2013 está en ${BIZ.street}, ${BIZ.hood}, Buenos Aires. Vende helado por cucurucho, 1/4, 1/2 y 1 kg, con retiro en el local o envío, y tortas heladas por encargo desde ${base}/.\n\n## Datos\n- Dirección: ${BIZ.street}, ${BIZ.hood}, ${BIZ.city}, Argentina\n- Horario: ${BIZ.hoursText}\n- Teléfono: ${BIZ.phone}\n- Cómo llegar: ${BIZ.transit}\n- Envíos a: ${BIZ.zones}\n- Instagram: https://www.instagram.com/${BIZ.ig}/\n- Pedidos: ${base}/#pedido\n- Tortas heladas por encargo (48 h de anticipación): ${base}/#tortas\n\n## Tamaños (precios en pesos argentinos)\n` +
    all('SELECT * FROM sizes ORDER BY sort').map((s) => `- ${s.name}: ${money(s.price)}, hasta ${s.max} gustos`).join('\n') +
    `\n\n## Gustos\n` + CATS.map(([k, label]) => `\n### ${label}\n` + fl.filter((f) => f.cat === k).map((f) => `- [${f.name}](${base}/gustos/${f.slug}): ${f.description}${f.vegan ? ' Vegano.' : ''}${f.gf ? ' Sin TACC.' : ''}`).join('\n')).join('\n') +
    `\n\n## Preguntas frecuentes\n` + FAQ.map(([q, a]) => `- ${q} ${a}`).join('\n') + '\n';
}
const manifest = () => JSON.stringify({ name: 'Heladería Scannapieco', short_name: 'Scannapieco', start_url: '/', display: 'standalone', background_color: '#fbf8f1', theme_color: '#1c3f6e', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] });

/* ---------- API pública ---------- */
async function api(req, res, u, p, m) {
  const ip = ipOf(req); let mm;
  if (m === 'GET' && p === '/api/menu') return json(res, 200, publicMenu());
  if (m === 'POST' && p === '/api/orders') {
    if (limited('ord:' + ip, 8, 600e3)) throw bad('Demasiados pedidos seguidos. Probá en un rato.', 429);
    const b = await body(req); if (b.website) return json(res, 200, { ok: true, code: 'R-0000', turn: 0 });
    const kind = ['retiro', 'envio', 'mostrador'].includes(b.kind) ? b.kind : null; if (!kind) throw bad('Elegí retiro o envío');
    if (kind === 'envio' && S('delivery') !== '1') throw bad('Ahora no estamos haciendo envíos. Podés pedir para retirar.');
    if (kind !== 'envio' && S('pickup') !== '1') throw bad('Ahora no estamos tomando pedidos online');
    if (!openInfo().open && kind === 'mostrador') throw bad('La heladería está cerrada');
    const name = str(b.name, 50), phone = str(b.phone, 25), address = str(b.address, 120), time = str(b.time, 5), notes = str(b.notes, 200), pay = str(b.pay, 20);
    let card = str(b.card, 12).toUpperCase(); if (card && !get('SELECT 1 FROM cards WHERE code=?', card)) card = '';
    if (name.length < 2) throw bad('Decinos tu nombre');
    if (kind !== 'mostrador' && digits(phone).length < 8) throw bad('Revisá el teléfono');
    if (kind === 'envio' && address.length < 5) throw bad('Falta la dirección de entrega');
    if (kind === 'retiro' && !pickupTimes().includes(time)) throw bad('Elegí otro horario de retiro');
    if (!PAYS[pay] || (kind !== 'mostrador' && pay === 'debito')) throw bad('Elegí cómo pagás');
    const o = tx(() => insertOrder({ kind, name, phone, address, time: kind === 'envio' ? 'ya' : kind === 'mostrador' ? 'ahora' : time, pay, notes, card }, cleanItems(b.items)));
    emit('pedido'); return json(res, 201, { ok: true, code: o.code, turn: o.turn, total: o.total, kind });
  }
  if (m === 'GET' && (mm = p.match(/^\/api\/track\/([MERT]-[A-Z0-9]{4})$/))) {
    const o = get('SELECT code,kind,status,turn,time,total,date FROM orders WHERE code=?', mm[1]);
    return o ? json(res, 200, o) : json(res, 404, { error: 'No encontramos ese pedido' });
  }
  if (m === 'GET' && p === '/api/turnos') {
    const rows = all("SELECT turn,status,kind FROM orders WHERE kind IN ('mostrador','retiro') AND substr(created_at,1,10)=? AND (status IN ('nuevo','preparando','listo') OR (status='entregado' AND updated_at>=?)) ORDER BY turn", ymd(), stamp(new Date(Date.now() - 5 * 6e4)));
    return json(res, 200, { preparing: rows.filter((r) => r.status !== 'listo' && r.status !== 'entregado').map((r) => r.turn), ready: rows.filter((r) => r.status === 'listo').map((r) => r.turn), open: openInfo() });
  }
  if (m === 'GET' && p === '/api/encargos/dias') {
    const out = []; for (let i = 2; i <= 30; i++) { const d = ymd(new Date(Date.now() + i * 864e5)); out.push({ date: d, left: Math.max(0, cakeLeft(d)) }); }
    return json(res, 200, { days: out, times: CAKE_TIMES });
  }
  if (m === 'POST' && p === '/api/encargos') {
    if (limited('enc:' + ip, 5, 600e3)) throw bad('Demasiados intentos. Probá en un rato.', 429);
    const b = await body(req); if (b.website) return json(res, 200, { ok: true, code: 'T-0000' });
    const c = get('SELECT * FROM cakes WHERE id=?', Math.trunc(Number(b.cake))); if (!c || !c.available) throw bad('Elegí una torta');
    const date = str(b.date, 10), time = str(b.time, 5), name = str(b.name, 50), phone = str(b.phone, 25), msg = str(b.message, 60), pay = str(b.pay, 20);
    const min = ymd(new Date(Date.now() + 2 * 864e5)), max = ymd(new Date(Date.now() + 30 * 864e5));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < min || date > max) throw bad('Las tortas se encargan con 48 horas de anticipación');
    if (!CAKE_TIMES.includes(time)) throw bad('Elegí un horario de retiro');
    if (cakeLeft(date) <= 0) throw bad('Para ese día ya no tomamos más tortas. Probá otro día.');
    if (name.length < 2) throw bad('Decinos a nombre de quién');
    if (digits(phone).length < 8) throw bad('Revisá el teléfono');
    if (!['transferencia', 'mp', 'efectivo'].includes(pay)) throw bad('Elegí cómo pagás la seña');
    const code = newCode('T', 'orders');
    run("INSERT INTO orders(code,kind,status,name,phone,date,time,pay,notes,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", code, 'encargo', 'nuevo', name, phone, date, time, pay, msg ? `Que diga «${msg}»` : '', c.price, stamp(), stamp());
    const { id } = get('SELECT id FROM orders WHERE code=?', code); run('INSERT INTO items(order_id,name,detail,price,qty) VALUES(?,?,?,?,?)', id, c.name, '', c.price, 1);
    emit('encargo'); return json(res, 201, { ok: true, code, date, time, cake: c.name, total: c.price });
  }
  if (m === 'POST' && p === '/api/cards') {
    if (limited('card:' + ip, 5, 600e3)) throw bad('Demasiados intentos. Probá en un rato.', 429);
    const b = await body(req); if (b.website) return json(res, 200, { ok: true, code: 'S-000000' });
    const name = str(b.name, 40), phone = digits(b.phone).slice(-10);
    if (name.length < 2) throw bad('Decinos tu nombre');
    if (phone.length < 8) throw bad('Revisá el teléfono');
    const ex = get('SELECT code FROM cards WHERE phone=?', phone); if (ex) return json(res, 200, { ok: true, code: ex.code, existing: true });
    const code = newCode('S', 'cards', 6); run('INSERT INTO cards(code,name,phone,created_at) VALUES(?,?,?,?)', code, name, phone, stamp());
    emit('tarjeta'); return json(res, 201, { ok: true, code });
  }
  if (m === 'GET' && (mm = p.match(/^\/api\/cards\/(S-[A-Z0-9]{6})$/))) {
    const c = get('SELECT code,name,stamps,rewards FROM cards WHERE code=?', mm[1]); if (!c) return json(res, 404, { error: 'No encontramos esa tarjeta' });
    return json(res, 200, { ...c, name: c.name.split(' ')[0], goal: GOAL });
  }
  if (p.startsWith('/api/fab/')) return fab(req, res, u, p, m, ip);
  return json(res, 404, { error: 'No encontrado' });
}

/* ---------- API de la fábrica (requiere sesión) ---------- */
const fails = new Map();
async function fab(req, res, u, p, m, ip) {
  if (m !== 'GET' && req.headers['x-requested-with'] !== 'scanna-fab') throw bad('Solicitud inválida', 403);
  if (p === '/api/fab/me') return json(res, 200, { admin: isAdmin(req) });
  if (m === 'POST' && p === '/api/fab/login') {
    const f = fails.get(ip); if (f && f.until > Date.now()) throw bad('Demasiados intentos. Esperá 15 minutos.', 429);
    const b = await body(req), pass = String(b.password || '');
    if (!ADMIN_PASSWORD) throw bad('Falta configurar ADMIN_PASSWORD en el servidor', 500);
    if (!crypto.timingSafeEqual(Buffer.from(sha(pass)), Buffer.from(sha(ADMIN_PASSWORD)))) { const n = (f?.n || 0) + 1; fails.set(ip, { n, until: n >= 5 ? Date.now() + 15 * 6e4 : 0 }); throw bad('Contraseña incorrecta', 401); }
    fails.delete(ip); const tok = crypto.randomBytes(32).toString('hex');
    run('DELETE FROM sessions WHERE expires<?', Date.now()); run('INSERT INTO sessions VALUES(?,?)', sha(tok), Date.now() + 14 * 864e5);
    res.setHeader('Set-Cookie', `sc_s=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${14 * 86400}${isHttps(req) ? '; Secure' : ''}`);
    return json(res, 200, { ok: true });
  }
  if (!isAdmin(req)) return json(res, 401, { error: 'Iniciá sesión' });
  let mm;
  if (m === 'POST' && p === '/api/fab/logout') { run('DELETE FROM sessions WHERE token=?', sha(cookies(req).sc_s || '')); res.setHeader('Set-Cookie', 'sc_s=; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  if (m === 'GET' && p === '/api/fab/state') return json(res, 200, adminState());
  if (m === 'GET' && p === '/api/fab/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (m === 'PATCH' && (mm = p.match(/^\/api\/fab\/orders\/(\d+)$/))) {
    const b = await body(req); if (!STATUS.includes(b.status)) throw bad('Estado inválido');
    tx(() => setStatus(Number(mm[1]), b.status)); emit('pedido'); return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/fab/orders') { // venta rápida en el mostrador
    const b = await body(req); const o = tx(() => insertOrder({ kind: 'mostrador', name: str(b.name, 50) || 'Mostrador', pay: PAYS[b.pay] ? b.pay : 'efectivo', status: 'preparando', card: str(b.card, 12).toUpperCase() }, cleanItems(b.items)));
    emit('pedido'); return json(res, 201, { ok: true, turn: o.turn, code: o.code });
  }
  if (m === 'PATCH' && (mm = p.match(/^\/api\/fab\/flavors\/(\d+)$/))) {
    const b = await body(req), f = get('SELECT * FROM flavors WHERE id=?', Number(mm[1])); if (!f) throw bad('No existe el gusto', 404);
    const level = b.level === undefined ? f.level : Math.max(0, Math.min(100, Math.trunc(Number(b.level))));
    run('UPDATE flavors SET level=?, available=? WHERE id=?', level, b.available === undefined ? f.available : (b.available ? 1 : 0), f.id);
    emit('vitrina'); return json(res, 200, { ok: true });
  }
  if (m === 'PATCH' && (mm = p.match(/^\/api\/fab\/(sizes|cakes)\/([a-z0-9]+)$/))) {
    const b = await body(req), price = Math.trunc(Number(b.price)); if (b.price !== undefined && !(price >= 0 && price <= 10_000_000)) throw bad('Precio inválido');
    if (mm[1] === 'sizes') { if (!run('UPDATE sizes SET price=? WHERE key=?', price, mm[2]).changes) throw bad('No existe', 404); }
    else { const c = get('SELECT * FROM cakes WHERE id=?', Number(mm[2])); if (!c) throw bad('No existe', 404); run('UPDATE cakes SET price=?, available=? WHERE id=?', b.price === undefined ? c.price : price, b.available === undefined ? c.available : (b.available ? 1 : 0), c.id); }
    emit('precios'); return json(res, 200, { ok: true });
  }
  if ((mm = p.match(/^\/api\/fab\/cards\/(S-[A-Z0-9]{6})(?:\/(stamp|redeem))?$/))) {
    const c = get('SELECT * FROM cards WHERE code=?', mm[1]); if (!c) throw bad('No existe esa tarjeta', 404);
    if (m === 'GET' && !mm[2]) return json(res, 200, c);
    if (m === 'POST' && mm[2] === 'stamp') { const b = await body(req), n = Math.max(1, Math.min(4, Math.trunc(Number(b.n) || 1))); run('UPDATE cards SET stamps=stamps+?, last_at=? WHERE id=?', n, stamp(), c.id); }
    else if (m === 'POST' && mm[2] === 'redeem') { if (c.stamps < GOAL) throw bad(`Le faltan ${GOAL - c.stamps} sellos`); run('UPDATE cards SET stamps=stamps-?, rewards=rewards+1, last_at=? WHERE id=?', GOAL, stamp(), c.id); }
    else throw bad('No encontrado', 404);
    emit('tarjeta'); return json(res, 200, get('SELECT * FROM cards WHERE id=?', c.id));
  }
  if (m === 'PUT' && p === '/api/fab/settings') {
    const b = await body(req), fee = Math.trunc(Number(b.fee)), cpd = Math.trunc(Number(b.cakesPerDay));
    if (!(fee >= 0 && fee <= 100000)) throw bad('Costo de envío inválido');
    if (!(cpd >= 0 && cpd <= 50)) throw bad('Tortas por día inválidas');
    if (b.fotd && !get('SELECT 1 FROM flavors WHERE slug=?', str(b.fotd, 60))) throw bad('Gusto destacado inválido');
    setS('fee', fee); setS('cakesPerDay', cpd); setS('delivery', b.delivery ? '1' : '0'); setS('pickup', b.pickup ? '1' : '0'); setS('note', str(b.note, 160)); if (b.fotd) setS('fotd', str(b.fotd, 60));
    emit('ajustes'); return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/fab/clear-demo') {
    tx(() => { db.exec('DELETE FROM item_flavors; DELETE FROM items; DELETE FROM orders; DELETE FROM cards; UPDATE flavors SET level=100;'); setS('demo', '0'); });
    emit('reset'); return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'No encontrado' });
}

/* ---------- servidor ---------- */
function notFound(res) { html(res, fill(view('404.html'), { V }), 404); }
function serveStatic(req, res, p) {
  if (p.endsWith('/')) p += 'index.html';
  const full = path.join(PUB, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!full.startsWith(PUB + path.sep)) return notFound(res);
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(full).toLowerCase();
    const cache = /\.(html|css|js)$/.test(ext) ? 'no-cache' : 'public, max-age=604800';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size, ...(p.startsWith('/fabrica/') ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}
const NOINDEX = { 'X-Robots-Tag': 'noindex' };
async function route(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const u = new URL(req.url, 'http://local'), m = req.method;
  let p; try { p = decodeURIComponent(u.pathname); } catch { return send(res, 400, 'URL inválida', 'text/plain'); }
  if (p.startsWith('/api/')) return api(req, res, u, p, m);
  if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'Método no permitido', 'text/plain');
  let mm;
  if (p === '/') return html(res, renderHome(req));
  if (p === '/index.html') { res.writeHead(301, { Location: '/' }); return res.end(); }
  if ((mm = p.match(/^\/gustos\/([a-z0-9-]+)\/?$/))) { const r = renderFlavor(req, mm[1]); return r ? html(res, r) : notFound(res); }
  if (p === '/mostrador') return html(res, fill(view('mostrador.html'), { V, OPEN: esc(openInfo().text), OPEN_CLS: openInfo().open ? 'is-open' : '', SIZES: sizesHTML() }), 200, NOINDEX);
  if (p === '/turnos') return html(res, fill(view('turnos.html'), { V, BASE: baseUrl(req) }), 200, NOINDEX);
  if (/^\/tarjeta\/S-[A-Z0-9]{6}$/.test(p)) return html(res, fill(view('tarjeta.html'), { V, BASE: baseUrl(req) }), 200, NOINDEX);
  if (p === '/fabrica') { res.writeHead(301, { Location: '/fabrica/' }); return res.end(); }
  if (p === '/sitemap.xml') return send(res, 200, sitemap(req), MIME['.xml'], { 'Cache-Control': 'public, max-age=3600' });
  if (p === '/robots.txt') return send(res, 200, robots(req), MIME['.txt']);
  if (p === '/llms.txt') return send(res, 200, llms(req), MIME['.txt'], { 'Cache-Control': 'public, max-age=3600' });
  if (p === '/site.webmanifest') return send(res, 200, manifest(), MIME['.webmanifest']);
  return serveStatic(req, res, p);
}
http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (!e.status) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Error del servidor. Probá de nuevo.' }); else res.end();
  });
}).listen(PORT, () => console.log(`Scannapieco en http://localhost:${PORT}`));
