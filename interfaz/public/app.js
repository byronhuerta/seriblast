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
  dtf_uv: 'DTF UV', vitrificado: 'Vitrificado', bordado: 'Bordado',
  serigrafia: 'Serigrafía', diseno: 'Diseño'
};
const STATUS = {
  nuevo: 'Nuevo', en_produccion: 'En producción',
  completado: 'Completado', entregado: 'Entregado', cancelado: 'Cancelado'
};

function fmt(n) { return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(s) { if (!s) return '—'; return s.slice(0, 10).split('-').reverse().join('/'); }
function badge(status) { return `<span class="badge badge-${status}">${STATUS[status] || status}</span>`; }

function deliveryAlert(fecha, status) {
  if (!fecha || ['completado', 'entregado', 'cancelado'].includes(status)) return { cls: '', tag: '' };
  const today = new Date().toISOString().slice(0, 10);
  const tom   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (fecha < today) return { cls: 'overdue',   tag: '<span class="alert-tag overdue">VENCIDO</span>' };
  if (fecha === today) return { cls: 'today-due', tag: '<span class="alert-tag today">HOY</span>' };
  if (fecha === tom)   return { cls: '',          tag: '<span class="alert-tag tomorrow">MAÑANA</span>' };
  return { cls: '', tag: '' };
}

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
    add('kanban', '🗂️', 'Kanban');
    add('calendar', '📅', 'Calendario');
    add('clients', '👤', 'Clientes');
    add('cobrar', '💳', 'Por cobrar');
    add('cotizador', '🧮', 'Cotizador');
    add('eficiencia', '⚡', 'Eficiencia');
    add('tendencias', '📈', 'Tendencias');
    add('tiempos', '⏱️', 'Tiempos');
    add('merma', '📉', 'Merma');
    add('inventario', '📦', 'Inventario');
    add('reports', '📋', 'Reportes');
    add('config-services', '⚙️', 'Servicios');
    add('config-fixed', '💰', 'Gastos fijos');
    add('config-users', '👥', 'Usuarios');
    add('config-checklist', '✅', 'Checklists');
  } else if (currentUser.role === 'ventas') {
    add('orders', '📋', 'Pedidos');
    add('kanban', '🗂️', 'Kanban');
    add('calendar', '📅', 'Calendario');
    add('clients', '👤', 'Clientes');
    add('cobrar', '💳', 'Por cobrar');
    add('cotizador', '🧮', 'Cotizador');
    add('new-order', '➕', 'Nuevo pedido');
  } else {
    add('produccion', '🏭', 'Mi área');
    add('kanban', '🗂️', 'Kanban');
    add('calendar', '📅', 'Calendario');
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
      case 'kanban': await renderKanban(); break;
      case 'calendar': await renderCalendar(); break;
      case 'clients': await renderClients(); break;
      case 'cotizador': await renderCotizador(); break;
      case 'eficiencia': await renderEficiencia(); break;
      case 'tendencias': await renderTendencias(); break;
      case 'tiempos': await renderTiempos(); break;
      case 'merma': await renderMermaAnalysis(); break;
      case 'cobrar': await renderCobrar(); break;
      case 'inventario': await renderInventario(); break;
      case 'new-order': renderNewOrderForm(); break;
      case 'produccion': await renderProduccion(false); break;
      case 'produccion-all': await renderProduccion(true); break;
      case 'reports': await renderReports(); break;
      case 'config-services': await renderConfigServices(); break;
      case 'config-fixed': await renderConfigFixed(); break;
      case 'config-users': await renderConfigUsers(); break;
      case 'config-checklist': await renderConfigChecklist(); break;
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
  const isAdmin = currentUser.role === 'admin';
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Folio</th><th>Cliente</th><th>Servicio</th><th>Área</th>
      ${!minimal ? '<th>Cantidad</th>' : ''}
      <th>Estatus</th>${isAdmin ? '<th>Pago</th>' : ''}<th>Entrega</th><th></th>
    </tr></thead>
    <tbody>
      ${orders.map(o => {
        const al = deliveryAlert(o.fecha_entrega, o.status);
        return `<tr class="row-${al.cls}">
          <td class="td-folio">${o.folio}</td>
          <td><strong>${o.cliente}</strong></td>
          <td><small class="muted">${o.servicio_nombre || '—'}</small></td>
          <td>${AREAS[o.area] || o.area}</td>
          ${!minimal ? `<td>${o.cantidad}</td>` : ''}
          <td>${badge(o.status)}</td>
          ${isAdmin ? `<td>${pagoStatusBadge(o)}</td>` : ''}
          <td>${fmtDate(o.fecha_entrega)}${al.tag}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="viewOrder('${o.id}')">Ver →</button></td>
        </tr>`;
      }).join('')}
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
    if (o.status === 'nuevo') statusActions.push(`<button class="btn btn-warning btn-sm" onclick="changeStatus('${o.id}','en_produccion')">Iniciar producción</button>`);
    if (o.status === 'en_produccion') statusActions.push(`<button class="btn btn-success btn-sm" onclick="openCompleteModal('${o.id}')">Marcar completado</button>`);
  }
  if (isAdmin || isVentas) {
    if (o.status === 'completado') statusActions.push(`<button class="btn btn-primary btn-sm" onclick="changeStatus('${o.id}','entregado')">Marcar entregado</button>`);
    if (!['entregado','cancelado'].includes(o.status)) statusActions.push(`<button class="btn btn-danger btn-sm" onclick="changeStatus('${o.id}','cancelado')">Cancelar</button>`);
  }
  if (isAdmin && !['entregado','cancelado'].includes(o.status)) {
    statusActions.push(`<button class="btn btn-ghost btn-sm" onclick="openOrderModal('${o.id}')">Editar</button>`);
  }
  if ((isAdmin || isVentas) && !['cancelado'].includes(o.status)) {
    statusActions.push(`<button class="btn btn-ghost btn-sm" onclick="openPaymentModal('${o.id}',${o.precio_venta||0},${o.anticipo||0},${o.pagado||false})">💳 Pago</button>`);
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
        ${isAdmin && o.precio_venta ? `<div class="cost-row"><span class="muted">Pago</span><span>${pagoStatusBadge(o)}</span></div>` : ''}
        ${isAdmin && o.metodo_pago ? `<div class="cost-row"><span class="muted">Método pago</span><span>${o.metodo_pago}</span></div>` : ''}
        ${isAdmin && o.notas_pago ? `<div class="cost-row"><span class="muted">Nota pago</span><span class="muted" style="font-size:.82rem">${o.notas_pago}</span></div>` : ''}
        ${o.descripcion ? `<div style="margin-top:12px"><small class="muted">Descripción</small><p style="margin-top:4px">${o.descripcion}</p></div>` : ''}
        ${o.notas_produccion ? `<div style="margin-top:12px"><small class="muted">Notas producción</small><p style="margin-top:4px;color:var(--accent)">${o.notas_produccion}</p></div>` : ''}
      </div>

      ${isAdmin && c ? `
      <div class="card">
        <div class="card-header">
          <h3>Costos y ganancia</h3>
          <span class="muted" style="font-size:.82rem">${c.cantidad} pza(s)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Concepto</th><th class="text-right">Por pieza</th><th class="text-right">Total</th></tr></thead>
            <tbody>
              <tr><td>Materiales</td><td class="text-right">$${fmt(c.costoMaterialesU)}</td><td class="text-right">$${fmt(c.costoMateriales)}</td></tr>
              <tr><td>Mano de obra</td><td class="text-right">$${fmt(c.costoManoObraU)}</td><td class="text-right">$${fmt(c.costoManoObra)}</td></tr>
              <tr><td style="color:var(--red)">Merma</td><td class="text-right" style="color:var(--red)">$${fmt(c.costoMermaU)}</td><td class="text-right" style="color:var(--red)">$${fmt(c.costoMerma)}</td></tr>
              <tr><td>Gastos fijos</td><td class="text-right">$${fmt(c.costoFijosU)}</td><td class="text-right">$${fmt(c.costoFijos)}</td></tr>
              <tr style="font-weight:700;border-top:1px solid var(--border)">
                <td>Costo total</td><td class="text-right">$${fmt(c.costoTotalU)}</td><td class="text-right">$${fmt(c.costoTotal)}</td>
              </tr>
              <tr style="font-weight:700">
                <td>Precio cobrado</td><td class="text-right">$${fmt(c.precioVentaU)}</td><td class="text-right">$${fmt(c.precioVenta)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap">
          <div class="stat-card ${c.margen >= 30 ? 'green' : c.margen >= 0 ? 'yellow' : 'red'}" style="flex:1;min-width:120px">
            <div class="label">% Ganancia</div>
            <div class="value">${c.margen}%</div>
          </div>
          <div class="stat-card ${c.utilidadU >= 0 ? 'green' : 'red'}" style="flex:1;min-width:120px">
            <div class="label">Ganancia / pieza</div>
            <div class="value">$${fmt(c.utilidadU)}</div>
          </div>
          <div class="stat-card ${c.utilidad >= 0 ? 'green' : 'red'}" style="flex:1;min-width:120px">
            <div class="label">Ganancia total</div>
            <div class="value">$${fmt(c.utilidad)}</div>
          </div>
        </div>
      </div>
      ` : ''}
    </div>

    <!-- Render del diseño (visible para todos) -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3>Render / Diseño</h3>
        <div style="display:flex;gap:8px">
          <label class="btn btn-ghost btn-sm no-print" style="cursor:pointer">
            📎 Subir imagen
            <input type="file" accept="image/*" style="display:none" onchange="uploadRender('${o.id}',this)">
          </label>
          ${o.render_file ? `<button class="btn btn-danger btn-sm no-print" onclick="deleteRender('${o.id}')">Quitar</button>` : ''}
          <button class="btn btn-ghost btn-sm no-print" onclick="printTicket('${o.id}')">🖨️ Imprimir ticket</button>
        </div>
      </div>
      ${o.render_file
        ? `<div class="render-box" style="cursor:default"><img src="/uploads/${o.render_file}" alt="${o.render_original || 'Render'}"></div>`
        : `<div class="render-box" onclick="document.querySelector('#view input[type=file]').click()">
             <div class="upload-hint">📷 Sin render todavía<br><small>Haz clic o sube una imagen de referencia para producción</small></div>
           </div>`
      }
    </div>

    ${isAdmin || isProd ? `
    <div class="grid-2" style="margin-bottom:16px">
      <!-- Materials -->
      <div class="card">
        <div class="card-header">
          <h3>Materiales utilizados</h3>
          <button class="btn btn-ghost btn-sm" onclick="openMaterialForm('${o.id}')">+ Agregar</button>
        </div>
        <div id="mat-list">${materialsList(o.materials, o.id)}</div>
      </div>

      <!-- Labor / Tiempo -->
      <div class="card">
        <div class="card-header">
          <h3>Tiempo registrado</h3>
          <button class="btn btn-ghost btn-sm" onclick="openLaborForm('${o.id}')">+ Registrar</button>
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
      <button onclick="deleteMaterial('${orderId}','${m.id}')" title="Eliminar">✕</button>
    </div>
  `).join('')}</div>`;
}

function laborList(labor, orderId) {
  if (!labor.length) return '<div class="muted" style="font-size:.88rem;padding:8px 0">Sin tiempo registrado</div>';
  const isAdmin = currentUser.role === 'admin';
  return `<div class="inline-list">${labor.map(l => `
    <div class="pill">
      ${l.nombre_operador} · ${l.horas}h${isAdmin && l.costo_hora ? ` · $${fmt(l.costo_hora)}/h` : ''}
      <button onclick="deleteLabor('${orderId}','${l.id}')" title="Eliminar">✕</button>
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
        <button class="btn btn-primary" onclick="saveMaterial('${orderId}')">Guardar</button>
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
        <button class="btn btn-primary" onclick="saveLabor('${orderId}')">Guardar</button>
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
    // Mostrar precio POR PIEZA al editar
    $('o-precio').value = o.cantidad > 0 ? +((o.precio_venta || 0) / o.cantidad).toFixed(2) : 0;
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
    // Guardar precio TOTAL = precio_por_pieza × cantidad
    precio_venta: (parseFloat($('o-precio').value) || 0) * (parseInt($('o-cantidad').value) || 1),
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
async function openCompleteModal(id) {
  // Fetch order to get area for checklist
  try {
    const o = await api(`/orders/${id}`);
    openCompleteModalWithChecklist(id, o.area);
  } catch {
    completeOrderId = id;
    $('c-horas').value = 0; $('c-costo-hora').value = 150;
    $('c-merma-pzas').value = 0; $('c-merma-costo').value = 0; $('c-notas').value = '';
    $('c-checklist-wrap').style.display = 'none';
    openModal('modal-complete');
  }
}

$('modal-complete-save').onclick = async () => {
  const horas = parseFloat($('c-horas').value) || 0;
  const costoHora = parseFloat($('c-costo-hora').value) || 0;

  // Collect checklist results
  const wrap = $('c-checklist-wrap');
  let checklistLog = null;
  if (wrap && wrap.style.display !== 'none') {
    const allItems = JSON.parse(wrap.dataset.items || '[]');
    const checked = [];
    const unchecked = [];
    allItems.forEach((item, i) => {
      (document.getElementById(`cl-${i}`)?.checked ? checked : unchecked).push(item);
    });
    if (allItems.length) {
      checklistLog = `✅ Checklist (${checked.length}/${allItems.length}): ${checked.join(', ')}${unchecked.length ? ` | Pendiente: ${unchecked.join(', ')}` : ''}`;
    }
  }

  const notasBase = $('c-notas').value.trim();
  const notasFinal = [notasBase, checklistLog].filter(Boolean).join('\n') || null;

  try {
    if (horas > 0) {
      await api(`/orders/${completeOrderId}/labor`, 'POST', {
        horas, costo_hora: costoHora, nombre_operador: currentUser.nombre,
      });
    }
    await api(`/orders/${completeOrderId}/status`, 'PATCH', {
      status: 'completado',
      horas_reales: horas,
      piezas_merma: parseInt($('c-merma-pzas').value) || 0,
      costo_merma: parseFloat($('c-merma-costo').value) || 0,
      notas_produccion: notasFinal,
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
    ${orders.map(o => {
      const al = deliveryAlert(o.fecha_entrega, o.status);
      return `
      <div class="card ${al.cls}" style="cursor:pointer;${al.cls === 'overdue' ? 'border-left:3px solid var(--red)' : al.cls === 'today-due' ? 'border-left:3px solid var(--orange)' : ''}" onclick="viewOrder('${o.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <span class="td-folio" style="font-size:.85rem">${o.folio}</span>
          ${badge(o.status)}
        </div>
        <strong style="display:block;margin-bottom:4px">${o.cliente}</strong>
        <small class="muted">${o.servicio_nombre || '—'}</small>
        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
          <small class="muted">${o.cantidad} pzas · ${AREAS[o.area] || o.area}</small>
          <small>${fmtDate(o.fecha_entrega)}${al.tag}</small>
        </div>
        ${o.notas_produccion ? `<div style="margin-top:8px;padding:8px;background:rgba(245,197,24,.08);border-radius:6px;font-size:.8rem;color:var(--accent)">📌 ${o.notas_produccion}</div>` : ''}
      </div>`;
    }).join('')}
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
            <td><button class="btn btn-ghost btn-sm" onclick="openSvcModal('${s.id}')">Editar</button></td>
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
            <td><button class="btn btn-ghost btn-sm" onclick="openFcModal('${f.id}')">Editar</button></td>
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
            <td><button class="btn btn-ghost btn-sm" onclick="openUserModal('${u.id}')">Editar</button></td>
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

/* ── Render upload ──────────────────────────────────────────────────────── */
async function uploadRender(orderId, input) {
  if (!input.files[0]) return;
  const fd = new FormData();
  fd.append('render', input.files[0]);
  try {
    const r = await fetch(`/api/orders/${orderId}/render`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    toast('Render actualizado');
    viewOrder(orderId);
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteRender(orderId) {
  if (!confirm('¿Quitar el render de este pedido?')) return;
  try {
    await api(`/orders/${orderId}/render`, 'DELETE');
    toast('Render eliminado');
    viewOrder(orderId);
  } catch (e) { toast(e.message, 'error'); }
}

function printTicket(orderId) {
  api(`/orders/${orderId}`).then(o => {
    const c = o.costos;
    const isAdmin = currentUser.role === 'admin';
    $('print-ticket').innerHTML = `
      <div class="ticket-wrap">
        <div class="ticket-header">
          <div>
            <div class="ticket-folio">${o.folio}</div>
            <div style="font-size:.85rem;color:#555">Orden de producción</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700">Seriblast</div>
            <div style="font-size:.82rem;color:#555">Emitido: ${fmtDate(new Date().toISOString())}</div>
          </div>
        </div>
        <div class="ticket-section">
          <h4>Datos del pedido</h4>
          <div class="ticket-row"><span>Cliente</span><strong>${o.cliente}</strong></div>
          <div class="ticket-row"><span>Servicio</span><span>${o.servicio_nombre}</span></div>
          <div class="ticket-row"><span>Área</span><span>${AREAS[o.area] || o.area}</span></div>
          <div class="ticket-row"><span>Cantidad</span><strong>${o.cantidad} pzas</strong></div>
          <div class="ticket-row"><span>Fecha entrega</span><strong>${fmtDate(o.fecha_entrega)}</strong></div>
          ${o.notas_produccion ? `<div class="ticket-row"><span>Notas</span><em>${o.notas_produccion}</em></div>` : ''}
        </div>
        ${o.descripcion ? `<div class="ticket-section"><h4>Descripción del trabajo</h4><p>${o.descripcion}</p></div>` : ''}
        ${o.render_file ? `<div class="ticket-section"><h4>Render / Referencia visual</h4><img src="/uploads/${o.render_file}" class="ticket-render"></div>` : ''}
        ${isAdmin && c ? `
        <div class="ticket-section">
          <h4>Costos (confidencial)</h4>
          <div class="ticket-row"><span>Precio venta</span><strong>$${fmt(c.precioVenta)}</strong></div>
          <div class="ticket-row"><span>Costo estimado</span><span>$${fmt(c.costoTotal)}</span></div>
          <div class="ticket-row"><span>Margen</span><strong>${c.margen}%</strong></div>
        </div>` : ''}
        <div class="ticket-sign">
          <div class="sign-box">Recibido por producción</div>
          <div class="sign-box">Revisado / Entregado</div>
        </div>
      </div>`;
    window.print();
  }).catch(e => toast(e.message, 'error'));
}

/* ── Calendar ───────────────────────────────────────────────────────────── */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;

async function renderCalendar() {
  $('view').innerHTML = `
    <div class="cal-nav">
      <button class="btn btn-ghost btn-sm" onclick="calNav(-1)">← Anterior</button>
      <h2 id="cal-title"></h2>
      <button class="btn btn-ghost btn-sm" onclick="calNav(1)">Siguiente →</button>
    </div>
    <div id="cal-body"></div>
  `;
  await drawCalendar();
}

async function calNav(dir) {
  calMonth += dir;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  if (calMonth < 1)  { calMonth = 12; calYear--; }
  await drawCalendar();
}

async function drawCalendar() {
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  $('cal-title').textContent = `${MONTHS[calMonth-1]} ${calYear}`;

  const list = await api(`/calendar?year=${calYear}&month=${calMonth}`);
  const byDay = {};
  for (const o of list) {
    const d = (o.fecha_entrega || '').slice(8, 10);
    if (d) { if (!byDay[d]) byDay[d] = []; byDay[d].push(o); }
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayDay = today.slice(8, 10);
  const todayMonth = today.slice(0, 7);
  const thisMonth = `${calYear}-${String(calMonth).padStart(2,'0')}`;

  const firstDow = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const prevDays = new Date(calYear, calMonth - 1, 0).getDate();

  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let html = `<div class="cal-grid">`;
  html += DAYS.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  // prev month filler
  for (let i = firstDow - 1; i >= 0; i--) {
    html += `<div class="cal-cell other-month"><div class="cal-num">${prevDays - i}</div></div>`;
  }

  // current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dd = String(day).padStart(2,'0');
    const isToday = thisMonth === todayMonth.slice(0,7) && dd === todayDay;
    const events = byDay[dd] || [];
    const evHtml = events.map(o => {
      const al = deliveryAlert(o.fecha_entrega, o.status);
      const cls = al.cls === 'overdue' ? 'st-overdue' : `st-${o.status}`;
      return `<div class="cal-event ${cls}" onclick="viewOrder('${o.id}')" title="${o.cliente}">${o.folio} · ${o.cliente}</div>`;
    }).join('');
    html += `<div class="cal-cell ${isToday ? 'today' : ''}"><div class="cal-num">${day}</div>${evHtml}</div>`;
  }

  // next month filler
  const total = firstDow + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="cal-cell other-month"><div class="cal-num">${i}</div></div>`;
  }
  html += '</div>';

  $('cal-body').innerHTML = html;
}

