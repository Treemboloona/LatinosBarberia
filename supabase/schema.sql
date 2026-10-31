-- Barbería Latinos · Sistema de turnos
-- Pegar entero en Supabase > SQL Editor > New query > Run.

-- ---------- Tablas ----------
create extension if not exists btree_gist;

create table if not exists public.barberos (
  id       bigint generated always as identity primary key,
  nombre   text not null check (char_length(nombre) between 1 and 40),
  comision integer not null default 50 check (comision between 0 and 100), -- % que se lleva el barbero
  activo   boolean not null default true,
  orden    integer not null default 0
);

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
  barbero_id      bigint references public.barberos(id) on delete set null,
  servicio_nombre text not null,
  precio          integer not null default 0,
  inicio          timestamptz not null,
  fin             timestamptz not null,
  cliente_nombre  text not null check (char_length(cliente_nombre) between 2 and 80),
  cliente_tel     text check (cliente_tel is null or char_length(cliente_tel) between 6 and 30), -- puede quedar vacío en cortes sin turno
  nota            text check (char_length(nota) <= 300),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','confirmado','asistio','no_vino','cancelado')),
  check (fin > inicio),
  -- Un mismo barbero no puede tener dos turnos superpuestos (los cancelados no cuentan)
  constraint turnos_sin_superposicion exclude using gist (barbero_id with =, tstzrange(inicio, fin) with &&)
    where (estado <> 'cancelado')
);
create index if not exists turnos_inicio_idx on public.turnos (inicio);
create index if not exists turnos_barbero_idx on public.turnos (barbero_id, inicio);

create table if not exists public.bloqueos (
  id     bigint generated always as identity primary key,
  inicio timestamptz not null,
  fin    timestamptz not null,
  motivo text,
  check (fin > inicio)
);

-- Cuánta espera hay ahora en el local (lo cambia el barbero desde el panel, se ve en la web)
create table if not exists public.estado_local (
  id         smallint primary key default 1 check (id = 1),
  estado     text not null default 'sin' check (estado in ('sin','poca','mucha','cerrado')),
  actualizado timestamptz not null default now()
);
insert into public.estado_local (id) values (1) on conflict (id) do nothing;

-- Quién puede entrar al panel (poné el mail del dueño)
create table if not exists public.admins (
  email text primary key
);

-- ---------- Datos iniciales ----------
-- Cambiá los nombres desde el panel (pestaña Barberos)
insert into public.barberos (nombre, comision, orden)
select * from (values ('Barbero 1', 50, 1), ('Barbero 2', 50, 2)) v(nombre, comision, orden)
where not exists (select 1 from public.barberos);

insert into public.horarios (dia, abre, cierra) values
  (0, null, null),          -- domingo cerrado
  (1, '11:00', '20:00'), (2, '11:00', '20:00'), (3, '11:00', '20:00'),
  (4, '11:00', '20:00'), (5, '11:00', '20:00'), (6, '11:00', '20:00')
on conflict (dia) do nothing;

insert into public.servicios (nombre, categoria, precio, duracion_min, nota, reservable, orden)
select * from (values
  ('Corte',           'Cortes', 23000, 40, null, true, 1),
  ('Corte con cejas', 'Cortes', 25000, 45, null, true, 2),
  ('Corte y barba',   'Cortes', 30000, 60, null, true, 3),
  ('Barba',           'Barba',  14000, 20, null, true, 4),
  ('Cejas',           'Extras',  5000, 10, null, true, 5)
) v(nombre, categoria, precio, duracion_min, nota, reservable, orden)
where not exists (select 1 from public.servicios);

-- ---------- Seguridad ----------
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = auth.jwt() ->> 'email');
$$;

alter table public.barberos  enable row level security;
alter table public.estado_local enable row level security;
alter table public.servicios enable row level security;
alter table public.horarios  enable row level security;
alter table public.turnos    enable row level security;
alter table public.bloqueos  enable row level security;
alter table public.admins    enable row level security;

-- La web pública solo puede LEER servicios activos y horarios
create policy "publico lee servicios" on public.servicios for select using (activo or public.es_admin());
create policy "publico lee horarios"  on public.horarios  for select using (true);
create policy "publico lee estado"   on public.estado_local for select using (true);
create policy "admin estado"         on public.estado_local for all using (public.es_admin()) with check (public.es_admin());
create policy "publico lee barberos"  on public.barberos  for select using (activo or public.es_admin());

-- El dueño puede todo
create policy "admin barberos"  on public.barberos  for all using (public.es_admin()) with check (public.es_admin());
create policy "admin servicios" on public.servicios for all using (public.es_admin()) with check (public.es_admin());
create policy "admin horarios"  on public.horarios  for all using (public.es_admin()) with check (public.es_admin());
create policy "admin turnos"    on public.turnos    for all using (public.es_admin()) with check (public.es_admin());
create policy "admin bloqueos"  on public.bloqueos  for all using (public.es_admin()) with check (public.es_admin());
create policy "admin lee admins" on public.admins   for select using (public.es_admin());

-- ---------- Funciones para la web pública ----------
-- Devuelve solo los horarios ocupados (sin datos de clientes)
create or replace function public.horarios_ocupados(desde timestamptz, hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz, barbero_id bigint)
language sql stable security definer set search_path = public as $$
  -- barbero_id vacío = bloqueo para todos
  select t.inicio, t.fin, t.barbero_id from public.turnos t
   where t.estado <> 'cancelado' and t.inicio < hasta and t.fin > desde
  union all
  select b.inicio, b.fin, null::bigint from public.bloqueos b
   where b.inicio < hasta and b.fin > desde;
$$;

-- Crea un turno validando horario, bloqueos y superposición
create or replace function public.crear_turno(
  p_servicio_id bigint, p_inicio timestamptz,
  p_nombre text, p_tel text, p_nota text default null,
  p_barbero_id bigint default null   -- vacío = cualquiera que esté libre
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.servicios;
  h public.horarios;
  v_fin timestamptz;
  v_local timestamp;
  v_id uuid;
  v_barbero bigint;
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

  if trim(coalesce(p_tel, '')) = '' then raise exception 'Poné tu WhatsApp'; end if;

  if p_barbero_id is not null then
    if not exists (select 1 from public.barberos where id = p_barbero_id and activo) then
      raise exception 'Ese barbero no está disponible';
    end if;
    v_barbero := p_barbero_id;
  else
    -- el primer barbero activo que esté libre en ese horario
    select b.id into v_barbero from public.barberos b
     where b.activo and not exists (
       select 1 from public.turnos t where t.barbero_id = b.id and t.estado <> 'cancelado'
          and t.inicio < v_fin and t.fin > p_inicio)
     order by b.orden, b.id limit 1;
    if v_barbero is null then raise exception 'Ese horario se acaba de ocupar, elegí otro'; end if;
  end if;

  begin
    insert into public.turnos (servicio_id, barbero_id, servicio_nombre, precio, inicio, fin, cliente_nombre, cliente_tel, nota)
    values (s.id, v_barbero, s.nombre, s.precio, p_inicio, v_fin, trim(p_nombre), trim(p_tel), nullif(trim(p_nota), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario se acaba de ocupar, elegí otro';
  end;

  return v_id;
end;
$$;

grant execute on function public.horarios_ocupados(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.crear_turno(bigint, timestamptz, text, text, text, bigint) to anon, authenticated;

-- Avisos en vivo en el panel
alter publication supabase_realtime add table public.turnos;

-- Último paso: sacale los dos guiones del principio y poné el mail del dueño
-- insert into public.admins (email) values ('mail-del-dueno@gmail.com');
