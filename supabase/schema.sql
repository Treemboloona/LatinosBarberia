-- Barbería Latinos · Sistema de turnos
-- Pegar entero en Supabase > SQL Editor > New query > Run.

-- ---------- Tablas ----------
create table if not exists public.servicios (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  categoria   text not null default 'Cortes',
  precio      integer not null check (precio >= 0),
  duracion_min integer not null default 40 check (duracion_min between 10 and 300),
  nota        text,
  reservable  boolean not null default true,
  activo      boolean not null default true,
  orden       integer not null default 0
);

-- dia: 0 = domingo ... 6 = sábado (igual que JavaScript)
create table if not exists public.horarios (
  dia    smallint primary key check (dia between 0 and 6),
  abre   time,
  cierra time
);

create table if not exists public.turnos (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  servicio_id     bigint references public.servicios(id) on delete set null,
  servicio_nombre text not null,
  precio          integer not null default 0,
  inicio          timestamptz not null,
  fin             timestamptz not null,
  cliente_nombre  text not null check (char_length(cliente_nombre) between 2 and 80),
  cliente_tel     text not null check (char_length(cliente_tel) between 6 and 30),
  nota            text check (char_length(nota) <= 300),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','confirmado','asistio','no_vino','cancelado')),
  check (fin > inicio),
  -- Impide dos turnos superpuestos (los cancelados no cuentan)
  constraint turnos_sin_superposicion exclude using gist (tstzrange(inicio, fin) with &&)
    where (estado <> 'cancelado')
);
create index if not exists turnos_inicio_idx on public.turnos (inicio);

create table if not exists public.bloqueos (
  id     bigint generated always as identity primary key,
  inicio timestamptz not null,
  fin    timestamptz not null,
  motivo text,
  check (fin > inicio)
);

-- Quién puede entrar al panel (poné el mail del dueño)
create table if not exists public.admins (
  email text primary key
);

-- ---------- Datos iniciales ----------
insert into public.horarios (dia, abre, cierra) values
  (0, null, null),          -- domingo cerrado
  (1, '11:00', '20:00'), (2, '11:00', '20:00'), (3, '11:00', '20:00'),
  (4, '11:00', '20:00'), (5, '11:00', '20:00'), (6, '11:00', '20:00')
on conflict (dia) do nothing;

insert into public.servicios (nombre, categoria, precio, duracion_min, nota, reservable, orden)
select * from (values
  ('Corte clásico',     'Cortes', 15000, 40, 'Tijera y máquina, a tu medida.', true, 1),
  ('Fade / degradé',    'Cortes', 17000, 45, 'Low, mid o high, con terminación a navaja.', true, 2),
  ('Corte + barba',     'Cortes', 20000, 60, 'Perfilado con navaja y toalla caliente.', true, 3),
  ('Barba',             'Barba',   8000, 20, 'Rebaje, perfilado y definición.', true, 4),
  ('Corte niño',        'Cortes', 12000, 30, 'Hasta 12 años.', true, 5),
  ('Diseño / freestyle','Extras',  3000, 15, 'Líneas y detalles, se suma al corte.', true, 6)
) v(nombre, categoria, precio, duracion_min, nota, reservable, orden)
where not exists (select 1 from public.servicios);

-- ---------- Seguridad ----------
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email');
$$;

alter table public.servicios enable row level security;
alter table public.horarios  enable row level security;
alter table public.turnos    enable row level security;
alter table public.bloqueos  enable row level security;
alter table public.admins    enable row level security;

-- La web pública solo puede LEER servicios activos y horarios
create policy "publico lee servicios" on public.servicios for select using (activo or public.es_admin());
create policy "publico lee horarios"  on public.horarios  for select using (true);

-- El dueño puede todo
create policy "admin servicios" on public.servicios for all using (public.es_admin()) with check (public.es_admin());
create policy "admin horarios"  on public.horarios  for all using (public.es_admin()) with check (public.es_admin());
create policy "admin turnos"    on public.turnos    for all using (public.es_admin()) with check (public.es_admin());
create policy "admin bloqueos"  on public.bloqueos  for all using (public.es_admin()) with check (public.es_admin());
create policy "admin lee admins" on public.admins   for select using (public.es_admin());

-- ---------- Funciones para la web pública ----------
-- Devuelve solo los horarios ocupados (sin datos de clientes)
create or replace function public.horarios_ocupados(desde timestamptz, hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = public as $$
  select t.inicio, t.fin from public.turnos t
   where t.estado <> 'cancelado' and t.inicio < hasta and t.fin > desde
  union all
  select b.inicio, b.fin from public.bloqueos b
   where b.inicio < hasta and b.fin > desde;
$$;

-- Crea un turno validando horario, bloqueos y superposición
create or replace function public.crear_turno(
  p_servicio_id bigint, p_inicio timestamptz,
  p_nombre text, p_tel text, p_nota text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.servicios;
  h public.horarios;
  v_fin timestamptz;
  v_local timestamp;
  v_id uuid;
begin
  select * into s from public.servicios where id = p_servicio_id and activo and reservable;
  if not found then raise exception 'Servicio no disponible'; end if;

  if p_inicio < now() + interval '15 minutes' then
    raise exception 'Elegí un horario a partir de dentro de 15 minutos';
  end if;
  if p_inicio > now() + interval '60 days' then
    raise exception 'Solo se puede reservar hasta 60 días adelante';
  end if;

  v_fin := p_inicio + make_interval(mins => s.duracion_min);
  v_local := p_inicio at time zone 'America/Argentina/Buenos_Aires';

  select * into h from public.horarios where dia = extract(dow from v_local)::int;
  if h.abre is null
     or v_local::time < h.abre
     or (v_fin at time zone 'America/Argentina/Buenos_Aires')::time > h.cierra
     or (v_fin at time zone 'America/Argentina/Buenos_Aires')::date <> v_local::date then
    raise exception 'Ese horario está fuera del horario de atención';
  end if;

  if exists (select 1 from public.bloqueos b where b.inicio < v_fin and b.fin > p_inicio) then
    raise exception 'Ese horario no está disponible';
  end if;

  begin
    insert into public.turnos (servicio_id, servicio_nombre, precio, inicio, fin, cliente_nombre, cliente_tel, nota)
    values (s.id, s.nombre, s.precio, p_inicio, v_fin, trim(p_nombre), trim(p_tel), nullif(trim(p_nota), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar, elegí otro';
  end;

  return v_id;
end;
$$;

grant execute on function public.horarios_ocupados(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.crear_turno(bigint, timestamptz, text, text, text) to anon, authenticated;

-- Tarjeta de fidelidad: la web solo recibe cuántos cortes lleva ese número (nunca nombres ni datos)
create or replace function public.cortes_cliente(p_tel text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.turnos
  where estado = 'asistio'
    and length(regexp_replace(coalesce(p_tel,''), '\D', '', 'g')) >= 8
    and right(regexp_replace(cliente_tel, '\D', '', 'g'), 8) = right(regexp_replace(p_tel, '\D', '', 'g'), 8);
$$;
grant execute on function public.cortes_cliente(text) to anon, authenticated;

-- Avisos en vivo en el panel
alter publication supabase_realtime add table public.turnos;

-- Último paso: sacale los dos guiones del principio y poné el mail del dueño
-- insert into public.admins (email) values ('mail-del-dueno@gmail.com');
