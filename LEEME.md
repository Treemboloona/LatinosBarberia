# Barbería Latinos · Web con turnos, tarjeta de fidelidad y panel

## Qué hay en esta carpeta

| Archivo | Para qué es |
|---|---|
| `index.html` | La web de Latinos: turnos online, horarios libres en vivo, precios y Tarjeta Latinos |
| `admin.html` | El panel del barbero: agenda, avisos, clientes, resumen, bloqueos, servicios y horarios |
| `js/config.js` | Los datos de conexión a Supabase (lo único que hay que tocar) |
| `js/backend.js` | La lógica de turnos (no hace falta tocarlo) |
| `supabase/schema.sql` | Crea las tablas, la seguridad y las funciones en Supabase |
| `supabase/functions/notify-turno/index.ts` | Manda el aviso por mail y WhatsApp cuando entra un turno |

## Lo que la hace distinta
- **Turnos libres en vivo** en la portada: el cliente ve los horarios que quedan hoy y reserva con un toque.
- **Tarjeta Latinos**: cada 5 cortes, el siguiente gratis. El cliente pone su WhatsApp en la web y ve sus sellos. Se suma sola cuando el barbero marca "Vino".
- **Pestaña Avisos** en el panel: recordatorios de los turnos de mañana, clientes que ganaron el corte gratis, los que están a uno, y los que hace más de 30 días no vienen. Cada uno con el mensaje de WhatsApp ya escrito.
- **Precios que se actualizan solos**: si el barbero cambia un precio en el panel, cambia en la web.

## Modo demo (para mostrar)

Así como está, todo funciona sin Supabase: los turnos se guardan en el navegador.

1. Subí la carpeta entera a GitHub Pages (o abrí `index.html` en la compu).
2. Reservá un turno desde la web.
3. Probá la Tarjeta Latinos con el número 297 400-2222.
4. Abrí `admin.html` en el mismo navegador, entrá con cualquier mail y contraseña, y vas a ver el turno en la agenda.

El panel trae algunos turnos de ejemplo marcados como "(ejemplo)". Se pueden borrar con "Reiniciar demo".

## Puesta en marcha real

### 1. Supabase
1. Creá un proyecto nuevo en supabase.com (región São Paulo, es la más cercana).
2. SQL Editor > New query > pegá todo `supabase/schema.sql` > Run.
3. Al final del archivo hay una línea comentada. Corré esto con el mail del dueño:
   `insert into public.admins (email) values ('mail-del-dueno@gmail.com');` (sin los acentos graves)
4. Authentication > Users > Add user > creale el usuario a el dueño con ese mail y una contraseña.
5. Authentication > Sign In / Providers > desactivá "Allow new users to sign up", así nadie más se puede registrar.
6. Project Settings > API: copiá la **Project URL** y la **anon public key** y pegalas en `js/config.js`.

Con eso la web y el panel ya usan la base de datos real.

### 2. Aviso por mail (Resend)
1. Creá una cuenta en resend.com y generá una API key.
2. Si el dueño no tiene dominio propio, usá como remitente `onboarding@resend.dev`. Con esa opción el mail solo puede llegar al mismo mail con el que creaste la cuenta de Resend, así que creala con el mail del dueño (o verificá un dominio para mandar a cualquiera).

### 3. Aviso por WhatsApp (CallMeBot, opcional)
1. Desde el WhatsApp del dueño, seguí los pasos de callmebot.com para WhatsApp (se le manda un mensaje al bot y responde con una apikey).
2. Es un servicio gratuito y no oficial: puede fallar a veces. Por eso conviene tener también el mail.

### 4. Subir la función de avisos
Con la CLI de Supabase (`npm i -g supabase`):

```bash
supabase login
supabase link --project-ref TU-PROJECT-REF
supabase functions deploy notify-turno --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_xxx AVISO_EMAIL=mail-del-dueno@gmail.com MAIL_FROM="Latinos <onboarding@resend.dev>" CALLMEBOT_PHONE=5492975269763 CALLMEBOT_APIKEY=123456 PANEL_URL=https://TU-USUARIO.github.io/latinos/admin.html WEBHOOK_SECRET=una-palabra-secreta
```

### 5. Conectar el aviso a los turnos
Database > Webhooks > Create a new hook:
- Tabla: `turnos` · Evento: **Insert**
- Tipo: HTTP Request · Método POST
- URL: `https://TU-PROJECT-REF.supabase.co/functions/v1/notify-turno`
- Header: `x-webhook-secret` = la misma palabra secreta del paso 4

Hacé una reserva de prueba y fijate que llegue el mail y el WhatsApp.

## Cómo funciona por dentro
- La web pública solo puede ver servicios, horarios y qué horarios están ocupados. Nunca ve nombres ni teléfonos de otros clientes.
- Los turnos se crean con la función `crear_turno`, que valida el horario de atención, los bloqueos y que no haya otro turno superpuesto. Si dos personas reservan el mismo horario al mismo tiempo, la base de datos deja pasar solo a una.
- Solo los mails cargados en la tabla `admins` pueden ver y editar los turnos desde el panel.
- El panel se actualiza solo cuando entra un turno nuevo.
- Todos los horarios se manejan en hora de Argentina.
