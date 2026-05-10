const Anthropic = require('@anthropic-ai/sdk');

// ---- SYSTEM PROMPT -----------------------------------------------

function buildSystemPrompt() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Mexico_City',
  });
  const timeStr = now.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });

  return `Eres JARVIS, un asistente de inteligencia artificial personal extremadamente capaz. Eres la IA personal del usuario — su asistente, consejero y ayudante para cualquier tarea.

## FECHA Y HORA ACTUAL
${dateStr}, ${timeStr} (Hora de México)

## TU PERSONALIDAD
- Sofisticado y eficiente, como el JARVIS original de Iron Man
- Ligeramente formal pero cálido y accesible
- Proactivo: ofreces opciones y anticipas necesidades
- Directo: respuestas concisas (1-3 oraciones salvo que se necesite más detalle)
- Siempre en español de México

## CAPACIDADES
Puedes ayudar con CUALQUIER cosa:
- Preguntas generales, historia, ciencia, tecnología, cultura
- Matemáticas, conversiones, cálculos
- Redacción de mensajes, correos, textos
- Consejos y recomendaciones personales
- Traducción a/desde cualquier idioma
- Recetas, instrucciones, guías paso a paso
- Código y programación
- Análisis y razonamiento

## HERRAMIENTAS DISPONIBLES
Tienes acceso a herramientas que permiten interactuar con el teléfono y el mundo real. Úsalas cuando el usuario lo pida:
- Abrir URLs, sitios web, apps
- Hacer llamadas telefónicas
- Enviar mensajes de WhatsApp
- Buscar en Google/YouTube/Maps
- Obtener el clima actual
- Abrir Google Maps con indicaciones
- Programar recordatorios
- Copiar texto al portapapeles

## INSTRUCCIONES CLAVE
1. Si el usuario pide abrir algo → usa la herramienta apropiada
2. Si el usuario pide el clima → usa get_weather con la ciudad
3. Si el usuario pide una llamada → usa make_call
4. Si el usuario quiere mandar WhatsApp → usa send_whatsapp
5. Si el usuario pide buscar algo online → usa search_web con query en español
6. Puedes responder Y usar herramientas en el mismo turno
7. Responde SIEMPRE en español, sin importar el idioma del usuario
8. Sé conversacional: el usuario puede hablar por voz`;
}

// ---- TOOLS -------------------------------------------------------

const TOOLS = [
  {
    name: 'open_url',
    description: 'Abre una URL o aplicación en el teléfono del usuario. Usa esto para abrir cualquier sitio web, YouTube, Instagram, TikTok, Google, Wikipedia, Netflix, etc.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL completa a abrir (incluyendo https://)' },
        label: { type: 'string', description: 'Descripción corta de lo que se está abriendo, ej: "YouTube - Reggaeton hits"' },
      },
      required: ['url', 'label'],
    },
  },
  {
    name: 'make_call',
    description: 'Inicia una llamada telefónica. El usuario puede decir "llama a [nombre/número]".',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número de teléfono a llamar (solo dígitos, con código de país si se sabe)' },
        name: { type: 'string', description: 'Nombre del contacto si se proporcionó' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'send_whatsapp',
    description: 'Abre WhatsApp con un mensaje pre-escrito listo para enviar. El usuario puede dictar el mensaje.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número de teléfono (sin +, con código de país, ej: 5215512345678)' },
        message: { type: 'string', description: 'Mensaje a enviar por WhatsApp' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    name: 'search_web',
    description: 'Busca en Google. Úsalo cuando el usuario necesite info actualizada: noticias, precios, personas, eventos, lugares locales, etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Términos de búsqueda en español' },
        site: {
          type: 'string',
          enum: ['google', 'youtube', 'twitter', 'news'],
          description: 'Dónde buscar (default: google)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_maps',
    description: 'Abre Google Maps para buscar un lugar, ver una dirección, o pedir cómo llegar a algún sitio.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Lugar, dirección, o "cómo llegar a [destino] desde [origen]"' },
        mode: {
          type: 'string',
          enum: ['search', 'directions'],
          description: 'search: buscar lugar. directions: cómo llegar.',
        },
        destination: { type: 'string', description: 'Destino para indicaciones (si mode=directions)' },
      },
      required: ['query', 'mode'],
    },
  },
  {
    name: 'send_email',
    description: 'Redacta y abre el cliente de correo para enviar un email.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Dirección de correo del destinatario' },
        subject: { type: 'string', description: 'Asunto del correo' },
        body: { type: 'string', description: 'Cuerpo del correo ya redactado' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'get_weather',
    description: 'Obtiene el clima actual y pronóstico de una ciudad. Devuelve temperatura, condición, humedad, viento.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Nombre de la ciudad en español' },
        country_code: { type: 'string', description: 'Código de país ISO 2 letras opcional (MX, US, ES...)' },
      },
      required: ['city'],
    },
  },
  {
    name: 'set_reminder',
    description: 'Programa una notificación recordatorio en el teléfono del usuario para dentro de X minutos.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título del recordatorio (corto)' },
        message: { type: 'string', description: 'Descripción o detalle del recordatorio' },
        delay_minutes: { type: 'number', description: 'Minutos desde ahora para el recordatorio (mínimo 1)' },
      },
      required: ['title', 'delay_minutes'],
    },
  },
  {
    name: 'copy_to_clipboard',
    description: 'Copia un texto al portapapeles del usuario para que pueda pegarlo donde quiera.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Texto a copiar' },
        label: { type: 'string', description: 'Descripción de lo que se copió' },
      },
      required: ['text', 'label'],
    },
  },
];

