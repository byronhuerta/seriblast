const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Datastore = require('@seald-io/nedb');
const multer = require('multer');
const { mkdirSync } = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'seriblast-secret-2024';
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Collections ─────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, 'uploads');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve uploaded renders
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer config – images only, max 8 MB
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype));
  },
});

function col(name) {
  return new Datastore({ filename: path.join(DATA_DIR, `${name}.db`), autoload: true });
}

const users           = col('users');
const services        = col('services');
const fxCosts         = col('fixed_costs');
const orders          = col('orders');
const mats            = col('order_materials');
const labor           = col('order_labor');
const logs            = col('production_logs');
const clients         = col('clients');
const inventory       = col('inventory');
const checklistConfig = col('checklist_config');

// Ensure unique indexes
users.ensureIndex({ fieldName: 'username', unique: true });
orders.ensureIndex({ fieldName: 'folio', unique: true });

// ── Helper: normalize _id → id ───────────────────────────────────────────────

function norm(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}
function normAll(docs) { return docs.map(norm); }

// ── Seed initial data ────────────────────────────────────────────────────────

users.countAsync({}).then(async count => {
  if (count > 0) return;

  const hash = bcrypt.hashSync('admin123', 10);
  await users.insertAsync({ username: 'admin', nombre: 'Administrador', password_hash: hash, role: 'admin', area: null, activo: true, created_at: now() });

  const svc = (nombre, area, mat, hrs, hr) => services.insertAsync({ nombre, area, costo_material_base: mat, tiempo_estimado_hrs: hrs, costo_hora: hr, activo: true });
  await svc('Sandblast en Tarro', 'sandblast', 25, 0.5, 150);
  await svc('Grabado Láser Madera', 'laser', 15, 0.3, 200);
  await svc('Grabado Láser Metal', 'laser', 20, 0.4, 200);
  await svc('DTF Textil por Pieza', 'dtf_textil', 30, 0.2, 180);
  await svc('DTF UV por Pieza', 'dtf_uv', 35, 0.25, 180);
  await svc('Vitrificado en Taza', 'vitrificado', 20, 0.3, 160);
  await svc('Bordado en Gorra', 'bordado', 40, 1, 150);

  const fc = (nombre, monto) => fxCosts.insertAsync({ nombre, monto_mensual: monto, activo: true });
  await fc('Renta taller', 5000);
  await fc('Electricidad', 1500);
  await fc('Gas/compresor', 800);
  await fc('Mantenimiento maquinaria', 1000);
  await fc('Renovación de maquinaria', 2000);
});

checklistConfig.countAsync({}).then(async count => {
  if (count > 0) return;
  const items = [
    { area: 'sandblast', item: 'Grabado uniforme y completo' },
    { area: 'sandblast', item: 'Sin rebabas ni bordes cortantes' },
    { area: 'sandblast', item: 'Piezas limpias y sin polvo' },
    { area: 'laser', item: 'Corte/grabado centrado según diseño' },
    { area: 'laser', item: 'Profundidad de grabado correcta' },
    { area: 'laser', item: 'Sin quemado excesivo alrededor' },
    { area: 'dtf_textil', item: 'Colores fieles al diseño' },
    { area: 'dtf_textil', item: 'Transfer bien adherido sin burbujas' },
    { area: 'dtf_uv', item: 'Colores correctos' },
    { area: 'dtf_uv', item: 'Adherencia completa al sustrato' },
    { area: 'vitrificado', item: 'Color vitrificado homogéneo' },
    { area: 'vitrificado', item: 'Sin grietas ni burbujas' },
    { area: 'bordado', item: 'Sin hilos sueltos ni cortes' },
    { area: 'bordado', item: 'Densidad y tensión correctas' },
    { area: 'bordado', item: 'Colores de hilo correctos' },
    { area: 'serigrafia', item: 'Colores de tinta correctos según diseño' },
    { area: 'serigrafia', item: 'Registro de colores alineado sin desfase' },
    { area: 'serigrafia', item: 'Tinta bien adherida sin manchas' },
    { area: 'serigrafia', item: 'Piezas limpias sin residuos de emulsión' },
    { area: 'diseno', item: 'Archivo entregado en formatos solicitados' },
    { area: 'diseno', item: 'Revisión de cliente aprobada' },
  ];
  for (const it of items) await checklistConfig.insertAsync({ ...it, activo: true });
});

function now() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

// ── Auth middleware ──────────────────────────────────────────────────────────

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sin permiso' });
    next();
  };
}

