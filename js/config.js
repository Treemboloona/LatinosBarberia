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
  FIDELIDAD_CADA: 5,     // cada 5 cortes, el siguiente es gratis
  DIAS_RECUPERAR: 30,    // clientes que no vienen hace más de estos días
  DEMO_KEY: 'latinos-demo-v1'
};
