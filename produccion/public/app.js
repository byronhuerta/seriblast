/* ── State ──────────────────────────────────────────────────────────────── */
let token = localStorage.getItem('sb_token') || null;
let currentUser = null;
let currentView = null;
let editOrderId = null;
let editUserId = null;
let editSvcId = null;
let editFcId = null;
let completeOrderId = null;

/* ── Helpers ────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const AREAS = {
  sandblast: 'Sandblast', laser: 'Láser', dtf_textil: 'DTF Textil',
  dtf_uv: 'DTF UV', vitrificado: 'Vitrificado', bordado: 'Bordado', diseno: 'Diseño'
};
const STATUS = {
  nuevo: 'Nuevo', en_produccion: 'En producción',
  completado: 'Completado', entregado: 'Entregado', cancelado: 'Cancelado'
};

function fmt(n) { return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(s) { if (!s) return '—'; return s.slice(0, 10).split('-').reverse().join('/'); }
function badge(status) { return `<span class="badge badge-${status}">${STATUS[status] || status}</span>`; }

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

function toast(msg, type = 'success') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 3000);
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

/* ── Auth ───────────────────────────────────────────────────────────────── */
async function tryLogin() {
  const btn = $('login-btn');
  const errEl = $('login-error');
  errEl.classList.remove('show');
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  try {
    const data = await api('/auth/login', 'POST', {
      username: $('login-user').value.trim(),
      password: $('login-pass').value,
    });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('sb_token', token);
    bootApp();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  } finally {
    btn.textContent = 'Entrar';
    btn.disabled = false;
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('sb_token');
  $('app').style.display = 'none';
  $('login-screen').style.display = '';
  $('login-user').value = '';
  $('login-pass').value = '';
}

/* ── Boot ───────────────────────────────────────────────────────────────── */
async function bootApp() {
  if (!token) { return; }
  try {
    currentUser = await api('/auth/me');
  } catch { logout(); return; }

  $('login-screen').style.display = 'none';
  $('app').style.display = 'flex';
  $('sb-nombre').textContent = currentUser.nombre;
  $('sb-role').textContent = { admin: 'Administrador', ventas: 'Ventas', produccion: 'Producción' }[currentUser.role] || currentUser.role;
  $('sb-area').textContent = currentUser.area ? (AREAS[currentUser.area] || currentUser.area) : '';

  buildSidebar();
  navigate(defaultView());
}

function defaultView() {
  if (currentUser.role === 'produccion') return 'produccion';
  return 'dashboard';
}

function buildSidebar() {
  const nav = [];
  const add = (view, icon, label) => nav.push(`<button class="nav-item" data-view="${view}" onclick="navigate('${view}')">${icon} <span>${label}</span></button>`);

  if (currentUser.role === 'admin') {
    add('dashboard', '📊', 'Dashboard');
    add('orders', '📋', 'Pedidos');
    add('reports', '📈', 'Reportes');
    add('config-services', '⚙️', 'Servicios');
    add('config-fixed', '💰', 'Gastos fijos');
    add('config-users', '👥', 'Usuarios');
  } else if (currentUser.role === 'ventas') {
    add('orders', '📋', 'Pedidos');
    add('new-order', '➕', 'Nuevo pedido');
  } else {
    add('produccion', '🏭', 'Mi área');
    add('produccion-all', '📋', 'Todos');
  }

  $('sidebar-nav').innerHTML = nav.join('');
}

function navigate(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  closeSidebar();
  renderView(view);
}

/* ── Sidebar toggle (mobile) ────────────────────────────────────────────── */
$('hamburger').onclick = () => { $('sidebar').classList.add('open'); $('overlay').classList.add('show'); };
$('overlay').onclick = closeSidebar;
function closeSidebar() { $('sidebar').classList.remove('open'); $('overlay').classList.remove('show'); }

/* ── Login events ───────────────────────────────────────────────────────── */
$('login-btn').onclick = tryLogin;
$('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
$('logout-btn').onclick = logout;

/* ── Render views ───────────────────────────────────────────────────────── */
async function renderView(view) {
  const el = $('view');
  el.innerHTML = '<div class="empty"><div class="spinner" style="width:36px;height:36px;border-width:3px;margin:0 auto"></div></div>';

  try {
    switch (view) {
      case 'dashboard': await renderDashboard(); break;
      case 'orders': await renderOrders(); break;
      case 'new-order': renderNewOrderForm(); break;
      case 'produccion': await renderProduccion(false); break;
      case 'produccion-all': await renderProduccion(true); break;
      case 'reports': await renderReports(); break;
      case 'config-services': await renderConfigServices(); break;
      case 'config-fixed': await renderConfigFixed(); break;
      case 'config-users': await renderConfigUsers(); break;
      default: el.innerHTML = '<div class="empty"><div class="icon">🔍</div>Vista no encontrada</div>';
    }
  } catch (e) {
    el.innerHTML = `<div class="empty"><div class="icon">⚠️</div>${e.message}</div>`;
  }
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */
async function renderDashboard() {
  const [summary, orders] = await Promise.all([
    api('/reports/summary'),
    api('/orders?status=nuevo'),
  ]);
  const c = summary.counters;
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Dashboard</h1><p>Resumen del negocio</p></div>
    </div>
    <div class="grid-4" style="margin-bottom:20px">
      <div class="stat-card purple"><div class="label">Total pedidos</div><div class="value">${c.total}</div></div>
      <div class="stat-card yellow"><div class="label">En producción</div><div class="value">${c.en_produccion}</div></div>
      <div class="stat-card green"><div class="label">Ventas totales</div><div class="value">$${fmt(summary.totalVenta)}</div></div>
      <div class="stat-card ${summary.margen >= 30 ? 'green' : summary.margen >= 0 ? 'yellow' : 'red'}">
        <div class="label">Margen promedio</div>
        <div class="value">${summary.margen}%</div>
      </div>
    </div>
    <div class="grid-2" style="margin-bottom:20px">
      <div class="stat-card"><div class="label">Utilidad neta</div><div class="value ${summary.utilidad >= 0 ? 'margin-positive' : 'margin-negative'}">$${fmt(summary.utilidad)}</div><div class="sub">Venta - Costo total</div></div>
      <div class="stat-card red"><div class="label">Costo de merma</div><div class="value">$${fmt(summary.totalMerma)}</div><div class="sub">Acumulado total</div></div>
    </div>
    <div class="card">
      <div class="card-header"><h3>Pedidos nuevos (pendientes)</h3><button class="btn btn-primary btn-sm" onclick="navigate('orders')">Ver todos</button></div>
      ${ordersTable(orders, true)}
    </div>
  `;
}

/* ── Orders ─────────────────────────────────────────────────────────────── */
async function renderOrders() {
  const orders = await api('/orders');
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Pedidos</h1><p>${orders.length} pedido(s)</p></div>
      <div class="page-actions">
        ${canCreate() ? '<button class="btn btn-primary" onclick="openOrderModal()">+ Nuevo pedido</button>' : ''}
      </div>
    </div>
    <div class="filters">
      <select id="f-status" onchange="filterOrders()">
        <option value="">Todos los estatus</option>
        ${Object.entries(STATUS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <select id="f-area" onchange="filterOrders()">
        <option value="">Todas las áreas</option>
        ${Object.entries(AREAS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <input type="text" id="f-search" placeholder="Buscar cliente / folio..." oninput="filterOrders()" style="max-width:220px">
    </div>
    <div class="card">
      <div id="orders-table">${ordersTable(orders)}</div>
    </div>
  `;
  window._allOrders = orders;
}

function filterOrders() {
  const status = $('f-status').value;
  const area = $('f-area').value;
  const q = $('f-search').value.toLowerCase();
  let list = window._allOrders || [];
  if (status) list = list.filter(o => o.status === status);
  if (area) list = list.filter(o => o.area === area);
  if (q) list = list.filter(o => o.cliente.toLowerCase().includes(q) || o.folio.toLowerCase().includes(q));
  $('orders-table').innerHTML = ordersTable(list);
}

function ordersTable(orders, minimal = false) {
  if (!orders.length) return '<div class="empty"><div class="icon">📭</div>Sin pedidos</div>';
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Folio</th><th>Cliente</th><th>Servicio</th><th>Área</th>
      ${!minimal ? '<th>Cantidad</th>' : ''}
      <th>Estatus</th><th>Entrega</th><th></th>
    </tr></thead>
    <tbody>
      ${orders.map(o => `
        <tr>
          <td class="td-folio">${o.folio}</td>
          <td><strong>${o.cliente}</strong></td>
          <td><small class="muted">${o.servicio_nombre || '—'}</small></td>
          <td>${AREAS[o.area] || o.area}</td>
          ${!minimal ? `<td>${o.cantidad}</td>` : ''}
          <td>${badge(o.status)}</td>
          <td>${fmtDate(o.fecha_entrega)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="viewOrder(${o.id})">Ver →</button></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function canCreate() {
  return currentUser.role === 'admin' || currentUser.role === 'ventas';
}

/* ── Order detail ───────────────────────────────────────────────────────── */
async function viewOrder(id) {
  const o = await api(`/orders/${id}`);
  const c = o.costos;

  const isAdmin = currentUser.role === 'admin';
  const isProd = currentUser.role === 'produccion';
  const isVentas = currentUser.role === 'ventas';

  // Apply admin-only field visibility
  document.querySelectorAll('.admin-field').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });

  const statusActions = [];
  if (isAdmin || isProd) {
    if (o.status === 'nuevo') statusActions.push(`<button class="btn btn-warning btn-sm" onclick="changeStatus(${o.id},'en_produccion')">Iniciar producción</button>`);
    if (o.status === 'en_produccion') statusActions.push(`<button class="btn btn-success btn-sm" onclick="openCompleteModal(${o.id})">Marcar completado</button>`);
  }
  if (isAdmin || isVentas) {
    if (o.status === 'completado') statusActions.push(`<button class="btn btn-primary btn-sm" onclick="changeStatus(${o.id},'entregado')">Marcar entregado</button>`);
    if (!['entregado','cancelado'].includes(o.status)) statusActions.push(`<button class="btn btn-danger btn-sm" onclick="changeStatus(${o.id},'cancelado')">Cancelar</button>`);
  }
  if (isAdmin && !['entregado','cancelado'].includes(o.status)) {
    statusActions.push(`<button class="btn btn-ghost btn-sm" onclick="openOrderModal(${o.id})">Editar</button>`);
  }

  $('view').innerHTML = `
    <div class="page-top">
      <div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('${currentUser.role === 'produccion' ? 'produccion' : 'orders'}')" style="margin-bottom:12px">← Volver</button>
        <h1>${o.folio}</h1>
        <p class="muted" style="margin-top:4px">Creado el ${fmtDate(o.created_at)} por ${o.creado_por_nombre || '—'}</p>
      </div>
      <div class="page-actions">${statusActions.join('')}</div>
    </div>

    <div class="${isAdmin ? 'grid-2' : ''}" style="margin-bottom:16px">
      <div class="card">
        <div class="card-header"><h3>Detalle del pedido</h3>${badge(o.status)}</div>
        <div class="cost-row"><span class="muted">Cliente</span><strong>${o.cliente}</strong></div>
        <div class="cost-row"><span class="muted">Servicio</span><span>${o.servicio_nombre}</span></div>
        <div class="cost-row"><span class="muted">Área</span><span>${AREAS[o.area] || o.area}</span></div>
        <div class="cost-row"><span class="muted">Cantidad</span><span>${o.cantidad} pzas</span></div>
        <div class="cost-row"><span class="muted">Entrega prometida</span><span>${fmtDate(o.fecha_entrega)}</span></div>
        ${o.started_at ? `<div class="cost-row"><span class="muted">Inicio producción</span><span>${fmtDate(o.started_at)}</span></div>` : ''}
        ${o.completed_at ? `<div class="cost-row"><span class="muted">Completado</span><span>${fmtDate(o.completed_at)}</span></div>` : ''}
        ${o.horas_reales ? `<div class="cost-row"><span class="muted">Horas reales</span><span>${o.horas_reales}h</span></div>` : ''}
        ${o.piezas_merma ? `<div class="cost-row"><span class="muted">Piezas de merma</span><span style="color:var(--red)">${o.piezas_merma} pzas</span></div>` : ''}
        ${o.descripcion ? `<div style="margin-top:12px"><small class="muted">Descripción</small><p style="margin-top:4px">${o.descripcion}</p></div>` : ''}
        ${o.notas_produccion ? `<div style="margin-top:12px"><small class="muted">Notas producción</small><p style="margin-top:4px;color:var(--accent)">${o.notas_produccion}</p></div>` : ''}
      </div>

      ${isAdmin && c ? `
      <div class="card">
        <div class="card-header"><h3>Costos y margen</h3></div>
        <div class="cost-row"><span>Materiales</span><span>$${fmt(c.costoMateriales)}</span></div>
        <div class="cost-row"><span>Mano de obra</span><span>$${fmt(c.costoManoObra)}</span></div>
        <div class="cost-row"><span>Merma</span><span style="color:var(--red)">$${fmt(c.costoMerma)}</span></div>
        <div class="cost-row"><span>Gastos fijos prorateados</span><span>$${fmt(c.costoFijos)}</span></div>
        <div class="cost-row total"><span>Costo total</span><span>$${fmt(c.costoTotal)}</span></div>
        <div class="cost-row total"><span>Precio de venta</span><span>$${fmt(c.precioVenta)}</span></div>
        <div class="cost-row margin">
          <span>Margen</span>
          <span class="${c.margen >= 0 ? 'margin-positive' : 'margin-negative'}">${c.margen}%</span>
        </div>
        <div class="cost-row">
          <span>Utilidad</span>
          <span class="${c.utilidad >= 0 ? 'margin-positive' : 'margin-negative'}">$${fmt(c.utilidad)}</span>
        </div>
      </div>
      ` : ''}
    </div>

    ${isAdmin || isProd ? `
    <div class="grid-2" style="margin-bottom:16px">
      <!-- Materials -->
      <div class="card">
        <div class="card-header">
          <h3>Materiales utilizados</h3>
          <button class="btn btn-ghost btn-sm" onclick="openMaterialForm(${o.id})">+ Agregar</button>
        </div>
        <div id="mat-list">${materialsList(o.materials, o.id)}</div>
      </div>

      <!-- Labor / Tiempo -->
      <div class="card">
        <div class="card-header">
          <h3>Tiempo registrado</h3>
          <button class="btn btn-ghost btn-sm" onclick="openLaborForm(${o.id})">+ Registrar</button>
        </div>
        <div id="labor-list">${laborList(o.labor, o.id)}</div>
      </div>
    </div>
    ` : ''}

    <!-- Log -->
    <div class="card">
      <h3 style="margin-bottom:14px">Historial de actividad</h3>
      ${o.logs.length ? o.logs.map(l => `
        <div class="log-item">
          <div class="log-dot"></div>
          <div class="log-content">
            <div class="log-action">${l.accion}</div>
            ${l.notas ? `<div>${l.notas}</div>` : ''}
            <div class="log-meta">${l.user_nombre || '—'} · ${fmtDate(l.timestamp)} ${l.timestamp.slice(11,16)}</div>
          </div>
        </div>
      `).join('') : '<div class="muted" style="font-size:.88rem">Sin actividad registrada</div>'}
    </div>
  `;

  window._currentOrderId = id;
}

function materialsList(mats, orderId) {
  if (!mats.length) return '<div class="muted" style="font-size:.88rem;padding:8px 0">Sin materiales registrados</div>';
  const isAdmin = currentUser.role === 'admin';
  return `<div class="inline-list">${mats.map(m => `
    <div class="pill">
      ${m.material} · ${m.cantidad} ${m.unidad}${isAdmin ? ` · $${fmt(m.costo_unitario)}` : ''}
      <button onclick="deleteMaterial(${orderId},${m.id})" title="Eliminar">✕</button>
    </div>
  `).join('')}</div>`;
}

function laborList(labor, orderId) {
  if (!labor.length) return '<div class="muted" style="font-size:.88rem;padding:8px 0">Sin tiempo registrado</div>';
  const isAdmin = currentUser.role === 'admin';
  return `<div class="inline-list">${labor.map(l => `
    <div class="pill">
      ${l.nombre_operador} · ${l.horas}h${isAdmin && l.costo_hora ? ` · $${fmt(l.costo_hora)}/h` : ''}
      <button onclick="deleteLabor(${orderId},${l.id})" title="Eliminar">✕</button>
    </div>
  `).join('')}</div>`;
}

/* ── Inline material/labor forms ────────────────────────────────────────── */
function openMaterialForm(orderId) {
  const isAdmin = currentUser.role === 'admin';
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.id = 'modal-mat-inline';
  el.innerHTML = `
    <div class="modal">
      <h2>Agregar material</h2>
      <div class="form-row">
        <div class="form-group"><label>Material *</label><input id="m-mat" placeholder="ej. Arena fina, Tinta blanca"></div>
        <div class="form-group"><label>Cantidad</label><input id="m-cant" type="number" value="1" step="0.01"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Unidad</label><input id="m-uni" value="pza" placeholder="pza, kg, lt, m..."></div>
        ${isAdmin ? `<div class="form-group"><label>Costo unitario ($)</label><input id="m-cost" type="number" value="0" step="0.01"></div>` : '<input type="hidden" id="m-cost" value="0">'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveMaterial(${orderId})">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function saveMaterial(orderId) {
  try {
    await api(`/orders/${orderId}/materials`, 'POST', {
      material: $('m-mat').value,
      cantidad: parseFloat($('m-cant').value),
      unidad: $('m-uni').value,
      costo_unitario: parseFloat($('m-cost').value),
    });
    document.getElementById('modal-mat-inline')?.remove();
    await refreshOrderCosts(orderId);
    toast('Material agregado');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteMaterial(orderId, matId) {
  if (!confirm('¿Eliminar este material?')) return;
  await api(`/orders/${orderId}/materials/${matId}`, 'DELETE');
  await refreshOrderCosts(orderId);
  toast('Eliminado');
}

function openLaborForm(orderId) {
  const isAdmin = currentUser.role === 'admin';
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.id = 'modal-labor-inline';
  el.innerHTML = `
    <div class="modal">
      <h2>Registrar tiempo</h2>
      <div class="form-row">
        <div class="form-group"><label>Operador</label><input id="l-op" value="${currentUser.nombre}"></div>
        <div class="form-group"><label>Horas trabajadas</label><input id="l-hrs" type="number" value="1" step="0.25"></div>
      </div>
      ${isAdmin ? `<div class="form-group"><label>Costo por hora ($)</label><input id="l-rate" type="number" value="150" step="0.01"></div>` : '<input type="hidden" id="l-rate" value="0">'}
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveLabor(${orderId})">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function saveLabor(orderId) {
  try {
    await api(`/orders/${orderId}/labor`, 'POST', {
      nombre_operador: $('l-op').value,
      horas: parseFloat($('l-hrs').value),
      costo_hora: parseFloat($('l-rate').value),
    });
    document.getElementById('modal-labor-inline')?.remove();
    await refreshOrderCosts(orderId);
    toast('Mano de obra registrada');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteLabor(orderId, lid) {
  if (!confirm('¿Eliminar este registro?')) return;
  await api(`/orders/${orderId}/labor/${lid}`, 'DELETE');
  await refreshOrderCosts(orderId);
  toast('Eliminado');
}

async function refreshOrderCosts(orderId) {
  const o = await api(`/orders/${orderId}`);
  const matEl = $('mat-list');
  const labEl = $('labor-list');
  if (matEl) matEl.innerHTML = materialsList(o.materials, orderId);
  if (labEl) labEl.innerHTML = laborList(o.labor, orderId);
  // refresh cost cards
  const c = o.costos;
  const rows = document.querySelectorAll('.cost-row');
  // re-render is simpler than patching — just reload view
  await viewOrder(orderId);
}

/* ── New/Edit Order Modal ───────────────────────────────────────────────── */
async function openOrderModal(id = null) {
  editOrderId = id;
  $('modal-order-title').textContent = id ? 'Editar pedido' : 'Nuevo pedido';

  // Load services for dropdown
  const svcs = await api('/services');
  $('o-servicio').innerHTML = '<option value="">— Sin especificar —</option>' +
    svcs.filter(s => s.activo).map(s => `<option value="${s.id}" data-area="${s.area}" data-mat="${s.costo_material_base}" data-hrs="${s.tiempo_estimado_hrs}" data-hr="${s.costo_hora}">${s.nombre} (${AREAS[s.area]})</option>`).join('');

  if (id) {
    const o = await api(`/orders/${id}`);
    $('o-cliente').value = o.cliente;
    $('o-cantidad').value = o.cantidad;
    $('o-area').value = o.area;
    $('o-precio').value = o.precio_venta;
    $('o-fecha').value = o.fecha_entrega ? o.fecha_entrega.slice(0, 10) : '';
    $('o-desc').value = o.descripcion || '';
    $('o-notas').value = o.notas_produccion || '';
    if (o.servicio_id) $('o-servicio').value = o.servicio_id;
  } else {
    $('o-cliente').value = '';
    $('o-cantidad').value = 1;
    $('o-area').value = 'sandblast';
    $('o-precio').value = 0;
    $('o-fecha').value = '';
    $('o-desc').value = '';
    $('o-notas').value = '';
  }

  // Auto-fill area when service is chosen
  $('o-servicio').onchange = () => {
    const opt = $('o-servicio').selectedOptions[0];
    if (opt && opt.dataset.area) $('o-area').value = opt.dataset.area;
  };

  openModal('modal-order');
}

$('modal-order-save').onclick = async () => {
  const body = {
    cliente: $('o-cliente').value.trim(),
    servicio_id: $('o-servicio').value || null,
    servicio_nombre: $('o-servicio').selectedOptions[0]?.text || 'Sin especificar',
    area: $('o-area').value,
    cantidad: parseInt($('o-cantidad').value),
    descripcion: $('o-desc').value.trim() || null,
    precio_venta: parseFloat($('o-precio').value) || 0,
    fecha_entrega: $('o-fecha').value || null,
    notas_produccion: $('o-notas').value.trim() || null,
  };
  if (!body.cliente) return toast('El cliente es requerido', 'error');
  try {
    if (editOrderId) {
      await api(`/orders/${editOrderId}`, 'PUT', body);
      closeModal('modal-order');
      viewOrder(editOrderId);
      toast('Pedido actualizado');
    } else {
      const r = await api('/orders', 'POST', body);
      closeModal('modal-order');
      navigate('orders');
      toast(`Pedido ${r.folio} creado`);
    }
  } catch (e) { toast(e.message, 'error'); }
};

function renderNewOrderForm() { openOrderModal(); navigate('orders'); }

/* ── Status changes ─────────────────────────────────────────────────────── */
async function changeStatus(id, status) {
  const labels = { en_produccion: 'iniciar producción', entregado: 'marcar como entregado', cancelado: 'cancelar' };
  if (!confirm(`¿${labels[status] || status} este pedido?`)) return;
  try {
    await api(`/orders/${id}/status`, 'PATCH', { status });
    viewOrder(id);
    toast('Estatus actualizado');
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Complete modal ─────────────────────────────────────────────────────── */
function openCompleteModal(id) {
  completeOrderId = id;
  $('c-horas').value = 0;
  $('c-costo-hora').value = 150;
  $('c-merma-pzas').value = 0;
  $('c-merma-costo').value = 0;
  $('c-notas').value = '';
  openModal('modal-complete');
}

$('modal-complete-save').onclick = async () => {
  const horas = parseFloat($('c-horas').value) || 0;
  const costoHora = parseFloat($('c-costo-hora').value) || 0;
  try {
    // Register labor entry
    if (horas > 0) {
      await api(`/orders/${completeOrderId}/labor`, 'POST', {
        horas,
        costo_hora: costoHora,
        nombre_operador: currentUser.nombre,
      });
    }
    // Mark completed
    await api(`/orders/${completeOrderId}/status`, 'PATCH', {
      status: 'completado',
      horas_reales: horas,
      piezas_merma: parseInt($('c-merma-pzas').value) || 0,
      costo_merma: parseFloat($('c-merma-costo').value) || 0,
      notas_produccion: $('c-notas').value.trim() || null,
    });
    closeModal('modal-complete');
    viewOrder(completeOrderId);
    toast('Pedido completado');
  } catch (e) { toast(e.message, 'error'); }
};

/* ── Producción view ────────────────────────────────────────────────────── */
async function renderProduccion(showAll) {
  const areaParam = (!showAll && currentUser.area) ? `&area=${currentUser.area}` : '';
  const [pendientes, en_prod, completados] = await Promise.all([
    api(`/orders?status=nuevo${areaParam}`),
    api(`/orders?status=en_produccion${areaParam}`),
    api(`/orders?status=completado${areaParam}`),
  ]);

  const areaLabel = showAll ? 'Todas las áreas' : (AREAS[currentUser.area] || 'Mi área');

  $('view').innerHTML = `
    <div class="page-title">
      <h1>Producción · ${areaLabel}</h1>
      <p>Pedidos asignados</p>
    </div>

    <h3 style="margin-bottom:12px">Por iniciar <span style="color:var(--text-muted);font-weight:400">(${pendientes.length})</span></h3>
    ${produccionCards(pendientes)}

    <h3 style="margin:24px 0 12px">En producción <span style="color:var(--accent);font-weight:400">(${en_prod.length})</span></h3>
    ${produccionCards(en_prod)}

    <h3 style="margin:24px 0 12px">Completados recientes <span style="color:var(--green);font-weight:400">(${completados.length})</span></h3>
    ${produccionCards(completados)}
  `;
}

function produccionCards(orders) {
  if (!orders.length) return '<div class="muted" style="font-size:.88rem;margin-bottom:8px">Sin pedidos</div>';
  return `<div class="grid-3" style="margin-bottom:8px">
    ${orders.map(o => `
      <div class="card" style="cursor:pointer" onclick="viewOrder(${o.id})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <span class="td-folio" style="font-size:.85rem">${o.folio}</span>
          ${badge(o.status)}
        </div>
        <strong style="display:block;margin-bottom:4px">${o.cliente}</strong>
        <small class="muted">${o.servicio_nombre || '—'}</small>
        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
          <small class="muted">${o.cantidad} pzas · ${AREAS[o.area] || o.area}</small>
          <small class="muted">${fmtDate(o.fecha_entrega)}</small>
        </div>
        ${o.notas_produccion ? `<div style="margin-top:8px;padding:8px;background:rgba(245,197,24,.08);border-radius:6px;font-size:.8rem;color:var(--accent)">📌 ${o.notas_produccion}</div>` : ''}
      </div>
    `).join('')}
  </div>`;
}

/* ── Reports ────────────────────────────────────────────────────────────── */
async function renderReports() {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = today.slice(0, 8) + '01';

  $('view').innerHTML = `
    <div class="page-title"><h1>Reportes</h1><p>Análisis de costos y rentabilidad</p></div>
    <div class="filters" style="margin-bottom:20px">
      <input type="date" id="r-desde" value="${firstDay}">
      <input type="date" id="r-hasta" value="${today}">
      <button class="btn btn-primary btn-sm" onclick="loadReport()">Generar reporte</button>
    </div>
    <div id="report-content"><div class="empty"><div class="icon">📊</div>Selecciona un rango de fechas y haz clic en Generar</div></div>
  `;
  await loadReport();
}

async function loadReport() {
  const desde = $('r-desde').value;
  const hasta = $('r-hasta').value;
  try {
    const s = await api(`/reports/summary?desde=${desde}&hasta=${hasta}`);
    const c = s.counters;
    $('report-content').innerHTML = `
      <div class="grid-4" style="margin-bottom:16px">
        <div class="stat-card purple"><div class="label">Pedidos</div><div class="value">${c.total}</div><div class="sub">${c.cancelados} cancelados</div></div>
        <div class="stat-card green"><div class="label">Ventas</div><div class="value">$${fmt(s.totalVenta)}</div></div>
        <div class="stat-card"><div class="label">Costo total</div><div class="value">$${fmt(s.totalCosto)}</div></div>
        <div class="stat-card ${s.margen >= 30 ? 'green' : s.margen >= 0 ? 'yellow' : 'red'}">
          <div class="label">Margen</div><div class="value">${s.margen}%</div>
          <div class="sub">$${fmt(s.utilidad)} utilidad</div>
        </div>
      </div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="stat-card red"><div class="label">Costo de merma</div><div class="value">$${fmt(s.totalMerma)}</div></div>
        <div class="stat-card"><div class="label">Estado pedidos</div>
          <div style="margin-top:8px;font-size:.88rem">
            ${Object.entries({ nuevos: c.nuevos, en_produccion: c.en_produccion, completados: c.completados, entregados: c.entregados }).map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="muted">${STATUS[k] || k}</span><strong>${v}</strong></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:16px">Por área</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Área</th><th>Pedidos</th><th class="text-right">Ventas</th><th class="text-right">Costo</th><th class="text-right">Margen</th></tr></thead>
          <tbody>
            ${Object.entries(s.porArea).map(([area, d]) => {
              const m = d.venta > 0 ? ((d.venta - d.costo) / d.venta * 100).toFixed(1) : 0;
              return `<tr>
                <td>${AREAS[area] || area}</td>
                <td>${d.pedidos}</td>
                <td class="text-right">$${fmt(d.venta)}</td>
                <td class="text-right">$${fmt(d.costo)}</td>
                <td class="text-right" style="color:${m >= 30 ? 'var(--green)' : m >= 0 ? 'var(--accent)' : 'var(--red)'}">${m}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    `;
  } catch (e) { $('report-content').innerHTML = `<div class="empty"><div class="icon">⚠️</div>${e.message}</div>`; }
}

/* ── Config: Services ───────────────────────────────────────────────────── */
async function renderConfigServices() {
  const svcs = await api('/services');
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Servicios</h1><p>Costos base por tipo de trabajo</p></div>
      <button class="btn btn-primary" onclick="openSvcModal()">+ Nuevo servicio</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Área</th><th>Mat. base</th><th>Hrs est.</th><th>$/Hora</th><th>Costo est.</th><th>Activo</th><th></th></tr></thead>
        <tbody>
          ${svcs.map(s => `<tr>
            <td><strong>${s.nombre}</strong></td>
            <td>${AREAS[s.area] || s.area}</td>
            <td>$${fmt(s.costo_material_base)}</td>
            <td>${s.tiempo_estimado_hrs}h</td>
            <td>$${fmt(s.costo_hora)}</td>
            <td>$${fmt(s.costo_material_base + s.tiempo_estimado_hrs * s.costo_hora)}</td>
            <td>${s.activo ? '✅' : '❌'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="openSvcModal(${s.id})">Editar</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

async function openSvcModal(id = null) {
  editSvcId = id;
  $('modal-svc-title').textContent = id ? 'Editar servicio' : 'Nuevo servicio';
  if (id) {
    const svcs = await api('/services');
    const s = svcs.find(x => x.id === id);
    $('s-nombre').value = s.nombre;
    $('s-area').value = s.area;
    $('s-mat').value = s.costo_material_base;
    $('s-tiempo').value = s.tiempo_estimado_hrs;
    $('s-hora').value = s.costo_hora;
  } else {
    $('s-nombre').value = ''; $('s-area').value = 'sandblast';
    $('s-mat').value = 0; $('s-tiempo').value = 1; $('s-hora').value = 150;
  }
  openModal('modal-service');
}

$('modal-svc-save').onclick = async () => {
  const body = {
    nombre: $('s-nombre').value.trim(),
    area: $('s-area').value,
    costo_material_base: parseFloat($('s-mat').value) || 0,
    tiempo_estimado_hrs: parseFloat($('s-tiempo').value) || 1,
    costo_hora: parseFloat($('s-hora').value) || 0,
  };
  if (!body.nombre) return toast('El nombre es requerido', 'error');
  try {
    if (editSvcId) await api(`/services/${editSvcId}`, 'PUT', body);
    else await api('/services', 'POST', body);
    closeModal('modal-service');
    renderConfigServices();
    toast(editSvcId ? 'Servicio actualizado' : 'Servicio creado');
  } catch (e) { toast(e.message, 'error'); }
};

/* ── Config: Fixed costs ────────────────────────────────────────────────── */
async function renderConfigFixed() {
  const fcs = await api('/fixed-costs');
  const total = fcs.filter(f => f.activo).reduce((s, f) => s + f.monto_mensual, 0);
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Gastos fijos</h1><p>Total mensual: <strong>$${fmt(total)}</strong> · Prorateados entre pedidos según horas</p></div>
      <button class="btn btn-primary" onclick="openFcModal()">+ Agregar gasto</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Concepto</th><th>Monto mensual</th><th>Activo</th><th></th></tr></thead>
        <tbody>
          ${fcs.map(f => `<tr>
            <td>${f.nombre}</td>
            <td>$${fmt(f.monto_mensual)}</td>
            <td>${f.activo ? '✅' : '❌'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="openFcModal(${f.id})">Editar</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="card mt-16" style="border-color:var(--primary)">
      <small class="muted">Los gastos fijos se distribuyen proporcionalmente entre pedidos según las horas reales trabajadas. Se asumen 176 horas productivas al mes (22 días × 8 horas). Costo por hora de gastos fijos: <strong>$${fmt(total / 176)}/hr</strong></small>
    </div>
  `;
}

async function openFcModal(id = null) {
  editFcId = id;
  if (id) {
    const fcs = await api('/fixed-costs');
    const f = fcs.find(x => x.id === id);
    $('fc-nombre').value = f.nombre;
    $('fc-monto').value = f.monto_mensual;
  } else {
    $('fc-nombre').value = ''; $('fc-monto').value = 0;
  }
  openModal('modal-fc');
}

$('modal-fc-save').onclick = async () => {
  const body = { nombre: $('fc-nombre').value.trim(), monto_mensual: parseFloat($('fc-monto').value) || 0 };
  if (!body.nombre) return toast('El nombre es requerido', 'error');
  try {
    if (editFcId) await api(`/fixed-costs/${editFcId}`, 'PUT', body);
    else await api('/fixed-costs', 'POST', body);
    closeModal('modal-fc');
    renderConfigFixed();
    toast('Guardado');
  } catch (e) { toast(e.message, 'error'); }
};

/* ── Config: Users ──────────────────────────────────────────────────────── */
async function renderConfigUsers() {
  const users = await api('/users');
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Usuarios</h1><p>Equipo con acceso al sistema</p></div>
      <button class="btn btn-primary" onclick="openUserModal()">+ Nuevo usuario</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Área</th><th>Activo</th><th></th></tr></thead>
        <tbody>
          ${users.map(u => `<tr>
            <td><strong>${u.nombre}</strong></td>
            <td class="muted">${u.username}</td>
            <td>${{ admin: '⚙️ Admin', ventas: '💼 Ventas', produccion: '🏭 Producción' }[u.role] || u.role}</td>
            <td>${u.area ? (AREAS[u.area] || u.area) : '—'}</td>
            <td>${u.activo ? '✅' : '❌'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="openUserModal(${u.id})">Editar</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

async function openUserModal(id = null) {
  editUserId = id;
  $('modal-user-title').textContent = id ? 'Editar usuario' : 'Nuevo usuario';
  $('u-password').required = !id;
  $('u-password').placeholder = id ? 'Dejar vacío para no cambiar' : 'mínimo 6 caracteres';

  if (id) {
    const users = await api('/users');
    const u = users.find(x => x.id === id);
    $('u-nombre').value = u.nombre;
    $('u-username').value = u.username;
    $('u-username').disabled = true;
    $('u-role').value = u.role;
    $('u-area').value = u.area || 'sandblast';
    $('u-password').value = '';
  } else {
    $('u-nombre').value = '';
    $('u-username').value = '';
    $('u-username').disabled = false;
    $('u-role').value = 'produccion';
    $('u-area').value = 'sandblast';
    $('u-password').value = '';
  }
  toggleAreaField();
  openModal('modal-user');
}

function toggleAreaField() {
  const role = $('u-role').value;
  $('u-area-group').style.display = role === 'produccion' ? '' : 'none';
}

$('modal-user-save').onclick = async () => {
  const body = {
    nombre: $('u-nombre').value.trim(),
    role: $('u-role').value,
    area: $('u-role').value === 'produccion' ? $('u-area').value : null,
  };
  if (!editUserId) {
    body.username = $('u-username').value.trim();
    body.password = $('u-password').value;
  } else if ($('u-password').value) {
    body.password = $('u-password').value;
  }
  if (!body.nombre) return toast('El nombre es requerido', 'error');
  if (!editUserId && (!body.username || !body.password)) return toast('Usuario y contraseña requeridos', 'error');
  try {
    if (editUserId) await api(`/users/${editUserId}`, 'PUT', body);
    else await api('/users', 'POST', body);
    closeModal('modal-user');
    renderConfigUsers();
    toast(editUserId ? 'Usuario actualizado' : 'Usuario creado');
  } catch (e) { toast(e.message, 'error'); }
};

/* ── Init ───────────────────────────────────────────────────────────────── */
if (token) {
  bootApp();
} else {
  $('login-screen').style.display = '';
}