// ---- WEATHER (Open-Meteo — free, no key) -------------------------

const WMO_CODES = {
  0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Niebla', 48: 'Niebla con escarcha',
  51: 'Llovizna ligera', 53: 'Llovizna', 55: 'Llovizna intensa',
  61: 'Lluvia ligera', 63: 'Lluvia moderada', 65: 'Lluvia fuerte',
  71: 'Nieve ligera', 73: 'Nieve moderada', 75: 'Nevada fuerte',
  80: 'Chubascos ligeros', 81: 'Chubascos', 82: 'Chubascos fuertes',
  95: 'Tormenta eléctrica', 96: 'Tormenta con granizo', 99: 'Tormenta severa',
};

async function getWeather(city, countryCode) {
  try {
    const q = countryCode ? `${city} ${countryCode}` : city;
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=es&format=json`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();

    if (!geoData.results?.length) {
      return `No encontré datos del clima para "${city}". Verifica el nombre de la ciudad.`;
    }

    const { latitude, longitude, name, country_code, timezone } = geoData.results[0];
    const tz = timezone || 'America/Mexico_City';

    const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=${encodeURIComponent(tz)}&forecast_days=1`;
    const wRes = await fetch(wUrl);
    const wData = await wRes.json();

    const c = wData.current;
    const desc = WMO_CODES[c.weather_code] || 'Sin datos';

    return [
      `Ciudad: ${name} (${country_code})`,
      `Temperatura: ${c.temperature_2m}°C (sensación ${c.apparent_temperature}°C)`,
      `Condición: ${desc}`,
      `Humedad: ${c.relative_humidity_2m}%`,
      `Viento: ${c.wind_speed_10m} km/h`,
      c.precipitation > 0 ? `Precipitación: ${c.precipitation} mm` : '',
    ].filter(Boolean).join('\n');
  } catch {
    return `No pude obtener el clima para "${city}" en este momento.`;
  }
}

// ---- RATE LIMIT --------------------------------------------------

const RATE = new Map();
function checkRate(ip) {
  const key = ip || 'anon';
  const now = Date.now();
  const entry = RATE.get(key) || { n: 0, t: now };
  if (now - entry.t > 60000) { RATE.set(key, { n: 1, t: now }); return true; }
  if (entry.n >= 30) return false;
  entry.n++;
  RATE.set(key, entry);
  return true;
}

// ---- CORS --------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// ---- HANDLER -----------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'];
  if (!checkRate(ip)) {
    return { statusCode: 429, headers: CORS, body: JSON.stringify({ error: 'Demasiadas solicitudes. Espera un momento.' }) };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 503, headers: CORS,
      body: JSON.stringify({ error: 'JARVIS no está configurado. Agrega tu ANTHROPIC_API_KEY en Netlify.' }),
    };
  }

  let messages;
  try {
    ({ messages } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  if (!Array.isArray(messages) || !messages.length) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Se requieren mensajes' }) };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let msgHistory = messages.slice(-20);
  const clientActions = [];
  let finalText = '';
  let iterations = 0;

  // Agentic loop: Claude → tool call → result → Claude...
  while (iterations < 5) {
    iterations++;
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(),
      messages: msgHistory,
      tools: TOOLS,
    });

    // Collect text from this turn
    for (const block of response.content) {
      if (block.type === 'text') finalText = block.text;
    }

    // No more tool calls — done
    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason !== 'tool_use') break;

    // Process each tool call
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result;
      if (block.name === 'get_weather') {
        // Server-side: fetch real weather data
        result = await getWeather(block.input.city, block.input.country_code);
      } else {
        // Client-side: mark as queued, execute on frontend
        clientActions.push({ id: block.id, name: block.name, input: block.input });
        result = JSON.stringify({ status: 'queued_for_client', action: block.name });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    // Continue conversation with tool results
    msgHistory = [
      ...msgHistory,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ text: finalText, actions: clientActions }),
  };
};
