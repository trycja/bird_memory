const locations = {
  biebrza: { latitude: 53.55, longitude: 22.72, distance: 50 },
  krakow: { latitude: 50.0647, longitude: 19.945, distance: 30 }
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, origin);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/observations") {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    const locationId = url.searchParams.get("location");
    const location = Object.prototype.hasOwnProperty.call(locations, locationId)
      ? locations[locationId]
      : null;
    if (!location) {
      return jsonResponse({ error: "Choose a configured location." }, 400, origin);
    }
    if (!env.EBIRD_API_KEY) {
      return jsonResponse({ error: "The eBird API key is not configured on the Worker." }, 503, origin);
    }

    const observationsUrl = new URL("https://api.ebird.org/v2/data/obs/geo/recent");
    observationsUrl.searchParams.set("lat", String(location.latitude));
    observationsUrl.searchParams.set("lng", String(location.longitude));
    observationsUrl.searchParams.set("dist", String(location.distance));
    observationsUrl.searchParams.set("back", "30");
    observationsUrl.searchParams.set("maxResults", "1000");

    let response;
    try {
      response = await fetch(observationsUrl, {
        headers: { "X-eBirdApiToken": env.EBIRD_API_KEY }
      });
    } catch {
      return jsonResponse({ error: "Could not connect to eBird. Please try again later." }, 502, origin);
    }
    if (!response.ok) {
      return jsonResponse(
        { error: `eBird returned HTTP ${response.status}. Please try again later.` },
        502,
        origin
      );
    }

    return new Response(await response.text(), {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
