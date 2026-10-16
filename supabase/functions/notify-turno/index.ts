// Edge Function: avisa al dueño cada vez que entra un turno nuevo.
// Se dispara con un Database Webhook (tabla turnos, evento INSERT).
// Secrets necesarios (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY   -> clave de resend.com (para el mail)
//   AVISO_EMAIL      -> mail donde llega el aviso (ej: el del dueño)
//   MAIL_FROM        -> remitente verificado en Resend (ej: "Latinos <turnos@tudominio.com>"); sin dominio propio usar "onboarding@resend.dev"
//   CALLMEBOT_PHONE  -> número de WhatsApp del dueño con código país, ej: 5492975269763 (opcional)
//   CALLMEBOT_APIKEY -> la clave que te da CallMeBot por WhatsApp (opcional)
//   PANEL_URL        -> link al panel, ej: https://usuario.github.io/latinos/admin.html (opcional)
//   WEBHOOK_SECRET   -> una palabra secreta; se pone igual en el header del webhook (x-webhook-secret)

const ZONA = "America/Argentina/Buenos_Aires";
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const plata = (n: number) => "$" + Number(n || 0).toLocaleString("es-AR");
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return new Response("no autorizado", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const t = body?.record;
  if (!t || body?.type !== "INSERT") return new Response("ignorado", { status: 200 });

  const panel = Deno.env.get("PANEL_URL") ?? "";
  const texto =
    `Nuevo turno en Latinos\n` +
    `${t.cliente_nombre} · ${t.servicio_nombre} (${plata(t.precio)})\n` +
    `${fecha(t.inicio)} a las ${hora(t.inicio)} h\n` +
    `Tel: ${t.cliente_tel}` +
    (t.nota ? `\nNota: ${t.nota}` : "") +
    (panel ? `\nVer en el panel: ${panel}` : "");

  const resultados: Record<string, string> = {};

  // ---- Mail con Resend ----
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("AVISO_EMAIL");
  if (resendKey && to) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px">
        <h2 style="margin:0 0 12px">Nuevo turno</h2>
        <p style="margin:0 0 6px"><b>${esc(t.cliente_nombre)}</b> · ${esc(t.servicio_nombre)} (${plata(t.precio)})</p>
        <p style="margin:0 0 6px">${esc(fecha(t.inicio))} a las <b>${hora(t.inicio)} h</b></p>
        <p style="margin:0 0 6px">Tel: ${esc(t.cliente_tel)}</p>
        ${t.nota ? `<p style="margin:0 0 6px">Nota: ${esc(t.nota)}</p>` : ""}
        ${panel ? `<p style="margin:16px 0 0"><a href="${panel}">Abrir el panel</a></p>` : ""}
      </div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("MAIL_FROM") ?? "Latinos <onboarding@resend.dev>",
        to: [to],
        subject: `Nuevo turno: ${t.cliente_nombre} · ${fecha(t.inicio)} ${hora(t.inicio)}`,
        html,
        text: texto,
      }),
    });
    resultados.mail = r.ok ? "ok" : `error ${r.status}`;
  }

  // ---- WhatsApp con CallMeBot (al número del dueño) ----
  const phone = Deno.env.get("CALLMEBOT_PHONE");
  const apikey = Deno.env.get("CALLMEBOT_APIKEY");
  if (phone && apikey) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(apikey)}`;
    const r = await fetch(url);
    resultados.whatsapp = r.ok ? "ok" : `error ${r.status}`;
  }

  return new Response(JSON.stringify(resultados), { headers: { "Content-Type": "application/json" } });
});
