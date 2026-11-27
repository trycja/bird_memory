const categories = new Set(["breeding", "migrating", "rare", "exceptional", "historical", "captive"]);

function response(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

function normalizeProfile(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().normalize("NFC").toLowerCase();
  return name.length >= 1 && name.length <= 40 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}

function validEvent(event) {
  if (!event || typeof event !== "object"
    || typeof event.id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id)
    || typeof event.occurredAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.occurredAt)
    || !Number.isFinite(Date.parse(event.occurredAt))) return false;
  if (event.kind === "settings") {
    const settings = event.settings;
    return settings && Number.isInteger(settings.mode) && settings.mode >= 0 && settings.mode <= 3
      && Array.isArray(settings.statuses) && settings.statuses.length <= categories.size
      && settings.statuses.every(status => categories.has(status))
      && new Set(settings.statuses).size === settings.statuses.length;
  }
  return ["seen", "correct", "mistake"].includes(event.kind)
    && typeof event.birdId === "string" && event.birdId.length > 0 && event.birdId.length <= 120;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map(item => item.trim());
    if (!origin || !allowedOrigins.includes(origin)) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return response(null, 200, origin);
    if (new URL(request.url).pathname !== "/progress") return response({ error: "Not found." }, 404, origin);
    if (!["GET", "POST"].includes(request.method)) return response({ error: "Method not allowed." }, 405, origin);
    if (!env.PROGRESS_DB) return response({ error: "Progress database is not configured." }, 503, origin);

    try {
      if (request.method === "GET") {
        const profile = normalizeProfile(new URL(request.url).searchParams.get("profile"));
        if (!profile) return response({ error: "Enter a profile name of 1–40 characters." }, 400, origin);
        const stats = await env.PROGRESS_DB.prepare(
          "SELECT bird_id AS birdId, SUM(kind = 'seen') AS seen, SUM(kind = 'correct') AS correct, SUM(kind = 'mistake') AS mistakes FROM progress_events WHERE profile = ? AND bird_id IS NOT NULL GROUP BY bird_id"
        ).bind(profile).all();
        const latest = await env.PROGRESS_DB.prepare(
          "SELECT settings, occurred_at AS occurredAt, id FROM progress_events WHERE profile = ? AND kind = 'settings' ORDER BY occurred_at DESC, id DESC LIMIT 1"
        ).bind(profile).first();
        return response({
          birds: stats.results,
          settings: latest ? { value: JSON.parse(latest.settings), occurredAt: latest.occurredAt, id: latest.id } : null
        }, 200, origin);
      }

      const bodyText = await request.text();
      if (bodyText.length > 65536) return response({ error: "Request is too large." }, 413, origin);
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return response({ error: "Invalid JSON." }, 400, origin);
      }
      const profile = normalizeProfile(body && body.profile);
      if (!profile || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 100
        || !body.events.every(validEvent)) return response({ error: "Invalid profile or progress events." }, 400, origin);
      const statement = "INSERT OR IGNORE INTO progress_events (id, profile, kind, bird_id, occurred_at, settings) VALUES (?, ?, ?, ?, ?, ?)";
      await env.PROGRESS_DB.batch(body.events.map(event => env.PROGRESS_DB.prepare(statement).bind(
        event.id, profile, event.kind, event.kind === "settings" ? null : event.birdId,
        event.occurredAt, event.kind === "settings" ? JSON.stringify(event.settings) : null
      )));
      return response({ saved: body.events.length }, 200, origin);
    } catch (error) {
      console.error("Progress service error:", error);
      return response({ error: "Could not access progress. Please try again." }, 500, origin);
    }
  }
};
