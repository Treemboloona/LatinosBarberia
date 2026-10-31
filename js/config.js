// Configuración del sistema de turnos.
// Mientras SUPABASE_URL quede así, todo funciona en MODO DEMO (los datos se guardan en el navegador).
// Cuando crees el proyecto en Supabase, pegá acá la URL y la "anon public key" (Project Settings > API).
window.JSB_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY',
  NEGOCIO: 'Barbería Latinos',
  DIRECCION: 'Av. Lisandro de la Torre 2471',
  WHATSAPP: '5492975269763',
  WHATSAPP_TXT: '297 526-9763',
  ZONA: 'America/Argentina/Buenos_Aires',
  INTERVALO_MIN: 30,     // cada cuánto se ofrecen horarios
  DIAS_ADELANTE: 21,     // cuántos días se muestran para reservar
  DIAS_RECUPERAR: 30,    // clientes que no vienen hace más de estos días
  INSTAGRAM: '',          // usuario de Instagram sin @ (si queda vacío, no se muestra)
  CHICOS: true,           // true = muestra "Cortamos a chicos"
  PAGOS: ['efectivo', 'transferencia'],              // ej: ['efectivo', 'transferencia', 'tarjeta'] (vacío = no se muestra)
  // Barberos: si queda vacío, la sección no aparece. foto es opcional (ej: 'img/barbero1.jpg')
  BARBEROS: [
    // { nombre: 'Nombre', detalle: 'Especialista en fades', instagram: 'usuario', foto: 'img/barbero1.jpg' },
  ],
  // Reseñas REALES copiadas de Google (no inventar). Si queda vacío, no aparecen.
  RESENAS: [
    // { nombre: 'Juan P.', estrellas: 5, texto: 'Excelente atención...' },
    { nombre: 'Maximiliano P.', estrellas: 5, texto: 'Muy buena atención, buenos precios y profesionales. Lo recomiendo.' },
    { nombre: 'Sabrina S.', estrellas: 5, texto: 'Amé el corte de mi nene, me atendieron en el momento y excelente atención!' },
    { nombre: 'Yoel D.', estrellas: 5, texto: 'Excelentes buen ambiente y muy buena atención al público' },
  ],
  GOOGLE_PLACE_ID: 'ChIJBf92s9BU5L0RvNZc9S2ag2A',
  DEMO_KEY: 'latinos-demo-v4'
};