/* ── Clients (CRM) ──────────────────────────────────────────────────────── */
let editClientId = null;

async function renderClients() {
  const list = await api('/clients');
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Clientes</h1><p>${list.length} cliente(s)</p></div>
      <button class="btn btn-primary" onclick="openClientModal()">+ Nuevo cliente</button>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <input type="text" id="cl-search" placeholder="Buscar por nombre o empresa..." oninput="filterClients()" style="max-width:280px">
    </div>
    <div class="grid-3" id="clients-grid">
      ${clientCards(list)}
    </div>
  `;
  window._allClients = list;
}

function clientCards(list) {
  if (!list.length) return '<div class="empty" style="grid-column:1/-1"><div class="icon">👤</div>Sin clientes registrados</div>';
  return list.map(c => `
    <div class="client-card" onclick="viewClient('${c.id}')">
      <div class="c-name">${c.nombre}</div>
      ${c.empresa ? `<div class="c-empresa">${c.empresa}</div>` : ''}
      <div class="c-meta">
        ${c.telefono ? `📞 ${c.telefono}` : ''} ${c.email ? `· ✉️ ${c.email}` : ''}
      </div>
    </div>`).join('');
}

function filterClients() {
  const q = $('cl-search').value.toLowerCase();
  const filtered = (window._allClients || []).filter(c =>
    c.nombre.toLowerCase().includes(q) || (c.empresa || '').toLowerCase().includes(q)
  );
  $('clients-grid').innerHTML = clientCards(filtered);
}

async function viewClient(id) {
  const [c, pedidos] = await Promise.all([
    api('/clients').then(list => list.find(x => x.id === id)),
    api(`/clients/${id}/orders`),
  ]);
  if (!c) return;
  $('view').innerHTML = `
    <div class="page-top">
      <div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('clients')" style="margin-bottom:12px">← Clientes</button>
        <h1>${c.nombre}</h1>
        ${c.empresa ? `<p class="muted">${c.empresa}</p>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openClientModal('${c.id}')">Editar</button>
    </div>
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card">
        <h3 style="margin-bottom:12px">Información de contacto</h3>
        ${c.telefono ? `<div class="cost-row"><span class="muted">Teléfono</span><span>${c.telefono}</span></div>` : ''}
        ${c.email ? `<div class="cost-row"><span class="muted">Email</span><span>${c.email}</span></div>` : ''}
        ${c.notas ? `<div style="margin-top:12px"><small class="muted">Notas</small><p style="margin-top:4px">${c.notas}</p></div>` : ''}
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px">Resumen</h3>
        <div class="cost-row"><span class="muted">Total pedidos</span><strong>${pedidos.length}</strong></div>
        <div class="cost-row"><span class="muted">Completados</span><strong>${pedidos.filter(p => ['completado','entregado'].includes(p.status)).length}</strong></div>
        ${currentUser.role === 'admin' ? `<div class="cost-row"><span class="muted">Facturación total</span><strong>$${fmt(pedidos.reduce((s,p) => s + (p.precio_venta||0), 0))}</strong></div>` : ''}
      </div>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px">Historial de pedidos</h3>
      ${ordersTable(pedidos)}
    </div>
  `;
}

function openClientModal(id = null) {
  editClientId = id;
  $('modal-client-title').textContent = id ? 'Editar cliente' : 'Nuevo cliente';
  if (id) {
    const c = (window._allClients || []).find(x => x.id === id);
    if (c) {
      $('cl-nombre').value = c.nombre || '';
      $('cl-empresa').value = c.empresa || '';
      $('cl-tel').value = c.telefono || '';
      $('cl-email').value = c.email || '';
      $('cl-notas').value = c.notas || '';
    }
  } else {
    ['cl-nombre','cl-empresa','cl-tel','cl-email','cl-notas'].forEach(id => $(id) && ($(id).value = ''));
  }
  openModal('modal-client');
}

$('modal-client-save').onclick = async () => {
  const body = {
    nombre: $('cl-nombre').value.trim(),
    empresa: $('cl-empresa').value.trim() || null,
    telefono: $('cl-tel').value.trim() || null,
    email: $('cl-email').value.trim() || null,
    notas: $('cl-notas').value.trim() || null,
  };
  if (!body.nombre) return toast('El nombre es requerido', 'error');
  try {
    if (editClientId) await api(`/clients/${editClientId}`, 'PUT', body);
    else await api('/clients', 'POST', body);
    closeModal('modal-client');
    navigate('clients');
    toast(editClientId ? 'Cliente actualizado' : 'Cliente creado');
  } catch (e) { toast(e.message, 'error'); }
};

/* ── Inventario ─────────────────────────────────────────────────────────── */
let editInvId = null;

async function renderInventario() {
  const list = await api('/inventory');
  const bajoMin = list.filter(i => i.activo && i.stock_actual < i.stock_minimo);

  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title">
        <h1>Inventario</h1>
        <p>${list.length} material(es)${bajoMin.length ? ` · <span style="color:var(--red)">⚠️ ${bajoMin.length} bajo mínimo</span>` : ''}</p>
      </div>
      <button class="btn btn-primary" onclick="openInvModal()">+ Agregar material</button>
    </div>
    ${bajoMin.length ? `
    <div class="card" style="border-color:var(--red);margin-bottom:16px">
      <h3 style="color:var(--red);margin-bottom:10px">⚠️ Materiales por reponer</h3>
      <div class="inline-list">
        ${bajoMin.map(i => `<div class="pill" style="border-color:var(--red)">${i.nombre} — Stock: ${i.stock_actual} ${i.unidad} (mín. ${i.stock_minimo})</div>`).join('')}
      </div>
    </div>` : ''}
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Material</th><th>Área</th><th>Stock</th><th>Mínimo</th><th>Unidad</th><th>Costo unit.</th><th>Valor stock</th><th></th></tr></thead>
        <tbody>
          ${list.map(i => {
            const pct = i.stock_minimo > 0 ? Math.min((i.stock_actual / i.stock_minimo) * 100, 100) : 100;
            const low = i.stock_actual < i.stock_minimo;
            return `<tr>
              <td><strong>${i.nombre}</strong>${low ? '<span class="low-badge">BAJO</span>' : ''}</td>
              <td>${i.area ? (AREAS[i.area] || i.area) : 'General'}</td>
              <td>
                <div class="stock-bar-wrap"><div class="stock-bar ${low ? 'low' : 'ok'}" style="width:${pct}%"></div></div>
                <strong style="margin-left:6px">${i.stock_actual}</strong>
              </td>
              <td>${i.stock_minimo}</td>
              <td>${i.unidad}</td>
              <td>$${fmt(i.costo_unitario)}</td>
              <td>$${fmt(i.stock_actual * i.costo_unitario)}</td>
              <td class="td-actions">
                <button class="btn btn-ghost btn-sm" onclick="ajustarStock('${i.id}','${i.nombre}',${i.stock_actual},'${i.unidad}')">Ajustar</button>
                <button class="btn btn-ghost btn-sm" onclick="openInvModal('${i.id}')">Editar</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

function ajustarStock(id, nombre, actual, unidad) {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal">
      <h2>Ajustar stock: ${nombre}</h2>
      <p class="muted" style="margin-bottom:16px">Stock actual: <strong>${actual} ${unidad}</strong></p>
      <div class="form-row">
        <div class="form-group">
          <label>Operación</label>
          <select id="adj-op">
            <option value="set">Establecer cantidad exacta</option>
            <option value="add">Agregar al stock</option>
            <option value="sub">Descontar del stock</option>
          </select>
        </div>
        <div class="form-group">
          <label>Cantidad</label>
          <input type="number" id="adj-qty" value="0" min="0" step="0.01">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveStockAdj('${id}',${actual},this)">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function saveStockAdj(id, actual, btn) {
  const op  = $('adj-op').value;
  const qty = parseFloat($('adj-qty').value) || 0;
  let newStock = actual;
  if (op === 'set') newStock = qty;
  else if (op === 'add') newStock = actual + qty;
  else newStock = Math.max(0, actual - qty);
  try {
    await api(`/inventory/${id}`, 'PUT', { stock_actual: newStock });
    btn.closest('.modal-overlay').remove();
    renderInventario();
    toast('Stock actualizado');
  } catch (e) { toast(e.message, 'error'); }
}

function openInvModal(id = null) {
  editInvId = id;
  $('modal-inv-title').textContent = id ? 'Editar material' : 'Nuevo material';
  if (id) {
    api('/inventory').then(list => {
      const i = list.find(x => x.id === id);
      if (i) {
        $('inv-nombre').value = i.nombre;
        $('inv-area').value = i.area || '';
        $('inv-unidad').value = i.unidad;
        $('inv-costo').value = i.costo_unitario;
        $('inv-stock').value = i.stock_actual;
        $('inv-min').value = i.stock_minimo;
      }
    });
  } else {
    ['inv-nombre'].forEach(id => $(id) && ($(id).value = ''));
    $('inv-area').value = '';
    $('inv-unidad').value = 'pza';
    $('inv-costo').value = 0;
    $('inv-stock').value = 0;
    $('inv-min').value = 0;
  }
  openModal('modal-inv');
}

$('modal-inv-save').onclick = async () => {
  const body = {
    nombre: $('inv-nombre').value.trim(),
    area: $('inv-area').value || null,
    unidad: $('inv-unidad').value || 'pza',
    costo_unitario: parseFloat($('inv-costo').value) || 0,
    stock_actual: parseFloat($('inv-stock').value) || 0,
    stock_minimo: parseFloat($('inv-min').value) || 0,
  };
  if (!body.nombre) return toast('El nombre es requerido', 'error');
  try {
    if (editInvId) await api(`/inventory/${editInvId}`, 'PUT', body);
    else await api('/inventory', 'POST', body);
    closeModal('modal-inv');
    renderInventario();
    toast(editInvId ? 'Material actualizado' : 'Material creado');
  } catch (e) { toast(e.message, 'error'); }
};

/* ── Kanban ─────────────────────────────────────────────────────────────── */
async function renderKanban() {
  const areaFilter = currentUser.role === 'produccion' ? `&area=${currentUser.area}` : '';
  const [nuevos, enProd, completados, entregados] = await Promise.all([
    api(`/orders?status=nuevo${areaFilter}`),
    api(`/orders?status=en_produccion${areaFilter}`),
    api(`/orders?status=completado${areaFilter}`),
    api(`/orders?status=entregado${areaFilter}`),
  ]);

  const isAdmin = currentUser.role === 'admin';
  const isProd  = currentUser.role === 'produccion';

  function kanbanCard(o) {
    const al = deliveryAlert(o.fecha_entrega, o.status);
    const actions = [];
    if ((isAdmin || isProd) && o.status === 'nuevo')
      actions.push(`<button class="btn btn-warning btn-sm" onclick="event.stopPropagation();kbMove('${o.id}','en_produccion')">▶ Iniciar</button>`);
    if ((isAdmin || isProd) && o.status === 'en_produccion')
      actions.push(`<button class="btn btn-success btn-sm" onclick="event.stopPropagation();openCompleteModal('${o.id}')">✔ Completar</button>`);
    if ((isAdmin || currentUser.role === 'ventas') && o.status === 'completado')
      actions.push(`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();kbMove('${o.id}','entregado')">📦 Entregar</button>`);
    return `
      <div class="kanban-card ${al.cls === 'overdue' ? 'overdue' : al.cls === 'today-due' ? 'today-due' : ''}" onclick="viewOrder('${o.id}')">
        <div class="k-folio">${o.folio}</div>
        <div class="k-cliente">${o.cliente}</div>
        <small class="muted">${o.servicio_nombre || '—'}</small>
        <div class="k-meta">
          <span>${o.cantidad} pzas</span>
          <span>${fmtDate(o.fecha_entrega)}${al.tag}</span>
        </div>
        ${o.notas_produccion ? `<div style="margin-top:6px;font-size:.76rem;color:var(--accent)">📌 ${o.notas_produccion}</div>` : ''}
        ${actions.length ? `<div class="k-actions">${actions.join('')}</div>` : ''}
      </div>`;
  }

  const cols = [
    { status: 'nuevo',        label: 'Nuevo',          color: 'var(--blue)',   orders: nuevos },
    { status: 'en_produccion',label: 'En producción',   color: 'var(--accent)', orders: enProd },
    { status: 'completado',   label: 'Completado',      color: 'var(--green)',  orders: completados },
    { status: 'entregado',    label: 'Entregado',       color: 'var(--primary)',orders: entregados },
  ];

  // Area filter for admin/ventas
  const areas = ['', ...Object.keys(AREAS)];
  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Kanban</h1><p>Flujo de pedidos</p></div>
      ${isAdmin || currentUser.role === 'ventas' ? `
      <div class="page-actions">
        <select id="kb-area" onchange="navigate('kanban')">
          ${areas.map(a => `<option value="${a}" ${a === (currentUser._kbArea||'') ? 'selected' : ''}>${a ? AREAS[a] : 'Todas las áreas'}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <div class="kanban-wrap">
      ${cols.map(col => `
        <div class="kanban-col">
          <div class="kanban-col-header" style="border-top:3px solid ${col.color}">
            <span>${col.label}</span>
            <span class="count">${col.orders.length}</span>
          </div>
          <div class="kanban-cards">
            ${col.orders.length ? col.orders.map(kanbanCard).join('') : '<div class="muted" style="font-size:.82rem;padding:8px 0;text-align:center">Sin pedidos</div>'}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function kbMove(id, status) {
  try {
    await api(`/orders/${id}/status`, 'PATCH', { status });
    toast('Estatus actualizado');
    navigate('kanban');
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Cotizador rápido ───────────────────────────────────────────────────── */
async function renderCotizador() {
  const svcs = await api('/services');
  const fcs = currentUser.role === 'admin' ? await api('/fixed-costs') : [];
  const totalFijo = fcs.filter(f => f.activo).reduce((s, f) => s + f.monto_mensual, 0);
  const costoFijoPorHora = totalFijo / 176;

  $('view').innerHTML = `
    <div class="page-title"><h1>Cotizador rápido</h1><p>Calcula el precio sugerido según tus costos y margen deseado</p></div>
    <div class="grid-2">
      <div class="card">
        <h3 style="margin-bottom:16px">Parámetros</h3>
        <div class="form-group">
          <label>Servicio base</label>
          <select id="q-svc" onchange="calcQuote()">
            <option value="">— Sin servicio —</option>
            ${svcs.filter(s => s.activo).map(s => `<option value="${s.id}" data-mat="${s.costo_material_base}" data-hrs="${s.tiempo_estimado_hrs}" data-hr="${s.costo_hora}">${s.nombre} (${AREAS[s.area]})</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Cantidad (pzas)</label>
            <input type="number" id="q-cant" value="1" min="1" oninput="calcQuote()">
          </div>
          <div class="form-group">
            <label>% Ganancia deseada</label>
            <input type="number" id="q-margen" value="40" min="1" max="99" oninput="calcQuote()">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Costo material extra ($)</label>
            <input type="number" id="q-mat-extra" value="0" min="0" step="0.01" oninput="calcQuote()">
          </div>
          <div class="form-group">
            <label>Horas estimadas</label>
            <input type="number" id="q-hrs" value="1" min="0.1" step="0.25" oninput="calcQuote()">
          </div>
        </div>
        ${currentUser.role === 'admin' ? `
        <div class="form-group">
          <label>Costo por hora ($)</label>
          <input type="number" id="q-hr" value="150" min="0" step="0.01" oninput="calcQuote()">
        </div>` : '<input type="hidden" id="q-hr" value="0">'}
        <div id="q-result"></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:12px">Referencia de servicios</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Servicio</th><th>Área</th><th>Costo est.</th></tr></thead>
          <tbody>
            ${svcs.filter(s => s.activo).map(s => `<tr>
              <td>${s.nombre}</td>
              <td><small class="muted">${AREAS[s.area]}</small></td>
              ${currentUser.role === 'admin' ? `<td>$${fmt(s.costo_material_base + s.tiempo_estimado_hrs * s.costo_hora)}</td>` : '<td>—</td>'}
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    </div>
  `;
  // Store fixed cost rate globally for calcQuote
  window._costoFijoPorHora = costoFijoPorHora;
  calcQuote();
}

function calcQuote() {
  const svcOpt = $('q-svc')?.selectedOptions[0];
  const cant    = parseFloat($('q-cant')?.value) || 1;
  const margen  = parseFloat($('q-margen')?.value) || 40;
  const matExtra= parseFloat($('q-mat-extra')?.value) || 0;
  const hrs     = parseFloat($('q-hrs')?.value) || 1;
  const hrRate  = parseFloat($('q-hr')?.value) || 0;
  const fixedPH = window._costoFijoPorHora || 0;

  const matBase   = svcOpt ? parseFloat(svcOpt.dataset.mat || 0) : 0;
  const costoMat  = matBase + matExtra;
  const costoMO   = hrs * hrRate;
  const costoFijo = hrs * fixedPH;
  const costoUnit = costoMat + costoMO + costoFijo;
  const costoTotal= costoUnit * cant;

  // precio = costo / (1 - margen/100)
  const m = Math.min(margen, 99) / 100;
  const precioUnit  = m < 1 ? costoUnit / (1 - m) : costoUnit * 3;
  const precioTotal = precioUnit * cant;
  const gananciaUnit = precioUnit - costoUnit;
  const gananciaTotal = gananciaUnit * cant;

  const res = $('q-result');
  if (!res) return;
  const isAdmin = currentUser.role === 'admin';
  res.innerHTML = `
    <div class="quote-result">
      <div class="muted" style="font-size:.82rem;text-transform:uppercase;letter-spacing:.06em">Precio sugerido por pieza</div>
      <div class="price-big">$${fmt(precioUnit)}</div>
      <div class="price-sub">Total (${cant} pzas): <strong>$${fmt(precioTotal)}</strong></div>
      ${isAdmin ? `
      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="eff-metric"><div class="lbl">Costo / pieza</div><div class="val">$${fmt(costoUnit)}</div></div>
        <div class="eff-metric"><div class="lbl">Costo total</div><div class="val">$${fmt(costoTotal)}</div></div>
        <div class="eff-metric"><div class="lbl">Ganancia / pieza</div><div class="val" style="color:var(--green)">$${fmt(gananciaUnit)}</div></div>
        <div class="eff-metric"><div class="lbl">Ganancia total</div><div class="val" style="color:var(--green)">$${fmt(gananciaTotal)}</div></div>
      </div>` : ''}
      <button class="btn btn-primary w-full" style="margin-top:14px" onclick="usarCotizacion(${precioUnit.toFixed(2)})">Crear pedido con este precio</button>
    </div>
  `;
}

function usarCotizacion(precio) {
  // Pre-fill order modal with the calculated price per piece
  window._cotizadorPrecio = precio;
  openOrderModal();
  // After modal opens, set the price
  setTimeout(() => { if ($('o-precio')) $('o-precio').value = precio; }, 100);
}

/* ── Eficiencia ─────────────────────────────────────────────────────────── */
async function renderEficiencia() {
  const today    = new Date().toISOString().slice(0, 10);
  const firstDay = today.slice(0, 8) + '01';
  $('view').innerHTML = `
    <div class="page-title"><h1>Eficiencia y capacidad</h1><p>¿Estás al límite? ¿Cuándo conviene contratar?</p></div>
    <div class="filters" style="margin-bottom:20px">
      <input type="date" id="ef-desde" value="${firstDay}">
      <input type="date" id="ef-hasta" value="${today}">
      <div class="form-group" style="margin:0">
        <select id="ef-hd">
          <option value="6">6 hrs/día</option>
          <option value="8" selected>8 hrs/día</option>
          <option value="10">10 hrs/día</option>
          <option value="12">12 hrs/día</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="loadEficiencia()">Calcular</button>
    </div>
    <div id="ef-content"><div class="empty"><div class="icon">⚡</div>Selecciona el período y haz clic en Calcular</div></div>
  `;
  await loadEficiencia();
}

async function loadEficiencia() {
  const desde = $('ef-desde').value;
  const hasta = $('ef-hasta').value;
  const hd    = $('ef-hd').value;
  try {
    const data = await api(`/reports/efficiency?desde=${desde}&hasta=${hasta}&horas_dia=${hd}`);

    const REC = {
      contratar:      { label: '⚠️ Considera contratar', cls: 'contratar' },
      vigilar:        { label: '👀 Monitorear carga',    cls: 'vigilar' },
      ok:             { label: '✅ Capacidad normal',    cls: 'ok' },
      capacidad_libre:{ label: '💡 Capacidad libre',     cls: 'libre' },
    };

    function utilColor(u) { return u >= 85 ? 'red' : u >= 65 ? 'yellow' : 'green'; }

    const cards = data.areas.map(a => {
      const rec = REC[a.recomendacion] || REC.ok;
      const uc  = utilColor(a.utilizacion);
      const barW = Math.min(a.utilizacion, 100);
      return `
      <div class="eff-card rec-${a.recomendacion}">
        <div class="eff-area-name">${AREAS[a.area] || a.area}</div>
        <div style="display:flex;justify-content:space-between;font-size:.82rem">
          <span class="muted">Utilización</span>
          <strong style="color:var(--${uc === 'red' ? 'red' : uc === 'yellow' ? 'accent' : 'green'})">${a.utilizacion}%</strong>
        </div>
        <div class="util-bar-wrap"><div class="util-bar ${uc}" style="width:${barW}%"></div></div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px">${a.horasTrabajadas.toFixed(1)}h trabajadas / ${a.capacidadHoras}h disponibles (1 persona)</div>
        <div class="eff-metrics">
          <div class="eff-metric"><div class="lbl">Pedidos</div><div class="val">${a.pedidosTotal}</div></div>
          <div class="eff-metric"><div class="lbl">Completados</div><div class="val">${a.pedidosCompletados}</div></div>
          <div class="eff-metric"><div class="lbl">Ingreso / hora</div><div class="val">$${fmt(a.ingresoPorHora)}</div></div>
          <div class="eff-metric"><div class="lbl">T. promedio entrega</div><div class="val">${a.tiempoPromedioEntrega ? a.tiempoPromedioEntrega + 'h' : '—'}</div></div>
        </div>
        <div class="rec-chip ${rec.cls}">${rec.label}</div>
        ${a.recomendacion === 'contratar' ? `
        <div class="hire-box">
          <strong>Si contratas 1 persona más:</strong><br>
          + ${a.capacidadHoras}h capacidad adicional<br>
          Ingreso potencial adicional: <strong>$${fmt(a.ingresoAdicionalPotencial)}</strong><br>
          Costo estimado: <strong>$${fmt(a.costoContratar)}</strong><br>
          ROI neto: <strong style="color:${a.roiContratar >= 0 ? 'var(--green)' : 'var(--red)'}">$${fmt(a.roiContratar)}</strong>
        </div>` : ''}
      </div>`;
    });

    // Global summary
    const totalHrs = data.areas.reduce((s, a) => s + a.horasTrabajadas, 0);
    const totalIng = data.areas.reduce((s, a) => s + a.ingresos, 0);
    const avgUtil  = data.areas.length ? data.areas.reduce((s, a) => s + a.utilizacion, 0) / data.areas.length : 0;
    const needHire = data.areas.filter(a => a.recomendacion === 'contratar').length;

    $('ef-content').innerHTML = `
      <div class="grid-4" style="margin-bottom:20px">
        <div class="stat-card purple"><div class="label">Horas totales trabajadas</div><div class="value">${totalHrs.toFixed(0)}h</div><div class="sub">${data.workDays} días hábiles · ${data.horas_dia}h/día</div></div>
        <div class="stat-card green"><div class="label">Ingresos del período</div><div class="value">$${fmt(totalIng)}</div></div>
        <div class="stat-card ${avgUtil >= 85 ? 'red' : avgUtil >= 65 ? 'yellow' : 'green'}"><div class="label">Utilización promedio</div><div class="value">${avgUtil.toFixed(1)}%</div></div>
        <div class="stat-card ${needHire > 0 ? 'red' : 'green'}"><div class="label">Áreas al límite</div><div class="value">${needHire}</div><div class="sub">${needHire > 0 ? 'Considera contratar' : 'Todo en orden'}</div></div>
      </div>
      ${data.areas.length
        ? `<div class="grid-3">${cards.join('')}</div>`
        : '<div class="empty"><div class="icon">📭</div>No hay datos de mano de obra en este período. Registra horas en los pedidos completados.</div>'
      }
    `;
  } catch (e) {
    $('ef-content').innerHTML = `<div class="empty"><div class="icon">⚠️</div>${e.message}</div>`;
  }
}

/* ── Tendencias (Charts) ────────────────────────────────────────────────── */
let _chartRevenue = null, _chartStatus = null, _chartMerma = null;

function destroyCharts() {
  [_chartRevenue, _chartStatus, _chartMerma].forEach(c => c?.destroy());
  _chartRevenue = _chartStatus = _chartMerma = null;
}

async function renderTendencias() {
  destroyCharts();
  const data = await api('/reports/monthly');
  const months = data.months;
  const byStatus = data.byStatus;

  $('view').innerHTML = `
    <div class="page-title"><h1>Tendencias</h1><p>Últimos 6 meses de actividad</p></div>
    <div class="grid-2" style="margin-bottom:20px">
      <div class="card">
        <h3 style="margin-bottom:14px">Ventas vs Costos (6 meses)</h3>
        <div class="chart-wrap"><canvas id="ch-revenue"></canvas></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:14px">Pedidos por estatus (actual)</h3>
        <div class="chart-wrap"><canvas id="ch-status"></canvas></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <h3 style="margin-bottom:14px">Ganancia mensual</h3>
      <div class="chart-wrap"><canvas id="ch-merma"></canvas></div>
    </div>
    <div class="grid-4" style="margin-bottom:16px">
      ${months.slice(-3).reverse().map(m => `
        <div class="stat-card">
          <div class="label">${m.label}</div>
          <div class="value">$${fmt(m.venta)}</div>
          <div class="sub" style="color:${m.utilidad >= 0 ? 'var(--green)' : 'var(--red)'}">$${fmt(m.utilidad)} utilidad</div>
        </div>`).join('')}
      <div class="stat-card purple">
        <div class="label">Pedidos activos</div>
        <div class="value">${(byStatus.nuevo || 0) + (byStatus.en_produccion || 0)}</div>
        <div class="sub">${byStatus.en_produccion || 0} en producción</div>
      </div>
    </div>
  `;

  const chartDefaults = { responsive: true, maintainAspectRatio: false };
  const gridColor = 'rgba(255,255,255,.07)';

  _chartRevenue = new Chart($('ch-revenue'), {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Ventas', data: months.map(m => m.venta), backgroundColor: 'rgba(124,92,252,.7)', borderRadius: 4 },
        { label: 'Costo', data: months.map(m => m.costo), backgroundColor: 'rgba(255,80,80,.5)', borderRadius: 4 },
      ],
    },
    options: { ...chartDefaults, plugins: { legend: { labels: { color: '#aaa' } } }, scales: { x: { ticks: { color: '#aaa' }, grid: { color: gridColor } }, y: { ticks: { color: '#aaa' }, grid: { color: gridColor } } } },
  });

  const statusLabels = { nuevo: 'Nuevo', en_produccion: 'En producción', completado: 'Completado', entregado: 'Entregado', cancelado: 'Cancelado' };
  const statusColors = ['#7c5cfc','#f5c518','#27d167','#3d9aff','#ff5050'];
  _chartStatus = new Chart($('ch-status'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(byStatus).map(k => statusLabels[k] || k),
      datasets: [{ data: Object.values(byStatus), backgroundColor: statusColors, borderWidth: 0 }],
    },
    options: { ...chartDefaults, plugins: { legend: { position: 'bottom', labels: { color: '#aaa', padding: 12 } } } },
  });

  _chartMerma = new Chart($('ch-merma'), {
    type: 'line',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Utilidad', data: months.map(m => m.utilidad), borderColor: '#27d167', backgroundColor: 'rgba(39,209,103,.1)', fill: true, tension: 0.4 },
        { label: 'Merma (costo)', data: months.map(m => m.merma), borderColor: '#ff5050', backgroundColor: 'rgba(255,80,80,.08)', fill: true, tension: 0.4 },
      ],
    },
    options: { ...chartDefaults, plugins: { legend: { labels: { color: '#aaa' } } }, scales: { x: { ticks: { color: '#aaa' }, grid: { color: gridColor } }, y: { ticks: { color: '#aaa' }, grid: { color: gridColor } } } },
  });
}

/* ── Tiempos estándar vs reales ─────────────────────────────────────────── */
async function renderTiempos() {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = today.slice(0, 8) + '01';
  $('view').innerHTML = `
    <div class="page-title"><h1>Tiempos: estándar vs real</h1><p>¿Cuánto tardamos realmente?</p></div>
    <div class="filters" style="margin-bottom:20px">
      <input type="date" id="t-desde" value="${firstDay}">
      <input type="date" id="t-hasta" value="${today}">
      <button class="btn btn-primary btn-sm" onclick="loadTiempos()">Calcular</button>
    </div>
    <div id="t-content"><div class="empty"><div class="icon">⏱️</div>Selecciona rango y haz clic en Calcular</div></div>
  `;
  await loadTiempos();
}

async function loadTiempos() {
  const desde = $('t-desde').value;
  const hasta = $('t-hasta').value;
  try {
    const data = await api(`/reports/tiempos?desde=${desde}&hasta=${hasta}`);
    if (!data.length) {
      $('t-content').innerHTML = '<div class="empty"><div class="icon">📭</div>Sin pedidos completados con horas registradas en este período</div>';
      return;
    }
    $('t-content').innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="table-wrap"><table>
          <thead><tr><th>Servicio</th><th>Área</th><th>Pedidos</th><th class="text-right">T.Estándar/pedido</th><th class="text-right">T.Real prom.</th><th class="text-right">Variación</th><th class="text-right">%</th></tr></thead>
          <tbody>
            ${data.map(s => {
              const cls = s.avgVarPct > 20 ? 'over' : s.avgVarPct < -10 ? 'under' : 'ok';
              const sign = s.avgVar > 0 ? '+' : '';
              return `<tr>
                <td><strong>${s.nombre}</strong></td>
                <td><small class="muted">${AREAS[s.area] || s.area}</small></td>
                <td>${s.n}</td>
                <td class="text-right">${s.avgEsp}h</td>
                <td class="text-right">${s.avgReal}h</td>
                <td class="text-right">${sign}${s.avgVar}h</td>
                <td class="text-right"><span class="variacion-badge ${cls}">${sign}${s.avgVarPct}%</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
      ${data.filter(s => s.avgVarPct > 20).length ? `
      <div class="card" style="border-color:var(--red)">
        <h3 style="color:var(--red);margin-bottom:10px">⚠️ Servicios que superan el estándar &gt;20%</h3>
        <p class="muted" style="font-size:.88rem">Considera actualizar los tiempos estándar en la configuración de servicios o revisar el proceso.</p>
        ${data.filter(s => s.avgVarPct > 20).map(s => `
          <div class="cost-row"><span><strong>${s.nombre}</strong></span><span style="color:var(--red)">+${s.avgVarPct}% sobre el estándar (${s.avgReal}h real vs ${s.avgEsp}h esperado)</span></div>
        `).join('')}
      </div>` : ''}
    `;
  } catch (e) { $('t-content').innerHTML = `<div class="empty"><div class="icon">⚠️</div>${e.message}</div>`; }
}

/* ── Análisis de merma ──────────────────────────────────────────────────── */
async function renderMermaAnalysis() {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = today.slice(0, 8) + '01';
  $('view').innerHTML = `
    <div class="page-title"><h1>Análisis de merma</h1><p>¿Dónde perdemos más piezas?</p></div>
    <div class="filters" style="margin-bottom:20px">
      <input type="date" id="m-desde" value="${firstDay}">
      <input type="date" id="m-hasta" value="${today}">
      <button class="btn btn-primary btn-sm" onclick="loadMermaAnalysis()">Analizar</button>
    </div>
    <div id="m-content"><div class="empty"><div class="icon">📉</div>Selecciona rango y haz clic en Analizar</div></div>
  `;
  await loadMermaAnalysis();
}

async function loadMermaAnalysis() {
  const desde = $('m-desde').value;
  const hasta = $('m-hasta').value;
  try {
    const data = await api(`/reports/merma?desde=${desde}&hasta=${hasta}`);
    if (!data.length) {
      $('m-content').innerHTML = '<div class="empty"><div class="icon">✅</div>Sin merma registrada en este período</div>';
      return;
    }
    const totalMerma = data.reduce((s, a) => s + a.totalMerma, 0);
    const totalCosto = data.reduce((s, a) => s + a.costoMerma, 0);

    $('m-content').innerHTML = `
      <div class="grid-3" style="margin-bottom:16px">
        <div class="stat-card red"><div class="label">Total piezas merma</div><div class="value">${totalMerma}</div></div>
        <div class="stat-card red"><div class="label">Costo total merma</div><div class="value">$${fmt(totalCosto)}</div></div>
        <div class="stat-card"><div class="label">Áreas afectadas</div><div class="value">${data.length}</div></div>
      </div>
      ${data.map(a => {
        const barCls = a.pctMerma >= 10 ? 'high' : a.pctMerma >= 5 ? 'mid' : 'low';
        const barW = Math.min(a.pctMerma * 5, 100);
        return `<div class="card" style="margin-bottom:16px${a.pctMerma >= 10 ? ';border-left:3px solid var(--red)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h3>${AREAS[a.area] || a.area}</h3>
            <span style="font-size:1.4rem;font-weight:800;color:${a.pctMerma >= 10 ? 'var(--red)' : a.pctMerma >= 5 ? 'var(--accent)' : 'var(--green)'}">${a.pctMerma}%</span>
          </div>
          <div class="merma-bar-wrap"><div class="merma-bar ${barCls}" style="width:${barW}%"></div></div>
          <div style="display:flex;gap:20px;margin:10px 0;font-size:.85rem">
            <span class="muted">${a.totalMerma} pzas merma</span>
            <span class="muted">$${fmt(a.costoMerma)} costo</span>
            <span class="muted">${a.pedidos.length} pedido(s)</span>
          </div>
          <details style="margin-top:8px">
            <summary class="muted" style="cursor:pointer;font-size:.82rem">Ver detalle de pedidos</summary>
            <div class="table-wrap" style="margin-top:8px"><table>
              <thead><tr><th>Folio</th><th>Cliente</th><th>Servicio</th><th>Pzas prod.</th><th>Pzas merma</th><th>Costo merma</th><th>% merma</th></tr></thead>
              <tbody>
                ${a.pedidos.sort((x,y) => y.pct - x.pct).map(p => `<tr>
                  <td class="td-folio">${p.folio}</td>
                  <td>${p.cliente}</td>
                  <td><small class="muted">${p.servicio || '—'}</small></td>
                  <td>${p.cantidad}</td>
                  <td style="color:var(--red)">${p.pzas_merma}</td>
                  <td>$${fmt(p.costo_merma)}</td>
                  <td><span class="variacion-badge ${p.pct >= 10 ? 'over' : p.pct >= 5 ? 'ok' : 'under'}">${p.pct}%</span></td>
                </tr>`).join('')}
              </tbody>
            </table></div>
          </details>
        </div>`;
      }).join('')}
    `;
  } catch (e) { $('m-content').innerHTML = `<div class="empty"><div class="icon">⚠️</div>${e.message}</div>`; }
}

/* ── Control de pagos ───────────────────────────────────────────────────── */
let pagoOrderId = null;

function openPaymentModal(orderId, precioVenta, anticoActual, pagadoActual) {
  pagoOrderId = orderId;
  $('p-anticipo').value = anticoActual || 0;
  $('p-metodo').value = '';
  $('p-fecha').value = new Date().toISOString().slice(0, 10);
  $('p-pagado').value = pagadoActual ? '1' : '0';
  $('p-notas').value = '';
  openModal('modal-pago');
}

$('modal-pago-save').onclick = async () => {
  try {
    await api(`/orders/${pagoOrderId}/pago`, 'PATCH', {
      anticipo: parseFloat($('p-anticipo').value) || 0,
      metodo_pago: $('p-metodo').value || null,
      fecha_pago: $('p-fecha').value || null,
      pagado: $('p-pagado').value === '1',
      notas_pago: $('p-notas').value.trim() || null,
    });
    closeModal('modal-pago');
    viewOrder(pagoOrderId);
    toast('Pago actualizado');
  } catch (e) { toast(e.message, 'error'); }
};

function pagoStatusBadge(o) {
  if (o.pagado) return '<span class="pago-badge pagado">✓ Liquidado</span>';
  if (o.anticipo > 0) return `<span class="pago-badge anticipo">Anticipo $${fmt(o.anticipo)}</span>`;
  return '<span class="pago-badge pendiente">Sin pago</span>';
}

/* ── Cuentas por cobrar ─────────────────────────────────────────────────── */
async function renderCobrar() {
  const list = await api('/reports/cobrar');
  const total = list.reduce((s, o) => s + o.saldo, 0);
  const anticipo = list.reduce((s, o) => s + o.anticipo, 0);

  $('view').innerHTML = `
    <div class="page-title"><h1>Cuentas por cobrar</h1><p>Pedidos con saldo pendiente</p></div>
    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card red"><div class="label">Saldo total pendiente</div><div class="value">$${fmt(total)}</div></div>
      <div class="stat-card yellow"><div class="label">Anticipos recibidos</div><div class="value">$${fmt(anticipo)}</div></div>
      <div class="stat-card purple"><div class="label">Pedidos pendientes</div><div class="value">${list.length}</div></div>
    </div>
    <div class="card">
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Folio</th><th>Cliente</th><th>Total</th><th>Anticipo</th><th>Saldo</th><th>Estatus</th><th>Entrega</th><th></th></tr></thead>
        <tbody>
          ${list.map(o => {
            const al = deliveryAlert(o.fecha_entrega, o.status);
            return `<tr class="row-${al.cls}">
              <td class="td-folio">${o.folio}</td>
              <td><strong>${o.cliente}</strong></td>
              <td>$${fmt(o.precio_venta)}</td>
              <td>${o.anticipo > 0 ? '$' + fmt(o.anticipo) : '—'}</td>
              <td class="saldo-amount">$${fmt(o.saldo)}</td>
              <td>${badge(o.status)}</td>
              <td>${fmtDate(o.fecha_entrega)}${al.tag}</td>
              <td><button class="btn btn-primary btn-sm" onclick="viewOrder('${o.id}')">Ver →</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>` : '<div class="empty"><div class="icon">✅</div>No hay cuentas por cobrar pendientes</div>'}
    </div>
  `;
}

/* ── Config: Checklist de calidad ───────────────────────────────────────── */
async function renderConfigChecklist() {
  const items = await api('/checklist/config');
  const byArea = {};
  for (const it of items) {
    if (!byArea[it.area]) byArea[it.area] = [];
    byArea[it.area].push(it);
  }

  $('view').innerHTML = `
    <div class="page-top">
      <div class="page-title"><h1>Checklist de calidad</h1><p>Puntos de control por área para marcar pedidos completados</p></div>
      <button class="btn btn-primary" onclick="addChecklistItem()">+ Agregar punto</button>
    </div>
    ${Object.entries(AREAS).map(([area, label]) => {
      const areaItems = byArea[area] || [];
      return `<div class="card" style="margin-bottom:16px">
        <div class="card-header"><h3>${label}</h3><span class="muted" style="font-size:.82rem">${areaItems.length} punto(s)</span></div>
        ${areaItems.length ? areaItems.map(it => `
          <div class="checklist-item">
            <input type="checkbox" checked disabled>
            <label style="flex:1">${it.item}</label>
            <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:.75rem" onclick="deleteChecklistItem('${it.id}')">✕</button>
          </div>`).join('') : '<p class="muted" style="font-size:.85rem">Sin puntos configurados</p>'}
      </div>`;
    }).join('')}
  `;
}

function addChecklistItem() {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal">
      <h2>Nuevo punto de calidad</h2>
      <div class="form-row">
        <div class="form-group">
          <label>Área</label>
          <select id="cl-area-new">
            ${Object.entries(AREAS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Punto de control *</label>
        <input type="text" id="cl-item-new" placeholder="ej. Sin rebabas ni bordes cortantes">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveChecklistItem(this)">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function saveChecklistItem(btn) {
  const area = $('cl-area-new').value;
  const item = $('cl-item-new').value.trim();
  if (!item) return toast('El punto es requerido', 'error');
  try {
    await api('/checklist/config', 'POST', { area, item });
    btn.closest('.modal-overlay').remove();
    renderConfigChecklist();
    toast('Punto agregado');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteChecklistItem(id) {
  if (!confirm('¿Eliminar este punto de calidad?')) return;
  try {
    await api(`/checklist/config/${id}`, 'DELETE');
    renderConfigChecklist();
    toast('Eliminado');
  } catch (e) { toast(e.message, 'error'); }
}

/* ── Checklist de calidad en complete modal ─────────────────────────────── */
async function openCompleteModalWithChecklist(id, area) {
  completeOrderId = id;
  $('c-horas').value = 0;
  $('c-costo-hora').value = 150;
  $('c-merma-pzas').value = 0;
  $('c-merma-costo').value = 0;
  $('c-notas').value = '';

  // Load checklist for this area
  try {
    const items = await api(`/checklist/config?area=${area}`);
    const wrap = $('c-checklist-wrap');
    const list = $('c-checklist-items');
    if (items.length) {
      list.innerHTML = items.map((it, i) => `
        <div class="checklist-item" id="cl-row-${i}">
          <input type="checkbox" id="cl-${i}" onchange="this.closest('.checklist-item').classList.toggle('checked',this.checked)">
          <label for="cl-${i}">${it.item}</label>
        </div>`).join('');
      wrap.style.display = '';
      wrap.dataset.items = JSON.stringify(items.map(it => it.item));
    } else {
      wrap.style.display = 'none';
    }
  } catch { $('c-checklist-wrap').style.display = 'none'; }

  openModal('modal-complete');
}

/* ── Init ───────────────────────────────────────────────────────────────── */
if (token) {
  bootApp();
} else {
  $('login-screen').style.display = '';
}
