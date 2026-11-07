// Heladería Scannapieco — vitrina en vivo, armado del pote, pedido con seguimiento, tortas y tarjeta de sellos.
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const MODE = document.body.dataset.mode || 'web';
  const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const still = () => document.documentElement.classList.contains('still');
  const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)', EASE_IO = 'cubic-bezier(0.77, 0, 0.175, 1)';
  let M = null; // menú del servidor
  const F = (id) => M?.flavors.find((f) => f.id === Number(id));
  const sizeOf = (k) => M?.sizes.find((s) => s.key === k);
  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No pudimos conectar. Probá de nuevo.');
    return j;
  }
  const toastEl = $('#toast'); let toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3200); }

  /* ---------- encabezado, pausa de animaciones, horario ---------- */
  const top = $('.top'); if (top) { const f = () => top.classList.toggle('scrolled', scrollY > 8); addEventListener('scroll', f, { passive: true }); f(); }
  const mot = $('#motion');
  if (mot) {
    const sync = () => { mot.setAttribute('aria-pressed', still()); mot.title = still() ? 'Reanudar animaciones' : 'Pausar animaciones'; document.getAnimations?.().forEach((a) => (still() ? a.pause() : a.play())); };
    mot.addEventListener('click', () => { document.documentElement.classList.toggle('still'); try { localStorage.setItem('sc_still', still() ? '1' : '0'); } catch {} sync(); });
    sync();
  }
  $$('#hours tr').forEach((tr) => tr.classList.toggle('today', Number(tr.dataset.d) === new Date().getDay()));

  /* ---------- el cucurucho del inicio ---------- */
  const scoopsG = $('#scoops'), cone = $('#cone');
  function scoopPath(cy) { return `M86 ${cy}a64 60 0 0 1 128 0q-8 16-21 8q-10 16-21 4q-11 17-22 4q-11 17-22 4q-11 16-21 4q-13 12-21-4z`; }
  function addScoop(color, animate = true) {
    const n = scoopsG.children.length, cy = 222 - n * 58, NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'scoop');
    g.innerHTML = `<path d="${scoopPath(cy)}" fill="${color}" stroke="#12284a" stroke-width="3" stroke-linejoin="round"/><ellipse cx="122" cy="${cy - 26}" rx="16" ry="9" fill="#fff" opacity=".45" transform="rotate(-20 122 ${cy - 26})"/>`;
    scoopsG.prepend(g);
    if (animate && !still()) g.animate([{ transform: 'translateY(-320px)', opacity: 0 }, { transform: 'translateY(0) scale(1.06, .9)', opacity: 1, offset: .72 }, { transform: 'translateY(0) scale(.97, 1.04)', offset: .86 }, { transform: 'none' }], { duration: 640, easing: EASE });
  }
  function resetCone() {
    const kids = [...scoopsG.children];
    if (still()) { kids.forEach((k) => k.remove()); return Promise.resolve(); }
    return Promise.all(kids.map((k, i) => k.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${(i % 2 ? 1 : -1) * 90}px, 160px) rotate(${(i % 2 ? 1 : -1) * 40}deg)`, opacity: 0 }], { duration: 420, delay: i * 50, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished)).then(() => kids.forEach((k) => k.remove()));
  }
  let coneBusy = false;
  cone?.addEventListener('click', async () => {
    if (coneBusy || !M) return;
    if (scoopsG.children.length >= 4) { coneBusy = true; await resetCone(); coneBusy = false; toast('¡Ups! Se cayó todo. Tocá de nuevo.'); return; }
    const av = M.flavors.filter((f) => f.available && f.level > 0), f = av[Math.floor(Math.random() * av.length)];
    addScoop(f.color); $('.cone-tip span').textContent = f.name;
  });

  /* ---------- vitrina ---------- */
  const vit = $('#vitrina');
  function tubHTML(f) {
    const out = !f.available || f.level <= 0, low = !out && f.level < 15;
    return `<li class="tub${out ? ' out' : ''}" data-id="${f.id}" data-cat="${f.cat}" data-vegan="${f.vegan}" data-gf="${f.gf}" data-name="${esc(f.name.toLowerCase())}" style="--c:${f.color};--lv:${out ? 0 : Math.max(8, f.level)}"><button class="tub-pick" type="button" data-pick="${f.id}" ${out ? 'disabled' : ''} aria-label="Sumar ${esc(f.name)} al pote"><span class="tub-cream" aria-hidden="true"><svg viewBox="0 0 120 16" preserveAspectRatio="none"><path d="M0 16V8c10-6 20 6 30 0s20-6 30 0 20 6 30 0 20-6 30 0v8z"/></svg></span><span class="tub-plus" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span></button><span class="tub-n">${esc(f.name)}</span><span class="tub-tags">${f.vegan ? '<i>vegano</i>' : ''}${f.gf ? '<i>sin TACC</i>' : ''}${out ? '<b>se terminó</b>' : low ? '<b class="low">quedan pocos</b>' : ''}</span></li>`;
  }
  function renderVitrinaClient() { vit.innerHTML = M.cats.map((c) => `<section class="vit-sec" data-cat="${c.key}"><h3>${esc(c.label)}</h3><ul>${M.flavors.filter((f) => f.cat === c.key).map(tubHTML).join('')}</ul></section>`).join(''); }
  function refreshTubs() {
    for (const li of $$('.tub', vit)) {
      const f = F(li.dataset.id); if (!f) continue;
      const out = !f.available || f.level <= 0, low = !out && f.level < 15;
      li.classList.toggle('out', out); li.style.setProperty('--lv', out ? 0 : Math.max(8, f.level)); $('.tub-pick', li).disabled = out;
      const tags = $('.tub-tags', li); $$('b', tags).forEach((b) => b.remove()); if (out || low) tags.insertAdjacentHTML('beforeend', out ? '<b>se terminó</b>' : '<b class="low">quedan pocos</b>');
    }
    markPicked();
  }
  let filter = 'all';
  function applyFilter() {
    const q = ($('#q')?.value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); let shown = 0;
    for (const li of $$('.tub', vit)) {
      const name = li.dataset.name.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const ok = (filter === 'all' || li.dataset.cat === filter || (filter === 'vegan' && li.dataset.vegan === '1') || (filter === 'gf' && li.dataset.gf === '1')) && (!q || name.includes(q));
      li.classList.toggle('hide', !ok); if (ok) shown++;
    }
    $$('.vit-sec', vit).forEach((s) => s.classList.toggle('hide', !$$('.tub:not(.hide)', s).length));
    const e = $('#vitEmpty'); if (e) e.hidden = shown > 0;
  }
  $$('.chip').forEach((c) => c.addEventListener('click', () => { filter = c.dataset.f; $$('.chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); applyFilter(); }));
  $('#q')?.addEventListener('input', applyFilter);
  vit?.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) pick(Number(b.dataset.pick), b); });

  /* ---------- ruleta "elegime 3" ---------- */
  let reelPick = [];
  $('#spin')?.addEventListener('click', () => {
    if (!M) return; const box = $('#reels'); box.hidden = false; $('#useReels').disabled = true;
    const av = M.flavors.filter((f) => f.available && f.level > 0), pool = [...av]; reelPick = [];
    while (reelPick.length < 3 && pool.length) reelPick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    $$('.reel span', box).forEach((sp, i) => {
      const final = reelPick[i], set = (f) => { sp.textContent = f.name; sp.style.setProperty('--c', f.color); };
      if (still()) { set(final); return; }
      const t = setInterval(() => set(av[Math.floor(Math.random() * av.length)]), 70);
      setTimeout(() => { clearInterval(t); set(final); sp.animate([{ transform: 'translateY(-60%)', filter: 'blur(4px)', opacity: .3 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }], { duration: 380, easing: EASE }); }, 650 + i * 380);
    });
    setTimeout(() => { $('#useReels').disabled = false; }, still() ? 0 : 1500);
  });
  $('#useReels')?.addEventListener('click', () => {
    if (sizeOf(pote.size).max < 3) pote.size = 'cuarto';
    pote.flavors = reelPick.map((f) => f.id); renderPote(true); document.getElementById('pedido').scrollIntoView({ behavior: still() ? 'auto' : 'smooth' });
  });

  /* ---------- el pote en armado ---------- */
  const pote = store.get('sc_pote', { size: 'medio', flavors: [], qty: 1 });
  const layersG = $('#layers'), fab = $('#potFab');
  function bandPath(y, h) { let d = `M0 ${y + h}V${y + 5}`; for (let x = 0; x < 220; x += 27.5) d += `q13.75 -9 27.5 0`; return d + `V${y + h}z`; }
  function renderPote(animateLast = false) {
    if (!M || !layersG) return;
    let s = sizeOf(pote.size) || M.sizes[2]; pote.size = s.key;
    pote.flavors = pote.flavors.filter((id) => { const f = F(id); return f && f.available && f.level > 0; }).slice(0, s.max);
    store.set('sc_pote', pote);
    $$('.size').forEach((b) => b.setAttribute('aria-pressed', b.dataset.size === s.key));
    const full = 170, bh = full / s.max, base = 230;
    layersG.innerHTML = pote.flavors.map((id, i) => `<path class="layer" d="${bandPath(base - bh * (i + 1) - 4, bh + 8)}" fill="${F(id).color}"/>`).join('');
    if (animateLast && layersG.lastElementChild && !still()) layersG.lastElementChild.animate([{ transform: 'translateY(-240px)' }, { transform: 'translateY(0) scaleY(.85)', offset: .75 }, { transform: 'none' }], { duration: 560, easing: EASE });
    const slots = $('#slots');
    slots.innerHTML = Array.from({ length: s.max }, (_, i) => { const f = F(pote.flavors[i]); return f ? `<li class="on" style="--c:${f.color}">${esc(f.name)}<button type="button" class="link-btn x" data-rm="${i}" aria-label="Sacar ${esc(f.name)}">Sacar</button></li>` : `<li>Gusto ${i + 1}${i === 0 ? ': tocá uno en la vitrina' : ''}</li>`; }).join('');
    const left = s.max - pote.flavors.length;
    $('#potCap').textContent = pote.flavors.length ? (left ? `Podés sumar ${left} gusto${left > 1 ? 's' : ''} más` : `${s.name} completo`) : `Elegí hasta ${s.max} gustos`;
    $('#qN').value = pote.qty; $('#qN').textContent = pote.qty;
    $('#potPrice').textContent = money(s.price * pote.qty);
    $('#addPot').disabled = !pote.flavors.length;
    if (fab) {
      fab.hidden = !pote.flavors.length;
      const pot = $('.fab-pot i', fab); pot.style.setProperty('--h', Math.round((pote.flavors.length / s.max) * 100) + '%');
      pot.style.setProperty('--g', `linear-gradient(0deg, ${pote.flavors.map((id, i) => `${F(id).color} ${i / pote.flavors.length * 100}% ${(i + 1) / pote.flavors.length * 100}%`).join(',')})`);
      pot.style.background = 'var(--g)'; $('#fabTxt').textContent = `${s.name} · ${pote.flavors.length}/${s.max}`;
    }
    markPicked();
  }
  function markPicked() { $$('.tub').forEach((li) => li.classList.toggle('picked', pote.flavors.includes(Number(li.dataset.id)))); }
  function inView(el) { const r = el.getBoundingClientRect(); return r.top < innerHeight - 40 && r.bottom > 80; }
  function fly(from, color, to) {
    if (still() || !from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), d = document.createElement('span');
    d.className = 'fly'; d.style.background = color; d.style.left = a.left + a.width / 2 - 17 + 'px'; d.style.top = a.top + a.height / 2 - 17 + 'px'; document.body.append(d);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 3 - (a.top + a.height / 2);
    d.animate([{ transform: 'translate(0,0) scale(.6)' }, { transform: `translate(${dx * .5}px, ${Math.min(dy, 0) - 110}px) scale(1.15)`, offset: .45, easing: 'cubic-bezier(.3,0,.7,1)' }, { transform: `translate(${dx}px, ${dy}px) scale(.7)` }], { duration: 640, easing: 'cubic-bezier(.4,0,.6,1)' }).finished.then(() => { d.remove(); to.classList.remove('land'); void to.offsetWidth; to.classList.add('land'); });
  }
  function pick(id, fromEl) {
    const f = F(id), s = sizeOf(pote.size); if (!f) return;
    const i = pote.flavors.indexOf(id);
    if (i >= 0) { pote.flavors.splice(i, 1); renderPote(); return; }
    if (pote.flavors.length >= s.max) { toast(`El ${s.name} lleva hasta ${s.max} gustos. Sacá uno o elegí un tamaño más grande.`); return; }
    pote.flavors.push(id);
    const potSvg = $('.pot'), target = potSvg && inView(potSvg) ? potSvg : fab;
    if (fab) fab.hidden = false;
    requestAnimationFrame(() => fly(fromEl, f.color, target));
    renderPote(target === potSvg);
  }
  $$('.size').forEach((b) => b.addEventListener('click', () => { pote.size = b.dataset.size; const s = sizeOf(pote.size); if (pote.flavors.length > s.max) toast(`Dejamos los primeros ${s.max} gustos.`); renderPote(); }));
  $('#slots')?.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { pote.flavors.splice(Number(b.dataset.rm), 1); renderPote(); } });
  $('#qMinus')?.addEventListener('click', () => { pote.qty = Math.max(1, pote.qty - 1); renderPote(); });
  $('#qPlus')?.addEventListener('click', () => { pote.qty = Math.min(10, pote.qty + 1); renderPote(); });
  $('#addQ')?.addEventListener('change', (e) => { const v = e.target.value.trim().toLowerCase(), f = M?.flavors.find((x) => x.name.toLowerCase() === v); if (f) { if (!f.available || f.level <= 0) toast(`${f.name} se terminó por hoy.`); else pick(f.id, e.target); } e.target.value = ''; });
  $('#addPot')?.addEventListener('click', () => {
    if (!pote.flavors.length) return;
    cart.push({ size: pote.size, flavors: [...pote.flavors], qty: pote.qty }); saveCart();
    const s = sizeOf(pote.size); toast(`Sumamos ${pote.qty > 1 ? pote.qty + ' × ' : ''}${s.name} a tu pedido`);
    pote.flavors = []; pote.qty = 1; renderPote();
    if (MODE === 'mostrador') openDrawer('cart');
  });

  /* ---------- carrito y cajón ---------- */
  const cart = store.get('sc_cart', []);
  function saveCart() {
    store.set('sc_cart', cart); const n = cart.reduce((t, i) => t + i.qty, 0);
    ['#cartN', '#mN'].forEach((s) => { const el = $(s); if (el) el.textContent = n; });
    const cb = $('#cartBtn'); if (cb) { cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); }
  }
  const drawer = $('#drawer'), dBody = $('#dBody');
  let view = 'cart', kind = MODE === 'mostrador' ? 'mostrador' : store.get('sc_kind', 'retiro');
  function openDrawer(v = 'cart') { view = v; renderDrawer(); if (!drawer.open) drawer.showModal(); }
  function closeDrawer() { if (still()) return drawer.close(); drawer.classList.add('closing'); setTimeout(() => { drawer.classList.remove('closing'); drawer.close(); }, 210); }
  drawer?.addEventListener('click', (e) => { if (e.target === drawer || e.target.closest('[data-close]')) closeDrawer(); });
  drawer?.addEventListener('cancel', (e) => { e.preventDefault(); closeDrawer(); });
  ['#cartBtn', '#mCart'].forEach((s) => $(s)?.addEventListener('click', () => openDrawer('cart')));
  const miniPot = (ids) => `<span class="mini-pot" aria-hidden="true">${ids.map((id) => `<i style="background:${F(id)?.color || '#ccc'}"></i>`).join('')}</span>`;
  const sub = () => cart.reduce((t, i) => t + (sizeOf(i.size)?.price || 0) * i.qty, 0);
  function renderDrawer() {
    if (!M) { dBody.innerHTML = '<p>Cargando…</p>'; return; }
    if (view === 'track') return renderTrack();
    $('#dTitle').textContent = 'Tu pedido';
    if (!cart.length) {
      dBody.innerHTML = `<div class="d-empty"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 34h56l-6 52a6 6 0 0 1-6 5H34a6 6 0 0 1-6-5z"/><path d="M18 34h64"/><path d="M38 46v32M50 46v32M62 46v32" stroke-dasharray="4 6"/></svg><p>Todavía no armaste ningún pote.</p><a class="btn btn-solid" href="#gustos" data-close>Ir a la vitrina</a></div>`;
      $('[data-close]', dBody).addEventListener('click', closeDrawer); return;
    }
    const fee = kind === 'envio' ? M.fee : 0, card = store.get('sc_card', '');
    const times = M.times.map((t) => `<option>${t}</option>`).join('');
    const canPickup = M.pickup, canDelivery = M.delivery;
    if (kind === 'envio' && !canDelivery) kind = 'retiro'; if (kind === 'retiro' && !canPickup && canDelivery) kind = 'envio';
    dBody.innerHTML = `<ul class="d-items">${cart.map((it, i) => { const s = sizeOf(it.size); return `<li>${miniPot(it.flavors)}<div><b>${it.qty > 1 ? it.qty + ' × ' : ''}${esc(s?.name)}</b><small>${it.flavors.map((id) => esc(F(id)?.name || '¿?')).join(', ')}</small><button type="button" class="link-btn" data-del="${i}">Quitar</button></div><span class="money">${money((s?.price || 0) * it.qty)}</span></li>`; }).join('')}</ul>
    <form id="checkout" novalidate>
      ${MODE === 'mostrador' ? `<p class="trk-msg">Lo pagás en la caja cuando te llamemos.</p>` : `<div class="seg ${kind === 'envio' ? 'right' : ''}" role="group" aria-label="Cómo lo recibís"><span class="seg-bg" aria-hidden="true"></span><button type="button" data-kind="retiro" aria-pressed="${kind === 'retiro'}" ${canPickup ? '' : 'disabled'}>Retiro sin fila</button><button type="button" data-kind="envio" aria-pressed="${kind === 'envio'}" ${canDelivery ? '' : 'disabled'}>Envío ${money(M.fee)}</button></div>`}
      <div class="d-fields" style="margin-top:16px">
        <label>${MODE === 'mostrador' ? 'Tu nombre (para llamarte)' : 'Nombre'}<input name="name" autocomplete="given-name" required maxlength="50"></label>
        ${MODE === 'mostrador' ? '' : '<label>Teléfono<input name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="25"></label>'}
        ${kind === 'retiro' && MODE !== 'mostrador' ? `<label class="wide">¿A qué hora pasás?<select name="time" required>${times || '<option value="">Hoy ya no hay horarios</option>'}</select></label>` : ''}
        ${kind === 'envio' ? `<label class="wide">Dirección<input name="address" autocomplete="street-address" required maxlength="120" placeholder="Calle, número, piso y depto"></label><p class="wide" style="font-size:.88rem;color:var(--ink-2)">Llegamos a ${esc(M.zones)}.</p>` : ''}
        <label>Pago<select name="pay">${MODE === 'mostrador' ? '<option value="efectivo">Efectivo</option><option value="debito">Débito</option><option value="mp">Mercado Pago</option>' : '<option value="mp">Mercado Pago</option><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option>'}</select></label>
        <label>Tarjeta de sellos <small>(opcional)</small><input name="card" value="${esc(card)}" maxlength="8" placeholder="S-XXXXXX" autocapitalize="characters"></label>
        <label class="wide">Aclaraciones <small>(opcional)</small><input name="notes" maxlength="200" placeholder="${kind === 'envio' ? 'Timbre, referencias…' : 'Sin cucharitas, con cucurucho aparte…'}"></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      </div>
      <div class="d-total" style="margin-top:18px">
        <div><span>Helado</span><span>${money(sub())}</span></div>${fee ? `<div><span>Envío</span><span>${money(fee)}</span></div>` : ''}
        <div class="big"><span>Total</span><span>${money(sub() + fee)}</span></div>
      </div>
      <button class="btn btn-solid buy" type="submit" style="width:100%;margin-top:14px">${MODE === 'mostrador' ? 'Pedir y sacar turno' : 'Confirmar pedido'}</button>
      <p class="hint" id="coMsg" role="status"></p>
    </form>`;
    $$('[data-del]', dBody).forEach((b) => b.addEventListener('click', () => { cart.splice(Number(b.dataset.del), 1); saveCart(); renderDrawer(); }));
    $$('[data-kind]', dBody).forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; store.set('sc_kind', kind); renderDrawer(); }));
    $('#checkout').addEventListener('submit', submitOrder);
  }
  async function submitOrder(e) {
    e.preventDefault(); const fm = e.target, msg = $('#coMsg'), btn = $('button[type=submit]', fm), fd = Object.fromEntries(new FormData(fm));
    $$('[aria-invalid]', fm).forEach((x) => x.removeAttribute('aria-invalid'));
    const need = ['name', ...(MODE === 'mostrador' ? [] : ['phone']), ...(kind === 'envio' ? ['address'] : [])].find((k) => !String(fd[k] || '').trim());
    if (need) { msg.className = 'hint err'; msg.textContent = { name: 'Falta tu nombre.', phone: 'Falta el teléfono.', address: 'Falta la dirección.' }[need]; fm.elements[need].setAttribute('aria-invalid', 'true'); fm.elements[need].focus(); return; }
    btn.disabled = true; btn.textContent = 'Enviando…'; msg.className = 'hint'; msg.textContent = '';
    try {
      const r = await api('/api/orders', { method: 'POST', body: JSON.stringify({ ...fd, kind, items: cart }) });
      if (fd.card) store.set('sc_card', fd.card.toUpperCase());
      cart.length = 0; saveCart();
      track = { code: r.code, turn: r.turn, kind: r.kind, status: 'nuevo' }; store.set('sc_track', track); showPill(); openDrawer('track'); poll();
    } catch (err) { msg.className = 'hint err'; msg.textContent = err.message; btn.disabled = false; btn.textContent = MODE === 'mostrador' ? 'Pedir y sacar turno' : 'Confirmar pedido'; }
  }

  /* ---------- seguimiento ---------- */
  let track = store.get('sc_track', null), pollT;
  const qp = new URLSearchParams(location.search).get('pedido'); if (qp && /^[MERT]-[A-Z0-9]{4}$/.test(qp)) track = { code: qp, status: 'nuevo' };
  const STOPS = (k) => (k === 'envio' ? ['Recibido', 'En la fábrica', 'En camino', 'Entregado'] : ['Recibido', 'Preparando', 'Listo', 'Entregado']);
  const idx = (st) => ({ nuevo: 0, preparando: 1, listo: 2, 'en camino': 2, entregado: 3 }[st] ?? 0);
  const MSG = { nuevo: 'Recibimos tu pedido.', preparando: 'Lo estamos armando en la fábrica.', listo: 'Ya está listo. ¡Pasá a buscarlo!', 'en camino': 'Va en camino. Tené el timbre a mano.', entregado: '¡Que lo disfrutes!', cancelado: 'Este pedido se canceló. Si fue un error, llamanos al 4777-3528.' };
  function renderTrack() {
    $('#dTitle').textContent = 'Seguí tu pedido';
    const t = track, i = idx(t.status), stops = STOPS(t.kind);
    dBody.innerHTML = `<div class="trk">${t.turn && t.kind !== 'envio' ? `<div class="turn"><small>Tu turno</small><b>${t.turn}</b></div>` : ''}
      <div><small>Código</small><div class="trk-code">${esc(t.code)}</div></div>
      <div class="trk-line"><div class="rail"></div><svg class="trk-tram" style="--p:${t.status === 'cancelado' ? 0 : i / 3}"><use href="#tram"/></svg><div class="trk-stops">${stops.map((s, k) => `<span class="${k <= i ? 'on' : ''}">${s}</span>`).join('')}</div></div>
      <p class="trk-msg" aria-live="polite">${MSG[t.status] || ''}</p>
      ${t.time && t.time.includes(':') ? `<p>Retiro a las <b>${esc(t.time)}</b> en Álvarez Thomas 10.</p>` : ''}
      ${t.total ? `<p>Total: <b>${money(t.total)}</b></p>` : ''}
      <div class="cta" style="margin-top:0">${t.status === 'entregado' || t.status === 'cancelado' ? '<button class="btn btn-line btn-sm" type="button" id="trkDone">Listo, cerrar</button>' : ''}<a class="btn btn-line btn-sm" href="https://wa.me/5491123233780?text=${encodeURIComponent('Hola, consulto por mi pedido ' + t.code)}" target="_blank" rel="noopener">Escribir por WhatsApp</a></div></div>`;
    $('#trkDone')?.addEventListener('click', () => { track = null; store.set('sc_track', null); showPill(); closeDrawer(); });
  }
  function showPill() {
    const p = $('#trackPill'); if (!p) return;
    if (!track) { p.hidden = true; return; }
    p.hidden = false; p.textContent = `${track.turn && track.kind !== 'envio' ? 'Turno ' + track.turn + ' · ' : ''}${{ nuevo: 'Pedido recibido', preparando: 'Preparando', listo: '¡Listo para retirar!', 'en camino': 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' }[track.status] || 'Ver pedido'}`;
  }
  $('#trackPill')?.addEventListener('click', () => openDrawer('track'));
  async function poll() {
    clearTimeout(pollT); if (!track) return;
    try {
      const r = await api('/api/track/' + track.code), was = track.status;
      track = { ...track, ...r }; store.set('sc_track', track); showPill();
      if (was !== r.status && (r.status === 'listo' || r.status === 'en camino')) { toast(MSG[r.status]); navigator.vibrate?.([120, 60, 120]); }
      if (drawer.open && view === 'track') { const tram = $('.trk-tram', dBody); if (tram && was === r.status) tram.style.setProperty('--p', idx(r.status) / 3); else renderTrack(); }
    } catch { }
    if (track && track.status !== 'entregado' && track.status !== 'cancelado') pollT = setTimeout(poll, document.hidden ? 30000 : 8000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && track) poll(); });

  /* ---------- tortas ---------- */
  const cakeForm = $('#cakeForm'); let cDay = '', cTime = '';
  async function loadDays() {
    if (!cakeForm) return;
    try {
      const r = await api('/api/encargos/dias'), fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
      $('#days').innerHTML = r.days.slice(0, 21).map((d) => { const dt = new Date(d.date + 'T12:00:00'); return `<button type="button" class="day" role="radio" aria-checked="false" data-d="${d.date}" ${d.left > 0 ? '' : 'disabled'} aria-label="${dt.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}${d.left > 0 ? '' : ', completo'}"><small>${fmt.format(dt).replace('.', '')}</small><b>${dt.getDate()}</b></button>`; }).join('');
      $('#ctimes').innerHTML = r.times.map((t) => `<button type="button" class="time" role="radio" aria-checked="false" data-t="${t}">${t}</button>`).join('');
    } catch { $('#days').textContent = 'No pudimos cargar los días. Recargá la página.'; }
  }
  cakeForm?.addEventListener('click', (e) => {
    const d = e.target.closest('.day'), t = e.target.closest('.time');
    if (d && !d.disabled) { cDay = d.dataset.d; $$('.day').forEach((x) => x.setAttribute('aria-checked', x === d)); }
    if (t) { cTime = t.dataset.t; $$('.time').forEach((x) => x.setAttribute('aria-checked', x === t)); }
  });
  cakeForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); const msg = $('#cakeMsg'), fd = Object.fromEntries(new FormData(cakeForm)), btn = $('button[type=submit]', cakeForm);
    const err = !fd.cake ? 'Elegí qué torta querés.' : !cDay ? 'Elegí el día de retiro.' : !cTime ? 'Elegí el horario.' : !fd.name?.trim() ? 'Falta tu nombre.' : !fd.phone?.trim() ? 'Falta el teléfono.' : '';
    if (err) { msg.className = 'hint err'; msg.textContent = err; return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await api('/api/encargos', { method: 'POST', body: JSON.stringify({ ...fd, date: cDay, time: cTime }) });
      const d = new Date(r.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
      msg.className = 'hint'; msg.innerHTML = `Listo: <b>${esc(r.cake)}</b> para el ${d} a las ${r.time}. Código <b>${r.code}</b>. Te escribimos para la seña.`;
      cakeForm.reset(); cDay = cTime = ''; $$('.day,.time').forEach((x) => x.setAttribute('aria-checked', 'false')); loadDays();
    } catch (er) { msg.className = 'hint err'; msg.textContent = er.message; }
    btn.disabled = false; btn.textContent = 'Encargar torta';
  });

  /* ---------- tarjeta de sellos ---------- */
  let qrLib;
  function loadQR() { return (qrLib ??= new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = () => ok(window.qrcode); s.onerror = no; document.head.append(s); })); }
  window.scQR = async (text, el) => { try { const q = (await loadQR())(0, 'M'); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch { el.textContent = text; } };
  $('#cardForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const fm = e.target, msg = $('#cardMsg'), fd = Object.fromEntries(new FormData(fm)), btn = $('button[type=submit]', fm);
    if (!fd.name?.trim() || !fd.phone?.trim()) { msg.className = 'hint err'; msg.textContent = 'Completá nombre y celular.'; return; }
    btn.disabled = true;
    try {
      const r = await api('/api/cards', { method: 'POST', body: JSON.stringify(fd) }), url = `${location.origin}/tarjeta/${r.code}`;
      store.set('sc_card', r.code); msg.className = 'hint'; msg.textContent = r.existing ? 'Ya tenías una tarjeta con ese celular. Acá está.' : '¡Tarjeta lista!';
      $('#sName').textContent = fd.name.split(' ')[0]; $('.s-card-foot span:last-child').textContent = r.code;
      fm.insertAdjacentHTML('afterend', `<div class="card-done"><div class="qr" id="cardQR"></div><div><p><b>${r.code}</b></p><p>Guardá este link en el celu:</p><p><a href="${url}">${url.replace(/^https?:\/\//, '')}</a></p></div></div>`);
      fm.remove(); window.scQR(url, $('#cardQR'));
    } catch (er) { msg.className = 'hint err'; msg.textContent = er.message; btn.disabled = false; }
  });
  const sCard = $('#sCard');
  if (sCard && 'IntersectionObserver' in window) {
    let done = false;
    new IntersectionObserver((en, ob) => { if (!en[0].isIntersecting || done) return; done = true; ob.disconnect();
      $$('.stamps li', sCard).slice(0, 5).forEach((li, i) => setTimeout(() => { li.classList.add('on'); if (!still()) li.animate([{ transform: 'scale(1.6) rotate(-20deg)', opacity: 0 }, { transform: 'scale(.92)', opacity: 1, offset: .7 }, { transform: 'none' }], { duration: 420, easing: EASE }); }, still() ? 0 : 300 + i * 260));
    }, { threshold: .5 }).observe(sCard);
  }

  /* ---------- fotos que se revelan al entrar en pantalla ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
    reveals.forEach((r) => io.observe(r));
  } else reveals.forEach((r) => r.classList.add('in'));

  /* ---------- historia: el tranvía avanza con el scroll ---------- */
  const hist = $('#historia'), hTram = $('#hTram'), stops = $$('#stops li');
  if (hist && hTram) {
    let ticking = false, stopT;
    const upd = () => {
      ticking = false; const r = hist.getBoundingClientRect(), total = r.height - innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / total)); hTram.style.setProperty('--p', p.toFixed(4));
      stops.forEach((li) => li.classList.toggle('on', p >= Number(li.dataset.at) - .02));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } hist.classList.add('moving'); clearTimeout(stopT); stopT = setTimeout(() => hist.classList.remove('moving'), 140); }, { passive: true });
    upd();
  }

  /* ---------- arranque ---------- */
  async function boot() {
    try { M = await api('/api/menu'); } catch { toast('No pudimos cargar la vitrina. Recargá la página.'); return; }
    if (vit && MODE === 'mostrador') renderVitrinaClient(); else refreshTubs();
    const dl = $('#flist'); if (dl) dl.innerHTML = M.flavors.filter((f) => f.available && f.level > 0).map((f) => `<option value="${esc(f.name)}">`).join('');
    renderPote(); saveCart(); $('#cartBtn')?.classList.remove('bump');
    if (scoopsG && !scoopsG.children.length) { const fotd = M.flavors.find((f) => f.slug === M.fotd) || M.flavors[0], ch = M.flavors.find((f) => f.slug === 'chocolate') || M.flavors[4]; addScoop(fotd.color, true); setTimeout(() => addScoop(ch.color, true), still() ? 0 : 260); }
    loadDays(); showPill(); if (track) poll();
    if (qp && track) openDrawer('track');
    setInterval(async () => { try { M = await api('/api/menu'); refreshTubs(); renderPote(); } catch { } }, 60000);
  }
  boot();
})();
