// Backend de turnos: usa Supabase si está configurado, si no, modo demo en el navegador.
(function () {
  const C = window.JSB_CONFIG;
  const DEMO = !C.SUPABASE_URL || C.SUPABASE_URL.includes('TU-PROYECTO');
  const OFFSET = '-03:00'; // Argentina no tiene horario de verano

  // ---------- utilidades de fecha (siempre en hora de Argentina) ----------
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone: C.ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('es-AR', { timeZone: C.ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtLong = new Intl.DateTimeFormat('es-AR', { timeZone: C.ZONA, weekday: 'long', day: 'numeric', month: 'long' });
  const fmtWd = new Intl.DateTimeFormat('es-AR', { timeZone: C.ZONA, weekday: 'short' });
  const fmtShort = new Intl.DateTimeFormat('es-AR', { timeZone: C.ZONA, weekday: 'short', day: 'numeric', month: 'numeric' });
  const T = {
    ymd: d => fmtDate.format(d),                       // '2026-10-16'
    hm: d => fmtTime.format(d),                        // '17:30'
    long: d => fmtLong.format(d),                      // 'jueves, 16 de octubre'
    short: d => fmtShort.format(d),                    // 'jue, 16/10'
    wd: d => fmtWd.format(d).replace('.', ''),         // 'jue'
    at: (ymd, hm) => new Date(`${ymd}T${hm}:00${OFFSET}`),
    dow: ymd => new Date(`${ymd}T12:00:00${OFFSET}`).getUTCDay(),
    addDays: (ymd, n) => { const d = new Date(`${ymd}T12:00:00${OFFSET}`); d.setUTCDate(d.getUTCDate() + n); return T.ymd(d); },
    toMin: hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; },
    fromMin: m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`,
    today: () => T.ymd(new Date())
  };
  const money = n => '$' + Number(n || 0).toLocaleString('es-AR');

  // ¿Qué barbero (de la lista) está libre entre s y e? Los ocupados sin barbero_id son bloqueos para todos.
  function barberoLibre(s, e, ocupados, candidatos) {
    const choca = o => new Date(o.inicio) < e && new Date(o.fin) > s;
    if (ocupados.some(o => (o.barbero_id === null || o.barbero_id === undefined) && choca(o))) return undefined;
    if (!candidatos.length) return null;
    return candidatos.find(id => !ocupados.some(o => String(o.barbero_id) === String(id) && choca(o)));
  }

  // Horarios libres de un día para una duración dada (barberoId vacío = cualquiera)
  function slotsFor(ymd, durMin, horarios, ocupados, barberos, barberoId) {
    const cand = barberoId ? [barberoId] : (barberos || []).map(b => b.id);
    const h = horarios.find(x => Number(x.dia) === T.dow(ymd));
    if (!h || !h.abre || !h.cierra) return [];
    const open = T.toMin(String(h.abre).slice(0, 5)), close = T.toMin(String(h.cierra).slice(0, 5));
    const minStart = Date.now() + 15 * 60000;
    const out = [];
    for (let m = open; m + durMin <= close; m += C.INTERVALO_MIN) {
      const s = T.at(ymd, T.fromMin(m)), e = new Date(s.getTime() + durMin * 60000);
      if (s.getTime() < minStart) continue;
      if (barberoLibre(s, e, ocupados, cand) !== undefined) out.push(T.fromMin(m));
    }
    return out;
  }

  // ======================= MODO DEMO =======================
  function demoBackend() {
    const KEY = C.DEMO_KEY || 'jsb-demo-v1';
    const seed = () => {
      const hoy = T.today();
      const servicios = [
        { id: 1, nombre: 'Corte clásico', categoria: 'Cortes', precio: 15000, duracion_min: 40, nota: 'Tijera y máquina, a tu medida.', reservable: true, activo: true, orden: 1 },
        { id: 2, nombre: 'Fade / degradé', categoria: 'Cortes', precio: 17000, duracion_min: 45, nota: 'Low, mid o high, con terminación a navaja.', reservable: true, activo: true, orden: 2 },
        { id: 3, nombre: 'Corte + barba', categoria: 'Cortes', precio: 20000, duracion_min: 60, nota: 'Perfilado con navaja y toalla caliente.', reservable: true, activo: true, orden: 3 },
        { id: 4, nombre: 'Barba', categoria: 'Barba', precio: 8000, duracion_min: 20, nota: 'Rebaje, perfilado y definición.', reservable: true, activo: true, orden: 4 },
        { id: 5, nombre: 'Corte niño', categoria: 'Cortes', precio: 12000, duracion_min: 30, nota: 'Hasta 12 años.', reservable: true, activo: true, orden: 5 },
        { id: 6, nombre: 'Diseño / freestyle', categoria: 'Extras', precio: 3000, duracion_min: 15, nota: 'Líneas y detalles, se suma al corte.', reservable: true, activo: true, orden: 6 }
      ];
      const barberos = [
        { id: 1, nombre: 'Barbero 1', comision: 50, activo: true, orden: 1 },
        { id: 2, nombre: 'Barbero 2', comision: 50, activo: true, orden: 2 }
      ];
      const horarios = [0, 1, 2, 3, 4, 5, 6].map(d => ({ dia: d, abre: d === 0 ? null : '11:00', cierra: d === 0 ? null : '20:00' }));
      let n = 0;
      const mk = (ymd, hm, sid, nombre, tel, estado, bid) => {
        const s = servicios.find(x => x.id === sid), i = T.at(ymd, hm);
        return { id: 'demo-' + (++n), created_at: i.toISOString(), servicio_id: sid, barbero_id: bid || 1, servicio_nombre: s.nombre, precio: s.precio,
          inicio: i.toISOString(), fin: new Date(i.getTime() + s.duracion_min * 60000).toISOString(),
          cliente_nombre: nombre + ' (ejemplo)', cliente_tel: tel, nota: null, estado };
      };
      // Historial de ejemplo: clientes habituales, uno que dejó de venir, etc.
      const habituales = [
        ['Martín', '297 400-1111', 2, 8, 6], ['Lucas', '297 400-2222', 3, 10, 5], ['Tomás', '297 400-3333', 1, 12, 3],
        ['Franco', '297 400-4444', 2, 9, 2], ['Nico', '297 400-5555', 1, 20, 1], ['Brian', '297 400-6666', 3, 11, 3],
        ['Mati', '297 400-1212', 2, 7, 4], ['Leo', '297 400-1313', 1, 14, 2]
      ];
      const turnos = [];
      const abierto = ymd => T.dow(ymd) !== 0;
      const horas = ['11:30', '13:00', '15:30', '17:00', '18:30', '12:00', '14:30', '16:00'];
      habituales.forEach(([nom, tel, sid, cada, visitas], k) => {
        for (let v = 0; v < visitas; v++) {
          let ymd = T.addDays(hoy, -2 - k - v * cada); if (!abierto(ymd)) ymd = T.addDays(ymd, -1);
          turnos.push(mk(ymd, horas[(k + v) % horas.length], sid, nom, tel, 'asistio', (k + v) % 3 === 0 ? 2 : 1));
        }
      });
      // Clientes que hace rato no vienen
      [['Joaquín', '297 400-7777', 2, -48], ['Agus', '297 400-8888', 1, -39]].forEach(([nom, tel, sid, d]) => {
        const ymd = T.addDays(hoy, d); turnos.push(mk(abierto(ymd) ? ymd : T.addDays(ymd, 1), '16:00', sid, nom, tel, 'asistio', 2));
      });
      turnos.push(mk(T.addDays(hoy, -3), '19:00', 4, 'Dylan', '297 400-9999', 'no_vino', 2));
      // Agenda de hoy y mañana
      const man = abierto(T.addDays(hoy, 1)) ? T.addDays(hoy, 1) : T.addDays(hoy, 2);
      if (abierto(hoy)) {
        turnos.push(mk(hoy, '11:00', 1, 'Martín', '297 400-1111', 'asistio'));
        turnos.push(mk(hoy, '15:30', 3, 'Lucas', '297 400-2222', 'confirmado', 2));
        turnos.push(mk(hoy, '18:00', 2, 'Franco', '297 400-4444', 'pendiente'));
      }
      turnos.push(mk(man, '12:00', 2, 'Tomás', '297 400-3333', 'confirmado'));
      turnos.push(mk(man, '16:30', 3, 'Brian', '297 400-6666', 'pendiente', 2));
      turnos.push(mk(man, '19:00', 5, 'Nico', '297 400-5555', 'pendiente'));
      return { barberos, servicios, horarios, turnos, bloqueos: [], avisos: {}, seq: 1000 };
    };
    let db;
    const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db || !db.barberos) { db = seed(); save(); } };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
    load();
    const listeners = [];
    window.addEventListener('storage', ev => {
      if (ev.key !== KEY) return;
      const antes = new Set(db.turnos.map(t => t.id)); load();
      db.turnos.filter(t => !antes.has(t.id)).forEach(t => listeners.forEach(cb => cb(t)));
    });
    const ocupados = (d, h, sinId) => [...db.turnos.filter(t => t.estado !== 'cancelado' && t.id !== sinId), ...db.bloqueos.map(b => ({ ...b, barbero_id: null }))]
      .filter(o => new Date(o.inicio) < h && new Date(o.fin) > d).map(o => ({ inicio: o.inicio, fin: o.fin, barbero_id: o.barbero_id ?? null }));
    const activos = () => db.barberos.filter(b => b.activo).sort((a, b) => a.orden - b.orden);
    return {
      async servicios() { load(); return db.servicios.filter(s => s.activo).sort((a, b) => a.orden - b.orden); },
      async horarios() { load(); return db.horarios; },
      async barberos() { load(); return activos(); },
      async ocupados(desde, hasta) { load(); return ocupados(desde, hasta); },
      async crearTurno({ servicio_id, inicio, nombre, tel, nota, barbero_id }) {
        load();
        const s = db.servicios.find(x => x.id === Number(servicio_id) && x.activo && x.reservable);
        if (!s) throw new Error('Servicio no disponible');
        const i = new Date(inicio), f = new Date(i.getTime() + s.duracion_min * 60000);
        const bid = barberoLibre(i, f, ocupados(i, f), barbero_id ? [Number(barbero_id)] : activos().map(b => b.id));
        if (!bid) throw new Error('Ese horario se acaba de ocupar, elegí otro');
        const t = { id: 'demo-' + (db.seq++), created_at: new Date().toISOString(), servicio_id: s.id, barbero_id: bid, servicio_nombre: s.nombre, precio: s.precio,
          inicio: i.toISOString(), fin: f.toISOString(), cliente_nombre: nombre.trim(), cliente_tel: tel.trim(), nota: (nota || '').trim() || null, estado: 'pendiente' };
        db.turnos.push(t); save(); listeners.forEach(cb => cb(t));
        return t.id;
      },
      async cortesCliente(tel) {
        load(); const k = String(tel).replace(/\D/g, '').slice(-8); if (k.length < 8) return 0;
        return db.turnos.filter(t => t.estado === 'asistio' && String(t.cliente_tel).replace(/\D/g, '').slice(-8) === k).length;
      },
      auth: {
        async session() { try { return sessionStorage.getItem('jsb-demo-auth') ? { user: { email: 'demo@barberia' } } : null; } catch (e) { return null; } },
        async signIn() { try { sessionStorage.setItem('jsb-demo-auth', '1'); } catch (e) {} return true; },
        async signOut() { try { sessionStorage.removeItem('jsb-demo-auth'); } catch (e) {} }
      },
      admin: {
        async turnos(desde, hasta) { load(); return db.turnos.filter(t => new Date(t.inicio) >= desde && new Date(t.inicio) < hasta).sort((a, b) => a.inicio.localeCompare(b.inicio)); },
        async todosTurnos() { load(); return [...db.turnos]; },
        async estado(id, estado) { load(); const t = db.turnos.find(x => x.id === id); if (t) t.estado = estado; save(); },
        async bloqueos() { load(); return [...db.bloqueos].sort((a, b) => a.inicio.localeCompare(b.inicio)); },
        async bloquear(inicio, fin, motivo) { load(); db.bloqueos.push({ id: db.seq++, inicio: inicio.toISOString(), fin: fin.toISOString(), motivo }); save(); },
        async desbloquear(id) { load(); db.bloqueos = db.bloqueos.filter(b => b.id !== id); save(); },
        async servicios() { load(); return [...db.servicios].sort((a, b) => a.orden - b.orden); },
        async guardarServicio(s) {
          load();
          if (s.id) Object.assign(db.servicios.find(x => x.id === s.id), s);
          else db.servicios.push({ ...s, id: db.seq++, orden: db.servicios.length + 1 });
          save();
        },
        async horarios() { load(); return db.horarios; },
        async guardarHorario(h) { load(); Object.assign(db.horarios.find(x => x.dia === h.dia), h); save(); },
        async barberos() { load(); return [...db.barberos].sort((a, b) => a.orden - b.orden); },
        async guardarBarbero(b) {
          load();
          if (b.id) Object.assign(db.barberos.find(x => x.id === b.id), b);
          else db.barberos.push({ ...b, id: db.seq++, orden: db.barberos.length + 1 });
          save();
        },
        async asignarBarbero(id, barbero_id) {
          load(); const t = db.turnos.find(x => x.id === id); if (!t) return;
          const i = new Date(t.inicio), f = new Date(t.fin);
          if (t.estado !== 'cancelado' && ocupados(i, f, t.id).some(o => String(o.barbero_id) === String(barbero_id)))
            throw new Error('Ese barbero ya tiene un turno en ese horario');
          t.barbero_id = Number(barbero_id); save();
        },
        async cargarCorte({ servicio_id, barbero_id, inicio, nombre, tel }) {
          load(); const s = db.servicios.find(x => x.id === Number(servicio_id)); if (!s) throw new Error('Elegí un servicio');
          const i = new Date(inicio), f = new Date(i.getTime() + s.duracion_min * 60000);
          if (ocupados(i, f).some(o => String(o.barbero_id) === String(barbero_id))) throw new Error('Ese barbero ya tiene un turno en ese horario');
          const t = { id: 'demo-' + (db.seq++), created_at: new Date().toISOString(), servicio_id: s.id, barbero_id: Number(barbero_id), servicio_nombre: s.nombre, precio: s.precio,
            inicio: i.toISOString(), fin: f.toISOString(), cliente_nombre: (nombre || '').trim() || 'Sin turno', cliente_tel: (tel || '').trim() || null, nota: null, estado: 'asistio' };
          db.turnos.push(t); save(); return t.id;
        },
        async avisosEnviados() { load(); return db.avisos || {}; },
        async marcarAviso(clave) { load(); db.avisos = db.avisos || {}; db.avisos[clave] = new Date().toISOString(); save(); },
        async reiniciarDemo() { db = seed(); save(); }
      },
      onNuevoTurno(cb) { listeners.push(cb); }
    };
  }

  // ======================= SUPABASE =======================
  function supabaseBackend() {
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    return {
      async servicios() { return ok(await sb.from('servicios').select('*').eq('activo', true).order('orden')); },
      async horarios() { return ok(await sb.from('horarios').select('*')); },
      async barberos() { return ok(await sb.from('barberos').select('id,nombre,orden').eq('activo', true).order('orden')); },
      async ocupados(desde, hasta) { return ok(await sb.rpc('horarios_ocupados', { desde: desde.toISOString(), hasta: hasta.toISOString() })); },
      async crearTurno({ servicio_id, inicio, nombre, tel, nota, barbero_id }) {
        return ok(await sb.rpc('crear_turno', { p_servicio_id: Number(servicio_id), p_inicio: new Date(inicio).toISOString(), p_nombre: nombre, p_tel: tel, p_nota: nota || null, p_barbero_id: barbero_id ? Number(barbero_id) : null }));
      },
      async cortesCliente(tel) { return ok(await sb.rpc('cortes_cliente', { p_tel: String(tel) })); },
      auth: {
        async session() { return ok(await sb.auth.getSession()).session; },
        async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); return true; },
        async signOut() { await sb.auth.signOut(); }
      },
      admin: {
        async turnos(desde, hasta) { return ok(await sb.from('turnos').select('*').gte('inicio', desde.toISOString()).lt('inicio', hasta.toISOString()).order('inicio')); },
        async todosTurnos() { return ok(await sb.from('turnos').select('*').order('inicio', { ascending: false }).limit(5000)); },
        async estado(id, estado) { ok(await sb.from('turnos').update({ estado }).eq('id', id)); },
        async bloqueos() { return ok(await sb.from('bloqueos').select('*').gte('fin', new Date().toISOString()).order('inicio')); },
        async bloquear(inicio, fin, motivo) { ok(await sb.from('bloqueos').insert({ inicio: inicio.toISOString(), fin: fin.toISOString(), motivo })); },
        async desbloquear(id) { ok(await sb.from('bloqueos').delete().eq('id', id)); },
        async servicios() { return ok(await sb.from('servicios').select('*').order('orden')); },
        async guardarServicio(s) {
          const { id, ...rest } = s;
          if (id) ok(await sb.from('servicios').update(rest).eq('id', id));
          else ok(await sb.from('servicios').insert(rest));
        },
        async horarios() { return ok(await sb.from('horarios').select('*').order('dia')); },
        async guardarHorario(h) { ok(await sb.from('horarios').update({ abre: h.abre, cierra: h.cierra }).eq('dia', h.dia)); },
        async barberos() { return ok(await sb.from('barberos').select('*').order('orden')); },
        async guardarBarbero(b) {
          const { id, ...rest } = b;
          if (id) ok(await sb.from('barberos').update(rest).eq('id', id));
          else ok(await sb.from('barberos').insert(rest));
        },
        async asignarBarbero(id, barbero_id) {
          const r = await sb.from('turnos').update({ barbero_id: Number(barbero_id) }).eq('id', id);
          if (r.error) throw new Error(/superposicion|exclusion|conflict/i.test(r.error.message) ? 'Ese barbero ya tiene un turno en ese horario' : r.error.message);
        },
        async cargarCorte({ servicio_id, barbero_id, inicio, nombre, tel }) {
          const s = ok(await sb.from('servicios').select('*').eq('id', Number(servicio_id)).single());
          const i = new Date(inicio), f = new Date(i.getTime() + s.duracion_min * 60000);
          const r = await sb.from('turnos').insert({ servicio_id: s.id, barbero_id: Number(barbero_id), servicio_nombre: s.nombre, precio: s.precio,
            inicio: i.toISOString(), fin: f.toISOString(), cliente_nombre: (nombre || '').trim() || 'Sin turno', cliente_tel: (tel || '').trim() || null, estado: 'asistio' });
          if (r.error) throw new Error(/superposicion|exclusion|conflict/i.test(r.error.message) ? 'Ese barbero ya tiene un turno en ese horario' : r.error.message);
        },
        // Los avisos enviados se recuerdan en este dispositivo (no hace falta tabla extra)
        async avisosEnviados() { try { return JSON.parse(localStorage.getItem('avisos-enviados') || '{}'); } catch (e) { return {}; } },
        async marcarAviso(clave) { try { const a = JSON.parse(localStorage.getItem('avisos-enviados') || '{}'); a[clave] = new Date().toISOString(); localStorage.setItem('avisos-enviados', JSON.stringify(a)); } catch (e) {} },
        async reiniciarDemo() {}
      },
      onNuevoTurno(cb) {
        sb.channel('turnos-nuevos').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'turnos' }, p => cb(p.new)).subscribe();
      }
    };
  }

  window.JSB = { DEMO, T, money, slotsFor, barberoLibre, api: DEMO ? demoBackend() : supabaseBackend() };
})();