// ── Auth routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });
    const user = await users.findOneAsync({ username, activo: true });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const payload = { id: user._id, username: user.username, nombre: user.nombre, role: user.role, area: user.area };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: payload });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await users.findOneAsync({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'No encontrado' });
    const { _id, password_hash, ...safe } = user;
    res.json({ id: _id, ...safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.get('/api/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const list = await users.findAsync({}).sort({ nombre: 1 });
    res.json(list.map(u => { const { password_hash, _id, ...r } = u; return { id: _id, ...r }; }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, requireRole('admin'), async (req, res) => {
  try {
    const { username, nombre, password, role, area } = req.body;
    if (!username || !nombre || !password || !role) return res.status(400).json({ error: 'Faltan campos' });
    const hash = bcrypt.hashSync(password, 10);
    const doc = await users.insertAsync({ username, nombre, password_hash: hash, role, area: area || null, activo: true, created_at: now() });
    res.json({ id: doc._id });
  } catch (e) {
    if (e.message?.includes('unique')) return res.status(409).json({ error: 'Ese usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const user = await users.findOneAsync({ _id: req.params.id });
    if (!user) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, password, role, area, activo } = req.body;
    const $set = {
      nombre: nombre ?? user.nombre,
      role: role ?? user.role,
      area: area ?? user.area,
      activo: activo !== undefined ? !!activo : user.activo,
    };
    if (password) $set.password_hash = bcrypt.hashSync(password, 10);
    await users.updateAsync({ _id: req.params.id }, { $set });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Services ─────────────────────────────────────────────────────────────────

app.get('/api/services', auth, async (req, res) => {
  try {
    const list = await services.findAsync({}).sort({ area: 1, nombre: 1 });
    res.json(normAll(list));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/services', auth, requireRole('admin'), async (req, res) => {
  try {
    const { nombre, area, costo_material_base, tiempo_estimado_hrs, costo_hora } = req.body;
    if (!nombre || !area) return res.status(400).json({ error: 'Faltan campos' });
    const doc = await services.insertAsync({ nombre, area, costo_material_base: costo_material_base || 0, tiempo_estimado_hrs: tiempo_estimado_hrs || 1, costo_hora: costo_hora || 0, activo: true });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/services/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const svc = await services.findOneAsync({ _id: req.params.id });
    if (!svc) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, area, costo_material_base, tiempo_estimado_hrs, costo_hora, activo } = req.body;
    await services.updateAsync({ _id: req.params.id }, { $set: {
      nombre: nombre ?? svc.nombre,
      area: area ?? svc.area,
      costo_material_base: costo_material_base ?? svc.costo_material_base,
      tiempo_estimado_hrs: tiempo_estimado_hrs ?? svc.tiempo_estimado_hrs,
      costo_hora: costo_hora ?? svc.costo_hora,
      activo: activo !== undefined ? !!activo : svc.activo,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Fixed costs ───────────────────────────────────────────────────────────────

app.get('/api/fixed-costs', auth, requireRole('admin'), async (req, res) => {
  try { res.json(normAll(await fxCosts.findAsync({}).sort({ nombre: 1 }))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/fixed-costs', auth, requireRole('admin'), async (req, res) => {
  try {
    const { nombre, monto_mensual } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
    const doc = await fxCosts.insertAsync({ nombre, monto_mensual: monto_mensual || 0, activo: true });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/fixed-costs/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const fc = await fxCosts.findOneAsync({ _id: req.params.id });
    if (!fc) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, monto_mensual, activo } = req.body;
    await fxCosts.updateAsync({ _id: req.params.id }, { $set: {
      nombre: nombre ?? fc.nombre,
      monto_mensual: monto_mensual ?? fc.monto_mensual,
      activo: activo !== undefined ? !!activo : fc.activo,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Orders ────────────────────────────────────────────────────────────────────

function generateFolio() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `SB-${yy}${mm}${dd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

async function enrichOrders(list) {
  const userCache = {};
  const getUser = async id => {
    if (!id) return null;
    if (!userCache[id]) {
      const u = await users.findOneAsync({ _id: id });
      userCache[id] = u ? u.nombre : '—';
    }
    return userCache[id];
  };
  return Promise.all(list.map(async o => ({
    ...norm(o),
    creado_por_nombre: await getUser(o.created_by),
  })));
}

app.get('/api/orders', auth, async (req, res) => {
  try {
    const { status, area } = req.query;
    const query = {};
    if (req.user.role === 'produccion') query.area = req.user.area;
    else if (area) query.area = area;
    if (status) query.status = status;
    const list = await orders.findAsync(query).sort({ created_at: -1 });
    res.json(await enrichOrders(list));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (req.user.role === 'produccion' && order.area !== req.user.area) {
      return res.status(403).json({ error: 'Sin permiso' });
    }

    const isAdmin = req.user.role === 'admin';
    const [matList, laborList, logList, creador] = await Promise.all([
      mats.findAsync({ order_id: req.params.id }),
      labor.findAsync({ order_id: req.params.id }),
      logs.findAsync({ order_id: req.params.id }).sort({ timestamp: -1 }),
      users.findOneAsync({ _id: order.created_by }),
    ]);

    // Enrich logs with user names
    const userCache = {};
    const enrichedLogs = await Promise.all(logList.map(async l => {
      if (l.user_id && !userCache[l.user_id]) {
        const u = await users.findOneAsync({ _id: l.user_id });
        userCache[l.user_id] = u?.nombre || '—';
      }
      return { ...norm(l), user_nombre: l.user_id ? userCache[l.user_id] : '—' };
    }));

    // Strip financial data from non-admins
    const safeOrder = norm(order);
    if (!isAdmin) { delete safeOrder.precio_venta; delete safeOrder.costo_merma; }
    safeOrder.creado_por_nombre = creador?.nombre || '—';

    const safeMats = isAdmin
      ? normAll(matList)
      : matList.map(m => ({ id: m._id, order_id: m.order_id, material: m.material, cantidad: m.cantidad, unidad: m.unidad }));

    const safeLabor = isAdmin
      ? normAll(laborList)
      : laborList.map(l => ({ id: l._id, order_id: l.order_id, nombre_operador: l.nombre_operador, horas: l.horas, fecha: l.fecha }));

    const costos = isAdmin ? await calcCosts(order, matList, laborList) : null;

    res.json({ ...safeOrder, materials: safeMats, labor: safeLabor, logs: enrichedLogs, costos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', auth, requireRole('admin', 'ventas'), async (req, res) => {
  try {
    const { cliente, servicio_id, servicio_nombre, area, cantidad, descripcion, precio_venta, fecha_entrega } = req.body;
    if (!cliente || !area) return res.status(400).json({ error: 'Faltan campos requeridos' });

    let folio = generateFolio();
    while (await orders.findOneAsync({ folio })) folio = generateFolio();

    const doc = await orders.insertAsync({
      folio, cliente,
      servicio_id: servicio_id || null,
      servicio_nombre: servicio_nombre || 'Sin especificar',
      area, cantidad: cantidad || 1,
      descripcion: descripcion || null,
      precio_venta: precio_venta || 0,
      status: 'nuevo',
      created_by: req.user.id,
      created_at: now(),
      fecha_entrega: fecha_entrega || null,
      notas_produccion: null,
      horas_reales: null,
      piezas_merma: 0,
      costo_merma: 0,
      started_at: null,
      completed_at: null,
    });

    await logs.insertAsync({ order_id: doc._id, user_id: req.user.id, accion: 'Pedido creado', notas: null, timestamp: now() });
    res.json({ id: doc._id, folio });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', auth, requireRole('admin', 'ventas'), async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const { cliente, servicio_id, servicio_nombre, area, cantidad, descripcion, precio_venta, fecha_entrega, notas_produccion } = req.body;
    await orders.updateAsync({ _id: req.params.id }, { $set: {
      cliente: cliente ?? order.cliente,
      servicio_id: servicio_id ?? order.servicio_id,
      servicio_nombre: servicio_nombre ?? order.servicio_nombre,
      area: area ?? order.area,
      cantidad: cantidad ?? order.cantidad,
      descripcion: descripcion ?? order.descripcion,
      precio_venta: precio_venta ?? order.precio_venta,
      fecha_entrega: fecha_entrega ?? order.fecha_entrega,
      notas_produccion: notas_produccion ?? order.notas_produccion,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/status', auth, async (req, res) => {
  try {
    const { status, notas_produccion, horas_reales, piezas_merma, costo_merma, costo_proceso } = req.body;
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    if (req.user.role === 'produccion' && order.area !== req.user.area) {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    const allowed = {
      admin: ['nuevo', 'en_produccion', 'completado', 'entregado', 'cancelado'],
      ventas: ['entregado', 'cancelado'],
      produccion: ['en_produccion', 'completado'],
    };
    if (!allowed[req.user.role]?.includes(status)) {
      return res.status(403).json({ error: 'No puedes asignar ese estatus' });
    }

    const $set = { status };
    if (notas_produccion !== undefined) $set.notas_produccion = notas_produccion;
    if (horas_reales !== undefined) $set.horas_reales = horas_reales;
    if (piezas_merma !== undefined) $set.piezas_merma = piezas_merma;
    if (costo_proceso !== undefined) $set.costo_proceso = parseFloat(costo_proceso) || 0;
    // Only admin can record monetary merma cost
    if (req.user.role === 'admin' && costo_merma !== undefined) $set.costo_merma = costo_merma;

    if (status === 'en_produccion' && !order.started_at) $set.started_at = now();
    if (status === 'completado') $set.completed_at = now();

    await orders.updateAsync({ _id: req.params.id }, { $set });
    await logs.insertAsync({ order_id: req.params.id, user_id: req.user.id, accion: `Estado → ${status}`, notas: notas_produccion || null, timestamp: now() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Materials ─────────────────────────────────────────────────────────────────

app.post('/api/orders/:id/materials', auth, async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const { material, cantidad, unidad, costo_unitario } = req.body;
    if (!material) return res.status(400).json({ error: 'Falta material' });
    const efectivo = req.user.role === 'admin' ? (costo_unitario || 0) : 0;
    const doc = await mats.insertAsync({ order_id: req.params.id, material, cantidad: cantidad || 1, unidad: unidad || 'pza', costo_unitario: efectivo });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id/materials/:mid', auth, async (req, res) => {
  try {
    await mats.removeAsync({ _id: req.params.mid, order_id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Labor ─────────────────────────────────────────────────────────────────────

app.post('/api/orders/:id/labor', auth, async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const { horas, costo_hora, nombre_operador } = req.body;
    const efectivo = req.user.role === 'admin' ? (costo_hora || 0) : 0;
    const doc = await labor.insertAsync({
      order_id: req.params.id,
      user_id: req.user.id,
      nombre_operador: nombre_operador || req.user.nombre,
      horas: horas || 0,
      costo_hora: efectivo,
      fecha: now().slice(0, 10),
    });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id/labor/:lid', auth, async (req, res) => {
  try {
    await labor.removeAsync({ _id: req.params.lid, order_id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Cost calculation ──────────────────────────────────────────────────────────

async function calcCosts(order, matList, laborList) {
  // Costo de producción: si se capturó costo_proceso directo, se usa ese.
  // Si no, se suma materiales + mano de obra del detalle.
  const costoMateriales = matList.reduce((s, m) => s + (m.cantidad * m.costo_unitario), 0);
  const costoManoObra   = laborList.reduce((s, l) => s + (l.horas * l.costo_hora), 0);
  const costoProduccion = order.costo_proceso != null
    ? (order.costo_proceso || 0)
    : costoMateriales + costoManoObra;
  const costoMerma = order.costo_merma || 0;

  const allFc = await fxCosts.findAsync({ activo: true });
  const totalFixed = allFc.reduce((s, f) => s + f.monto_mensual, 0);
  const costoPorHora = totalFixed / 176; // 22 días × 8h
  const costoFijos = costoPorHora * (order.horas_reales || 0);

  const costoTotal = costoProduccion + costoMerma + costoFijos;
  const precioVenta = order.precio_venta || 0;
  const utilidad = precioVenta - costoTotal;
  // Margen sobre precio (%), markup sobre costo (x veces)
  const margen  = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;
  const markup  = costoTotal > 0  ? (precioVenta / costoTotal) : 0;

  const cantidad = order.cantidad || 1;
  const u = n => +(n / cantidad).toFixed(2);

  return {
    cantidad,
    costoProduccion: +costoProduccion.toFixed(2),
    costoMerma:      +costoMerma.toFixed(2),
    costoFijos:      +costoFijos.toFixed(2),
    costoTotal:      +costoTotal.toFixed(2),
    precioVenta:     +precioVenta.toFixed(2),
    utilidad:        +utilidad.toFixed(2),
    margen:          +margen.toFixed(1),
    markup:          +markup.toFixed(2),
    // Por pieza
    costoProduccionU: u(costoProduccion),
    costoMermaU:      u(costoMerma),
    costoFijosU:      u(costoFijos),
    costoTotalU:      u(costoTotal),
    precioVentaU:     u(precioVenta),
    utilidadU:        u(utilidad),
    // Detalle desglosado (para admin que quiera ver más)
    _costoMateriales: +costoMateriales.toFixed(2),
    _costoManoObra:   +costoManoObra.toFixed(2),
    _modoProceso:     order.costo_proceso != null,
  };
}

app.get('/api/orders/:id/costs', auth, requireRole('admin'), async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const [matList, laborList] = await Promise.all([
      mats.findAsync({ order_id: req.params.id }),
      labor.findAsync({ order_id: req.params.id }),
    ]);
    res.json(await calcCosts(order, matList, laborList));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports ───────────────────────────────────────────────────────────────────

app.get('/api/reports/summary', auth, requireRole('admin'), async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const query = { status: { $nin: ['cancelado'] } };
    if (desde || hasta) {
      query.created_at = {};
      if (desde) query.created_at.$gte = desde;
      if (hasta) query.created_at.$lte = hasta + ' 23:59:59';
    }

    const allOrders = await orders.findAsync(query);
    let totalVenta = 0, totalCosto = 0, totalMerma = 0;
    const porArea = {};
    const counters = { total: 0, nuevos: 0, en_produccion: 0, completados: 0, entregados: 0, cancelados: 0 };

    // Count all for status counters (including cancelled)
    const allForCount = await orders.findAsync(desde || hasta ? { created_at: query.created_at } : {});
    counters.total = allForCount.length;
    for (const o of allForCount) {
      if (o.status === 'nuevo') counters.nuevos++;
      else if (o.status === 'en_produccion') counters.en_produccion++;
      else if (o.status === 'completado') counters.completados++;
      else if (o.status === 'entregado') counters.entregados++;
      else if (o.status === 'cancelado') counters.cancelados++;
    }

    for (const order of allOrders) {
      const [matList, laborList] = await Promise.all([
        mats.findAsync({ order_id: order._id }),
        labor.findAsync({ order_id: order._id }),
      ]);
      const costs = await calcCosts(order, matList, laborList);
      totalVenta += costs.precioVenta;
      totalCosto += costs.costoTotal;
      totalMerma += costs.costoMerma;

      if (!porArea[order.area]) porArea[order.area] = { pedidos: 0, venta: 0, costo: 0 };
      porArea[order.area].pedidos++;
      porArea[order.area].venta += costs.precioVenta;
      porArea[order.area].costo += costs.costoTotal;
    }

    res.json({
      counters,
      totalVenta: +totalVenta.toFixed(2),
      totalCosto: +totalCosto.toFixed(2),
      totalMerma: +totalMerma.toFixed(2),
      utilidad: +(totalVenta - totalCosto).toFixed(2),
      margen: totalVenta > 0 ? +((totalVenta - totalCosto) / totalVenta * 100).toFixed(1) : 0,
      porArea,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Efficiency report ─────────────────────────────────────────────────────────

app.get('/api/reports/efficiency', auth, requireRole('admin'), async (req, res) => {
  try {
    const { desde, hasta, horas_dia = 8 } = req.query;
    const hdInt = parseFloat(horas_dia) || 8;

    // Date range
    const dateQuery = {};
    if (desde || hasta) {
      dateQuery.created_at = {};
      if (desde) dateQuery.created_at.$gte = desde;
      if (hasta) dateQuery.created_at.$lte = hasta + ' 23:59:59';
    }

    // Days in period
    const d1 = desde ? new Date(desde) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const d2 = hasta ? new Date(hasta) : new Date();
    const daysDiff = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const workDays = Math.round(daysDiff * 5 / 7); // approximate working days
    const capacidadTotal = workDays * hdInt; // available hours per person

    const allOrders = await orders.findAsync(dateQuery);
    const allLabor = await labor.findAsync({});

    const porArea = {};

    for (const o of allOrders) {
      const area = o.area;
      if (!porArea[area]) {
        porArea[area] = {
          area,
          pedidosTotal: 0,
          pedidosCompletados: 0,
          horasTrabajadas: 0,
          ingresos: 0,
          costoLaboral: 0,
          tiemposEntrega: [],
          capacidadHoras: capacidadTotal,
        };
      }
      const a = porArea[area];
      a.pedidosTotal++;
      if (['completado', 'entregado'].includes(o.status)) {
        a.pedidosCompletados++;
        if (o.started_at && o.completed_at) {
          const hrs = (new Date(o.completed_at) - new Date(o.started_at)) / 3600000;
          if (hrs > 0) a.tiemposEntrega.push(hrs);
        }
      }
      if (!['cancelado'].includes(o.status)) {
        a.ingresos += o.precio_venta || 0;
      }

      // Sum labor for this order
      const orderLabor = allLabor.filter(l => l.order_id === o._id);
      for (const l of orderLabor) {
        a.horasTrabajadas += l.horas || 0;
        a.costoLaboral += (l.horas || 0) * (l.costo_hora || 0);
      }
    }

    // Compute derived metrics
    const areas = Object.values(porArea).map(a => {
      const utilizacion = a.capacidadHoras > 0 ? (a.horasTrabajadas / a.capacidadHoras) * 100 : 0;
      const ingresoPorHora = a.horasTrabajadas > 0 ? a.ingresos / a.horasTrabajadas : 0;
      const tiempoPromedioEntrega = a.tiemposEntrega.length > 0
        ? a.tiemposEntrega.reduce((s, v) => s + v, 0) / a.tiemposEntrega.length
        : null;

      // Hiring ROI: what if we add 1 person (capacidadTotal more hours)?
      const capacidadAdicional = capacidadTotal;
      const ingresoAdicionalPotencial = ingresoPorHora * capacidadAdicional;
      // Estimate hire cost using average labor rate (costoLaboral / horasTrabajadas)
      const tarifaPromedio = a.horasTrabajadas > 0 ? a.costoLaboral / a.horasTrabajadas : 150;
      const costoContratar = tarifaPromedio * capacidadAdicional;
      const roiContratar = ingresoAdicionalPotencial - costoContratar;

      let recomendacion = 'ok';
      if (utilizacion >= 85) recomendacion = 'contratar';
      else if (utilizacion >= 65) recomendacion = 'vigilar';
      else if (utilizacion < 30 && a.pedidosTotal > 0) recomendacion = 'capacidad_libre';

      return {
        ...a,
        tiemposEntrega: undefined,
        utilizacion: +utilizacion.toFixed(1),
        ingresoPorHora: +ingresoPorHora.toFixed(2),
        tiempoPromedioEntrega: tiempoPromedioEntrega ? +tiempoPromedioEntrega.toFixed(1) : null,
        tarifaPromedio: +tarifaPromedio.toFixed(2),
        ingresoAdicionalPotencial: +ingresoAdicionalPotencial.toFixed(2),
        costoContratar: +costoContratar.toFixed(2),
        roiContratar: +roiContratar.toFixed(2),
        recomendacion,
      };
    });

    res.json({ areas, workDays, capacidadTotal, horas_dia: hdInt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Render upload ─────────────────────────────────────────────────────────────

app.post('/api/orders/:id/render', auth, upload.single('render'), async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

    // Delete old render file if exists
    if (order.render_file) {
      const { unlink } = require('fs');
      unlink(path.join(UPLOADS_DIR, order.render_file), () => {});
    }

    await orders.updateAsync({ _id: req.params.id }, { $set: { render_file: req.file.filename, render_original: req.file.originalname } });
    await logs.insertAsync({ order_id: req.params.id, user_id: req.user.id, accion: 'Render actualizado', notas: req.file.originalname, timestamp: now() });
    res.json({ url: `/uploads/${req.file.filename}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id/render', auth, async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    if (order.render_file) {
      const { unlink } = require('fs');
      unlink(path.join(UPLOADS_DIR, order.render_file), () => {});
    }
    await orders.updateAsync({ _id: req.params.id }, { $set: { render_file: null, render_original: null } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Clients (CRM) ─────────────────────────────────────────────────────────────

app.get('/api/clients', auth, async (req, res) => {
  try {
    const list = await clients.findAsync({}).sort({ nombre: 1 });
    res.json(normAll(list));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clients', auth, requireRole('admin', 'ventas'), async (req, res) => {
  try {
    const { nombre, empresa, telefono, email, notas } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
    const doc = await clients.insertAsync({ nombre, empresa: empresa || null, telefono: telefono || null, email: email || null, notas: notas || null, created_at: now() });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', auth, requireRole('admin', 'ventas'), async (req, res) => {
  try {
    const cl = await clients.findOneAsync({ _id: req.params.id });
    if (!cl) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, empresa, telefono, email, notas } = req.body;
    await clients.updateAsync({ _id: req.params.id }, { $set: {
      nombre: nombre ?? cl.nombre,
      empresa: empresa ?? cl.empresa,
      telefono: telefono ?? cl.telefono,
      email: email ?? cl.email,
      notas: notas ?? cl.notas,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:id/orders', auth, async (req, res) => {
  try {
    const list = await orders.findAsync({ client_id: req.params.id }).sort({ created_at: -1 });
    res.json(normAll(list));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Inventory ─────────────────────────────────────────────────────────────────

app.get('/api/inventory', auth, async (req, res) => {
  try {
    const list = await inventory.findAsync({}).sort({ nombre: 1 });
    res.json(normAll(list));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/inventory', auth, requireRole('admin'), async (req, res) => {
  try {
    const { nombre, unidad, stock_actual, stock_minimo, costo_unitario, area } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta nombre' });
    const doc = await inventory.insertAsync({ nombre, unidad: unidad || 'pza', stock_actual: stock_actual || 0, stock_minimo: stock_minimo || 0, costo_unitario: costo_unitario || 0, area: area || null, activo: true });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/inventory/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const item = await inventory.findOneAsync({ _id: req.params.id });
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, unidad, stock_actual, stock_minimo, costo_unitario, area, activo } = req.body;
    await inventory.updateAsync({ _id: req.params.id }, { $set: {
      nombre: nombre ?? item.nombre,
      unidad: unidad ?? item.unidad,
      stock_actual: stock_actual ?? item.stock_actual,
      stock_minimo: stock_minimo ?? item.stock_minimo,
      costo_unitario: costo_unitario ?? item.costo_unitario,
      area: area ?? item.area,
      activo: activo !== undefined ? !!activo : item.activo,
    }});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/inventory/:id/use', auth, async (req, res) => {
  try {
    const { cantidad } = req.body;
    const item = await inventory.findOneAsync({ _id: req.params.id });
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    const newStock = Math.max(0, (item.stock_actual || 0) - (cantidad || 0));
    await inventory.updateAsync({ _id: req.params.id }, { $set: { stock_actual: newStock } });
    res.json({ stock_actual: newStock, bajo_minimo: newStock < item.stock_minimo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Calendar ──────────────────────────────────────────────────────────────────

app.get('/api/calendar', auth, async (req, res) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);
    const desde = `${y}-${String(m).padStart(2,'0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const hasta = `${y}-${String(m).padStart(2,'0')}-${lastDay}`;

    const query = { fecha_entrega: { $gte: desde, $lte: hasta }, status: { $nin: ['cancelado'] } };
    if (req.user.role === 'produccion') query.area = req.user.area;

    const list = await orders.findAsync(query);
    res.json(normAll(list));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Payment ───────────────────────────────────────────────────────────────────

app.patch('/api/orders/:id/pago', auth, requireRole('admin', 'ventas'), async (req, res) => {
  try {
    const order = await orders.findOneAsync({ _id: req.params.id });
    if (!order) return res.status(404).json({ error: 'No encontrado' });
    const { anticipo, pagado, metodo_pago, fecha_pago, notas_pago } = req.body;
    const $set = {};
    if (anticipo !== undefined) $set.anticipo = parseFloat(anticipo) || 0;
    if (pagado !== undefined) $set.pagado = !!pagado;
    if (metodo_pago !== undefined) $set.metodo_pago = metodo_pago;
    if (fecha_pago !== undefined) $set.fecha_pago = fecha_pago;
    if (notas_pago !== undefined) $set.notas_pago = notas_pago;
    await orders.updateAsync({ _id: req.params.id }, { $set });
    await logs.insertAsync({ order_id: req.params.id, user_id: req.user.id, accion: pagado ? 'Pago completo registrado' : 'Pago actualizado', notas: metodo_pago || null, timestamp: now() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports: monthly trends ───────────────────────────────────────────────────

app.get('/api/reports/monthly', auth, requireRole('admin'), async (req, res) => {
  try {
    const nowDate = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const prefix = `${y}-${String(m).padStart(2,'0')}`;
      const desde = `${prefix}-01`;
      const hasta = `${prefix}-${new Date(y, m, 0).getDate()}`;
      const monthOrders = await orders.findAsync({
        created_at: { $gte: desde, $lte: hasta + ' 23:59:59' },
        status: { $nin: ['cancelado'] },
      });
      let venta = 0, costo = 0, merma = 0;
      for (const o of monthOrders) {
        const [ml, ll] = await Promise.all([mats.findAsync({ order_id: o._id }), labor.findAsync({ order_id: o._id })]);
        const costs = await calcCosts(o, ml, ll);
        venta += costs.precioVenta; costo += costs.costoTotal; merma += costs.costoMerma;
      }
      months.push({
        label: d.toLocaleString('es-MX', { month: 'short', year: '2-digit' }),
        venta: +venta.toFixed(2), costo: +costo.toFixed(2), merma: +merma.toFixed(2),
        pedidos: monthOrders.length, utilidad: +(venta - costo).toFixed(2),
      });
    }
    const byStatus = {};
    for (const s of ['nuevo','en_produccion','completado','entregado','cancelado'])
      byStatus[s] = await orders.countAsync({ status: s });
    res.json({ months, byStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports: cuentas por cobrar ───────────────────────────────────────────────

app.get('/api/reports/cobrar', auth, requireRole('admin', 'ventas'), async (req, res) => {
  try {
    const pendientes = await orders.findAsync({
      status: { $nin: ['cancelado'] },
      $or: [{ pagado: false }, { pagado: { $exists: false } }],
    });
    const result = normAll(pendientes).map(o => ({
      id: o.id, folio: o.folio, cliente: o.cliente, precio_venta: o.precio_venta || 0,
      anticipo: o.anticipo || 0, saldo: (o.precio_venta || 0) - (o.anticipo || 0),
      status: o.status, fecha_entrega: o.fecha_entrega,
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports: tiempos estándar vs reales ───────────────────────────────────────

app.get('/api/reports/tiempos', auth, requireRole('admin'), async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const query = { status: { $in: ['completado','entregado'] }, horas_reales: { $gt: 0 }, servicio_id: { $ne: null } };
    if (desde || hasta) {
      query.completed_at = {};
      if (desde) query.completed_at.$gte = desde;
      if (hasta) query.completed_at.$lte = hasta + ' 23:59:59';
    }
    const done = await orders.findAsync(query);
    const bySvc = {};
    for (const o of done) {
      const svc = await services.findOneAsync({ _id: o.servicio_id });
      if (!svc) continue;
      if (!bySvc[o.servicio_id]) bySvc[o.servicio_id] = { nombre: svc.nombre, area: svc.area, std: svc.tiempo_estimado_hrs, rows: [] };
      const esp = svc.tiempo_estimado_hrs * (o.cantidad || 1);
      const real = o.horas_reales;
      bySvc[o.servicio_id].rows.push({ folio: o.folio, cantidad: o.cantidad, esp: +esp.toFixed(2), real: +real.toFixed(2), variacion: +(real - esp).toFixed(2), variacionPct: +(esp > 0 ? (real - esp) / esp * 100 : 0).toFixed(1) });
    }
    const result = Object.values(bySvc).map(s => {
      const n = s.rows.length;
      const avgEsp = s.rows.reduce((sum, r) => sum + r.esp, 0) / n;
      const avgReal = s.rows.reduce((sum, r) => sum + r.real, 0) / n;
      return { nombre: s.nombre, area: s.area, std: s.std, n, avgEsp: +avgEsp.toFixed(2), avgReal: +avgReal.toFixed(2), avgVar: +(avgReal - avgEsp).toFixed(2), avgVarPct: +(avgEsp > 0 ? (avgReal - avgEsp) / avgEsp * 100 : 0).toFixed(1), rows: s.rows };
    }).sort((a, b) => b.avgVarPct - a.avgVarPct);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reports: merma detallada ──────────────────────────────────────────────────

app.get('/api/reports/merma', auth, requireRole('admin'), async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const query = { piezas_merma: { $gt: 0 } };
    if (desde || hasta) {
      query.completed_at = {};
      if (desde) query.completed_at.$gte = desde;
      if (hasta) query.completed_at.$lte = hasta + ' 23:59:59';
    }
    const mermaOrders = await orders.findAsync(query);
    const porArea = {};
    for (const o of mermaOrders) {
      if (!porArea[o.area]) porArea[o.area] = { area: o.area, totalPzas: 0, totalMerma: 0, costoMerma: 0, pedidos: [] };
      const a = porArea[o.area];
      a.totalPzas += (o.cantidad || 0) + (o.piezas_merma || 0);
      a.totalMerma += o.piezas_merma || 0;
      a.costoMerma += o.costo_merma || 0;
      const pct = ((o.piezas_merma || 0) / ((o.cantidad || 1) + (o.piezas_merma || 0))) * 100;
      a.pedidos.push({ folio: o.folio, cliente: o.cliente, servicio: o.servicio_nombre, cantidad: o.cantidad, pzas_merma: o.piezas_merma, costo_merma: o.costo_merma || 0, pct: +pct.toFixed(1) });
    }
    const result = Object.values(porArea).map(a => ({
      ...a,
      pctMerma: a.totalPzas > 0 ? +((a.totalMerma / a.totalPzas) * 100).toFixed(1) : 0,
      costoMerma: +a.costoMerma.toFixed(2),
    })).sort((a, b) => b.pctMerma - a.pctMerma);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Checklist config ──────────────────────────────────────────────────────────

app.get('/api/checklist/config', auth, async (req, res) => {
  try {
    const q = { activo: true };
    if (req.query.area) q.area = req.query.area;
    res.json(normAll(await checklistConfig.findAsync(q).sort({ area: 1 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/checklist/config', auth, requireRole('admin'), async (req, res) => {
  try {
    const { area, item } = req.body;
    if (!area || !item) return res.status(400).json({ error: 'Faltan campos' });
    const doc = await checklistConfig.insertAsync({ area, item, activo: true });
    res.json({ id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/checklist/config/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    await checklistConfig.updateAsync({ _id: req.params.id }, { $set: { activo: false } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Seriblast Producción corriendo en http://localhost:${PORT}`);
  console.log(`   Desde la red local: http://<TU-IP>:${PORT}`);
  console.log(`   Usuario inicial: admin / admin123\n`);
});
