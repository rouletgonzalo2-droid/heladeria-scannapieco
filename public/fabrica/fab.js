// La Fábrica — panel interno de Heladería Scannapieco.
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KIND = { mostrador: 'Mostrador', retiro: 'Retiro', envio: 'Envío', encargo: 'Encargo' };
  let S = null, tab = 'pedidos', es = null, seenIds = null;
  async function api(url, method = 'GET', body) {
    const r = await fetch('/api/fab/' + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'scanna-fab' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== 'login') { showLogin(); throw new Error('Iniciá sesión'); }
    if (!r.ok) throw new Error(j.error || 'Error');
    return j;
  }
  let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800); }
  const act = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

  /* ---------- sesión ---------- */
  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; es?.close(); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#loginErr').textContent = '';
    try { await api('login', 'POST', { password: e.target.password.value }); e.target.reset(); start(); } catch (er) { $('#loginErr').textContent = er.message; }
  });
  $('#logout').addEventListener('click', act(async () => { await api('logout', 'POST'); showLogin(); }));
  async function start() { $('#login').hidden = true; $('#app').hidden = false; await load(); connect(); }
  function connect() {
    es?.close(); es = new EventSource('/api/fab/stream');
    es.addEventListener('change', () => load()); es.onopen = () => $('#live').classList.remove('off'); es.onerror = () => $('#live').classList.add('off');
  }
  setInterval(() => { if (!$('#app').hidden) load(); }, 30000);

  /* ---------- pestañas ---------- */
  const TITLES = { pedidos: 'Pedidos', vitrina: 'Vitrina', encargos: 'Tortas por encargo', sellos: 'Tarjetas de sellos', produccion: 'Producción de mañana', caja: 'Caja', ajustes: 'Ajustes' };
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; tab = b.dataset.tab; try { localStorage.setItem('fab_tab', tab); } catch {} render(); });
  try { tab = localStorage.getItem('fab_tab') || 'pedidos'; } catch {}

  async function load() {
    const st = await api('state'); const before = seenIds;
    seenIds = new Set(st.board.map((o) => o.id));
    if (before) { const nu = st.board.filter((o) => !before.has(o.id) && o.status === 'nuevo'); if (nu.length) { beep(); toast(`Pedido nuevo: turno ${nu[0].turn}`); st._fresh = new Set(nu.map((o) => o.id)); } }
    S = st; render();
  }
  let actx; function beep() { try { actx = actx || new AudioContext(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + .02); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .4); o.start(); o.stop(actx.currentTime + .45); } catch {} }

  function render() {
    if (!S) return;
    $$('#tabs button').forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    $$('.view').forEach((v) => (v.hidden = v.id !== 'v-' + tab));
    $('#title').textContent = TITLES[tab]; $('#demo').hidden = S.settings.demo !== '1';
    const nNew = S.board.filter((o) => o.status === 'nuevo').length, nLow = S.flavors.filter((f) => f.level < 15 || !f.available).length, nEnc = S.encargos.filter((o) => o.status === 'nuevo').length;
    $('#nNew').textContent = nNew || ''; $('#nLow').textContent = nLow || ''; $('#nEnc').textContent = nEnc || '';
    ({ pedidos, vitrina, encargos, sellos, produccion, caja, ajustes })[tab]();
  }
  setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); if (tab === 'pedidos' && S) $$('.age[data-t]').forEach(age); }, 15000);
  $('#clock').textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mins = (ts) => Math.max(0, Math.round((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 6e4));
  function age(el) { const m = mins(el.dataset.t); el.textContent = m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; el.classList.toggle('late', m >= 15 && el.dataset.s !== 'entregado'); }

  /* ---------- pedidos ---------- */
  const NEXT = (o) => ({ nuevo: ['preparando', 'Preparar'], preparando: ['listo', 'Está listo'], listo: o.kind === 'envio' ? ['en camino', 'Salió'] : ['entregado', 'Entregado'], 'en camino': ['entregado', 'Entregado'] }[o.status]);
  function ordCard(o) {
    const nx = NEXT(o), done = o.status === 'entregado' || o.status === 'cancelado';
    return `<article class="ord${done ? ' done' : ''}${S._fresh?.has(o.id) ? ' fresh' : ''}">
      <div class="ord-top"><span class="turn">${o.turn}</span><span class="tag ${o.kind}">${KIND[o.kind]}${o.kind === 'retiro' && o.time ? ' ' + esc(o.time) : ''}</span><span class="age" data-t="${o.created_at}" data-s="${o.status}"></span></div>
      <div><b>${esc(o.name)}</b>${o.phone ? ` · <a href="https://wa.me/549${esc(o.phone.replace(/\D/g, '').slice(-10))}" target="_blank" rel="noopener">${esc(o.phone)}</a>` : ''}${o.card ? ` · <span class="tag">${esc(o.card)}</span>` : ''}</div>
      <ul>${o.items.map((i) => `<li><b>${i.qty > 1 ? i.qty + ' × ' : ''}${esc(i.name)}</b><small>${esc(i.detail)}</small></li>`).join('')}</ul>
      ${o.address ? `<div><b>Dirección:</b> ${esc(o.address)}</div>` : ''}${o.notes ? `<div class="note">${esc(o.notes)}</div>` : ''}
      <div class="ord-foot"><span class="tot">${money(o.total)} <small class="muted">${esc(S.pays[o.pay] || o.pay)}</small></span>${nx ? `<button class="b b-sm ${nx[0] === 'entregado' ? 'b-ok' : 'b-solid'}" data-st="${o.id}:${nx[0]}">${nx[1]}</button>` : ''}${!done ? `<button class="b b-sm b-ghost" data-st="${o.id}:cancelado" data-confirm="¿Cancelar el pedido del turno ${o.turn}?">Cancelar</button>` : ''}</div></article>`;
  }
  function pedidos() {
    const B = S.board, cols = [['Nuevos', B.filter((o) => o.status === 'nuevo')], ['Preparando', B.filter((o) => o.status === 'preparando')], ['Listos y en camino', B.filter((o) => o.status === 'listo' || o.status === 'en camino')], ['Entregados (3 h)', B.filter((o) => o.status === 'entregado' || o.status === 'cancelado').reverse()]];
    $('#v-pedidos').innerHTML = `<div class="kanban">${cols.map(([t, l]) => `<div class="col"><div class="col-h">${t}<span>${l.length}</span></div>${l.length ? l.map(ordCard).join('') : '<div class="empty-s">Nada por acá</div>'}</div>`).join('')}</div>`;
    $$('.age[data-t]').forEach(age); S._fresh = null;
  }
  document.addEventListener('click', act(async (e) => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
    const [id, st] = b.dataset.st.split(':'); b.disabled = true; await api('orders/' + id, 'PATCH', { status: st }); await load();
  }));

  /* ---------- vitrina ---------- */
  function vitrina() {
    $('#v-vitrina').innerHTML = `<p class="muted" style="margin:0 0 14px">Cada pedido baja el nivel de la bacha solo. Cuando la reponés, tocá <b>Llena</b>. Lo que marques acá se ve al instante en la web.</p>
    <div class="tubs">${S.flavors.map((f) => { const out = !f.available || f.level <= 0; return `<div class="tubrow${out ? ' out' : f.level < 15 ? ' low' : ''}"><span class="mini-tub" style="--c:${f.color};--lv:${f.level}"><i></i></span><div><h3>${esc(f.name)}<span>${out ? 'Agotado' : f.level + '%'}</span></h3>
      <div class="ctrl"><input type="range" min="0" max="100" step="5" value="${f.level}" data-lv="${f.id}" aria-label="Nivel de ${esc(f.name)}"><button class="b b-sm b-line" data-full="${f.id}">Llena</button></div>
      <label class="sw" style="margin-top:6px"><input type="checkbox" data-av="${f.id}" ${f.available ? 'checked' : ''}> En vitrina</label></div></div>`; }).join('')}</div>
    <div class="grid2" style="margin-top:22px"><div class="card"><h2 class="h3">Precios por tamaño</h2><div class="prices">${S.sizes.map((s) => `<div class="row"><span><b>${esc(s.name)}</b> <small class="muted">hasta ${s.max} gustos</small></span><input type="number" min="0" step="100" value="${s.price}" data-size="${s.key}" aria-label="Precio ${esc(s.name)}"><button class="b b-sm b-line" data-savesize="${s.key}">Guardar</button></div>`).join('')}</div></div>
    <div class="card"><h2 class="h3">Tortas heladas</h2><div class="prices">${S.cakes.map((c) => `<div class="row"><span><b>${esc(c.name)}</b><br><label class="sw"><input type="checkbox" data-cakeav="${c.id}" ${c.available ? 'checked' : ''}> Disponible</label></span><input type="number" min="0" step="100" value="${c.price}" data-cake="${c.id}" aria-label="Precio ${esc(c.name)}"><button class="b b-sm b-line" data-savecake="${c.id}">Guardar</button></div>`).join('')}</div></div></div>`;
    const v = $('#v-vitrina');
    $$('[data-lv]', v).forEach((r) => { r.addEventListener('input', () => { const row = r.closest('.tubrow'); $('.mini-tub', row).style.setProperty('--lv', r.value); $('h3 span', row).textContent = r.value + '%'; }); r.addEventListener('change', act(() => api('flavors/' + r.dataset.lv, 'PATCH', { level: Number(r.value) }))); });
    $$('[data-full]', v).forEach((b) => b.addEventListener('click', act(async () => { await api('flavors/' + b.dataset.full, 'PATCH', { level: 100, available: true }); toast('Bacha repuesta'); })));
    $$('[data-av]', v).forEach((c) => c.addEventListener('change', act(() => api('flavors/' + c.dataset.av, 'PATCH', { available: c.checked }))));
    $$('[data-savesize]', v).forEach((b) => b.addEventListener('click', act(async () => { await api('sizes/' + b.dataset.savesize, 'PATCH', { price: Number($(`[data-size="${b.dataset.savesize}"]`, v).value) }); toast('Precio guardado'); })));
    $$('[data-savecake]', v).forEach((b) => b.addEventListener('click', act(async () => { await api('cakes/' + b.dataset.savecake, 'PATCH', { price: Number($(`[data-cake="${b.dataset.savecake}"]`, v).value) }); toast('Precio guardado'); })));
    $$('[data-cakeav]', v).forEach((c) => c.addEventListener('change', act(() => api('cakes/' + c.dataset.cakeav, 'PATCH', { available: c.checked }))));
  }

  /* ---------- encargos ---------- */
  function encargos() {
    const by = {}; S.encargos.forEach((o) => (by[o.date] ??= []).push(o));
    const days = Object.keys(by);
    $('#v-encargos').innerHTML = days.length ? days.map((d) => `<h2 class="day-h">${new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>${by[d].map((o) => { const nx = { nuevo: ['preparando', 'En la fábrica'], preparando: ['listo', 'Lista'], listo: ['entregado', 'Retirada'] }[o.status];
      return `<div class="card enc" style="margin-bottom:8px"><span class="time">${esc(o.time)}</span><div><b>${esc(o.items[0]?.name || 'Torta')}</b> · ${esc(o.name)} · <a href="https://wa.me/549${esc(o.phone.replace(/\D/g, '').slice(-10))}" target="_blank" rel="noopener">${esc(o.phone)}</a><br><span class="muted">${esc(o.notes || 'Sin mensaje')} · Seña: ${esc(S.pays[o.pay] || o.pay)} · ${money(o.total)} · ${esc(o.code)}</span></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="st ${o.status}">${o.status}</span>${nx ? `<button class="b b-sm b-solid" data-st="${o.id}:${nx[0]}">${nx[1]}</button>` : ''}${o.status !== 'cancelado' && o.status !== 'entregado' ? `<button class="b b-sm b-ghost" data-st="${o.id}:cancelado" data-confirm="¿Cancelar este encargo?">Cancelar</button>` : ''}</div></div>`; }).join('')}`).join('') : '<div class="empty-s">No hay tortas encargadas.</div>';
  }

  /* ---------- sellos ---------- */
  let cq = '';
  function sellos() {
    const q = cq.toLowerCase(), list = S.cards.filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.phone.includes(q));
    $('#v-sellos').innerHTML = `<div class="cards-tools"><input id="cq" placeholder="Buscar por código, nombre o teléfono" value="${esc(cq)}"><button class="b b-solid" id="scanBtn" type="button">Escanear QR</button></div>
      <p class="muted" style="margin:0 0 12px">Cada pedido online entregado con tarjeta suma un sello solo. En el mostrador, sumalo acá. Con ${S.goal} sellos, el 1/4 kg va de regalo.</p>
      ${list.length ? list.map((c) => `<div class="crow" data-code="${c.code}"><div><b>${esc(c.name)}</b> · <span class="num">${esc(c.code)}</span><br><small class="muted">${esc(c.phone)} · ${c.rewards} premio${c.rewards === 1 ? '' : 's'} canjeado${c.rewards === 1 ? '' : 's'}</small></div><div class="dots" aria-label="${c.stamps} sellos">${Array.from({ length: S.goal }, (_, i) => `<i class="${i < c.stamps ? 'on' : ''}"></i>`).join('')}${c.stamps > S.goal ? `<b class="num">+${c.stamps - S.goal}</b>` : ''}</div><div style="display:flex;gap:6px"><button class="b b-sm b-solid" data-stamp="${c.code}">+1 sello</button><button class="b b-sm ${c.stamps >= S.goal ? 'b-ok' : 'b-line'}" data-redeem="${c.code}" ${c.stamps >= S.goal ? '' : 'disabled'}>Canjear 1/4</button></div></div>`).join('') : '<div class="empty-s">No encontramos tarjetas con eso.</div>'}`;
    const inp = $('#cq'); inp.addEventListener('input', () => { cq = inp.value; sellos(); const n = $('#cq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    $$('[data-stamp]').forEach((b) => b.addEventListener('click', act(async () => { const c = await api(`cards/${b.dataset.stamp}/stamp`, 'POST', { n: 1 }); toast(`${c.name}: ${c.stamps} sellos`); await load(); })));
    $$('[data-redeem]').forEach((b) => b.addEventListener('click', act(async () => { if (!confirm('¿Canjear el 1/4 kg de regalo?')) return; await api(`cards/${b.dataset.redeem}/redeem`, 'POST'); toast('Premio canjeado'); await load(); })));
    $('#scanBtn').addEventListener('click', scan);
  }
  let stream;
  async function scan() {
    const dlg = $('#scanDlg'), info = $('#scanInfo');
    if (!('BarcodeDetector' in window)) { const c = prompt('Este navegador no puede leer QR con la cámara. Escribí el código de la tarjeta (S-XXXXXX):'); if (c) { cq = c.trim().toUpperCase(); sellos(); } return; }
    dlg.showModal(); info.textContent = 'Apuntá la cámara al QR de la tarjeta.';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); const v = $('#scanVid'); v.srcObject = stream; await v.play();
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      const loop = async () => { if (!dlg.open) return; try { const r = await det.detect(v); const m = r[0]?.rawValue.match(/S-[A-Z0-9]{6}/); if (m) { stopScan(); cq = m[0]; tab = 'sellos'; render(); $(`.crow[data-code="${m[0]}"]`)?.classList.add('hit'); toast('Tarjeta ' + m[0]); return; } } catch {} requestAnimationFrame(loop); };
      loop();
    } catch { info.textContent = 'No pudimos abrir la cámara. Revisá el permiso del navegador.'; }
  }
  function stopScan() { stream?.getTracks().forEach((t) => t.stop()); $('#scanDlg').close(); }
  $('#scanClose').addEventListener('click', stopScan); $('#scanDlg').addEventListener('close', () => stream?.getTracks().forEach((t) => t.stop()));

  /* ---------- producción ---------- */
  function produccion() {
    const P = [...S.production].sort((a, b) => b.tubs - a.tubs || a.level - b.level), need = P.filter((p) => p.tubs > 0);
    $('#v-produccion').innerHTML = `<div class="grid3" style="margin-bottom:16px"><div class="card kpi"><small>Gustos para reponer</small><b>${need.length}</b></div><div class="card kpi"><small>Bachas a hacer</small><b>${need.reduce((t, p) => t + p.tubs, 0)}</b></div><div class="card kpi"><small>Kilos estimados</small><b>${(need.reduce((t, p) => t + p.tubs, 0) * 5).toLocaleString('es-AR')} kg</b></div></div>
      <div class="card"><p class="muted" style="margin:0 0 10px">Calculado con la venta promedio de los últimos 7 días, un 20 % de margen y lo que queda en cada bacha (bacha llena = 5 kg).</p>
      <table><thead><tr><th>Gusto</th><th class="r">Nivel ahora</th><th class="r">Venta por día</th><th class="r">Bachas a hacer</th></tr></thead><tbody>
      ${P.map((p) => `<tr class="${p.tubs > 0 ? 'need' : ''}"><td><span class="sw-dot" style="--c:${p.color}"></span>${esc(p.name)}</td><td class="r">${p.level}%</td><td class="r">${String(p.daily).replace('.', ',')} kg</td><td class="r">${p.tubs ? String(p.tubs).replace('.', ',') : '—'}</td></tr>`).join('')}</tbody></table>
      <div style="margin-top:14px"><button class="b b-line" type="button" onclick="print()">Imprimir plan</button></div></div>`;
  }

  /* ---------- caja ---------- */
  function caja() {
    const R = S.report, d = R.days, today = d[d.length - 1], max = Math.max(1, ...d.map((x) => x.sales)), W = 640, H = 200, bw = W / d.length;
    const topMax = Math.max(1, ...R.top.map((t) => t.g)), payT = R.pay.reduce((t, p) => t + p.s, 0) || 1, wk = d.reduce((t, x) => t + x.sales, 0);
    $('#v-caja').innerHTML = `<div class="kpis"><div class="card kpi"><small>Ventas de hoy</small><b>${money(today.sales)}</b></div><div class="card kpi"><small>Pedidos de hoy</small><b>${today.orders}</b></div><div class="card kpi"><small>Kilos de hoy</small><b>${String(today.kilos).replace('.', ',')}</b></div><div class="card kpi"><small>Ticket promedio</small><b>${money(today.orders ? Math.round(today.sales / today.orders) : 0)}</b></div></div>
      <div class="grid2"><div class="card chart"><h2 class="h3">Últimos 7 días · ${money(wk)}</h2><svg viewBox="0 0 ${W} ${H + 40}" role="img" aria-label="Ventas por día">${d.map((x, i) => { const h = Math.max(2, (x.sales / max) * H), dt = new Date(x.date + 'T12:00:00'); return `<g><rect class="bar-r${i === d.length - 1 ? ' today' : ''}" x="${i * bw + 10}" y="${H - h}" width="${bw - 20}" height="${h}" rx="6"><title>${money(x.sales)} · ${x.orders} pedidos · ${x.kilos} kg</title></rect><text x="${i * bw + bw / 2}" y="${H + 18}" text-anchor="middle">${dt.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')} ${dt.getDate()}</text><text x="${i * bw + bw / 2}" y="${H - h - 6}" text-anchor="middle">${Math.round(x.sales / 1000)}k</text></g>`; }).join('')}</svg></div>
      <div class="card"><h2 class="h3">Gustos más pedidos (7 días)</h2><div class="hbars">${R.top.map((t) => `<div class="hbar"><span>${esc(t.name)}</span><span class="track"><i style="width:${(t.g / topMax) * 100}%;--c:${t.color}"></i></span><span>${(t.g / 1000).toFixed(1).replace('.', ',')} kg</span></div>`).join('')}</div></div>
      <div class="card"><h2 class="h3">Cómo pagaron</h2><div class="hbars">${R.pay.map((p) => `<div class="hbar"><span>${esc(S.pays[p.pay] || p.pay)}</span><span class="track"><i style="width:${(p.s / payT) * 100}%"></i></span><span>${Math.round((p.s / payT) * 100)}%</span></div>`).join('')}</div></div>
      <div class="card"><h2 class="h3">Por canal</h2><table><tbody>${R.kinds.map((k) => `<tr><td>${KIND[k.kind] || k.kind}</td><td class="r">${k.n} pedidos</td><td class="r">${money(k.s)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------- ajustes ---------- */
  function ajustes() {
    const s = S.settings, base = location.origin;
    $('#v-ajustes').innerHTML = `<div class="grid2"><form class="card" id="setForm" style="display:grid;gap:12px"><h2 class="h3">Pedidos online</h2>
      <label class="sw"><input type="checkbox" name="pickup" ${s.pickup === '1' ? 'checked' : ''}> Tomar pedidos para retirar y de mostrador</label>
      <label class="sw"><input type="checkbox" name="delivery" ${s.delivery === '1' ? 'checked' : ''}> Hacer envíos</label>
      <label>Costo de envío<input type="number" name="fee" min="0" step="100" value="${esc(s.fee)}"></label>
      <label>Tortas por día como máximo<input type="number" name="cakesPerDay" min="0" max="50" value="${esc(s.cakesPerDay)}"></label>
      <label>Gusto recomendado en la portada<select name="fotd">${S.flavors.map((f) => `<option value="${f.slug}" ${f.slug === s.fotd ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      <label>Aviso en la web <small class="muted">(vacío = sin aviso)</small><input name="note" maxlength="160" value="${esc(s.note)}" placeholder="Hoy cerramos a las 22 por inventario"></label>
      <button class="b b-solid" type="submit">Guardar</button></form>
      <div style="display:grid;gap:16px;align-content:start"><div class="card qrcard"><div class="qr" id="qrM"></div><div><h2 class="h3">QR del mostrador</h2><p class="muted">Imprimilo y pegalo en el mostrador y las mesas de afuera. Lleva a <b>${esc(base)}/mostrador</b>: la gente pide desde el celu y recibe un turno.</p><button class="b b-line b-sm" type="button" id="printQR">Imprimir cartel</button></div></div>
      <div class="card"><h2 class="h3">Pantalla de turnos</h2><p class="muted">Abrila en la tele del local (pantalla completa con F11). Muestra los turnos en preparación y los listos, con aviso sonoro.</p><a class="b b-line b-sm" href="/turnos" target="_blank" rel="noopener">Abrir /turnos</a></div>
      ${s.demo === '1' ? `<div class="card"><h2 class="h3">Datos de ejemplo</h2><p class="muted">Borra pedidos, encargos y tarjetas de prueba, y deja todas las bachas llenas.</p><button class="b b-line b-sm" type="button" id="clearDemo">Borrar datos de ejemplo</button></div>` : ''}</div></div>`;
    try { const q = qrcode(0, 'M'); q.addData(base + '/mostrador'); q.make(); $('#qrM').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch {}
    $('#setForm').addEventListener('submit', act(async (e) => { e.preventDefault(); const f = e.target; await api('settings', 'PUT', { pickup: f.pickup.checked, delivery: f.delivery.checked, fee: Number(f.fee.value), cakesPerDay: Number(f.cakesPerDay.value), fotd: f.fotd.value, note: f.note.value }); toast('Ajustes guardados'); }));
    $('#clearDemo')?.addEventListener('click', act(async () => { if (!confirm('¿Borrar todos los datos de ejemplo? No se puede deshacer.')) return; await api('clear-demo', 'POST'); toast('Listo, la fábrica quedó en limpio'); await load(); }));
    $('#printQR').addEventListener('click', () => { const w = open('', '_blank'); w.document.write(`<title>QR mostrador</title><body style="font-family:sans-serif;text-align:center;padding:40px;color:#12284a"><p style="font:400 64px Yellowtail,cursive;margin:0">Scannapieco</p><h1 style="font-size:44px;margin:10px 0">Pedí sin hacer fila</h1><div style="width:380px;margin:20px auto">${$('#qrM').innerHTML}</div><p style="font-size:24px">Escaneá con la cámara, elegí tus gustos y esperá tu turno.</p><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Yellowtail&display=swap"><script>setTimeout(()=>print(),600)<\/script></body>`); w.document.close(); });
  }

  /* ---------- venta rápida ---------- */
  const qd = $('#quickDlg'); let qs = null, qf = [];
  $('#quick').addEventListener('click', () => { if (!S) return; qs = S.sizes[0].key; qf = []; $('#qErr').textContent = ''; $('#qCard').value = ''; drawQ(); qd.showModal(); });
  function drawQ() {
    const s = S.sizes.find((x) => x.key === qs);
    $('#qSizes').innerHTML = S.sizes.map((x) => `<button type="button" data-qs="${x.key}" aria-pressed="${x.key === qs}">${esc(x.name)}<small>${money(x.price)}</small></button>`).join('');
    $('#qInfo').textContent = `${qf.length} de ${s.max} gustos`;
    $('#qFlavors').innerHTML = S.flavors.map((f) => `<button type="button" data-qf="${f.id}" style="--c:${f.color}" aria-pressed="${qf.includes(f.id)}" ${!f.available || f.level <= 0 ? 'disabled' : ''}>${esc(f.name)}</button>`).join('');
    $('#qGo').textContent = `Cobrar ${money(s.price)}`; $('#qGo').disabled = !qf.length;
  }
  qd.addEventListener('click', (e) => {
    const a = e.target.closest('[data-qs]'), b = e.target.closest('[data-qf]');
    if (a) { qs = a.dataset.qs; qf = qf.slice(0, S.sizes.find((x) => x.key === qs).max); drawQ(); }
    if (b) { const id = Number(b.dataset.qf), max = S.sizes.find((x) => x.key === qs).max; qf = qf.includes(id) ? qf.filter((x) => x !== id) : qf.length < max ? [...qf, id] : qf; drawQ(); }
  });
  $('#qGo').addEventListener('click', async () => {
    try { const r = await api('orders', 'POST', { items: [{ size: qs, flavors: qf, qty: 1 }], pay: $('#qPay').value, card: $('#qCard').value }); qd.close(); toast(`Turno ${r.turn} cargado`); await load(); }
    catch (e) { $('#qErr').textContent = e.message; }
  });

  /* ---------- arranque ---------- */
  api('me').then((r) => (r.admin ? start() : showLogin())).catch(() => showLogin());
})();
