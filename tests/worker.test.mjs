import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker.mjs";

const origin = "https://trycja.github.io";
const env = {
  ALLOWED_ORIGINS: origin,
  EBIRD_API_KEY: "test-ebird-key"
};

test("proxies only the configured location and keeps the key out of the response", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestHeaders;
  globalThis.fetch = async (input, options) => {
    requestUrl = new URL(input);
    requestHeaders = new Headers(options.headers);
    return new Response('[{"comName":"House Sparrow"}]', {
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const request = new Request("https://worker.example/observations?location=biebrza", {
      headers: { Origin: origin }
    });
    const response = await worker.fetch(request, env);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(requestUrl.pathname, "/v2/data/obs/geo/recent");
    assert.equal(requestUrl.searchParams.get("lat"), "53.55");
    assert.equal(requestUrl.searchParams.get("lng"), "22.72");
    assert.equal(requestUrl.searchParams.get("dist"), "50");
    assert.equal(requestUrl.searchParams.get("back"), "30");
    assert.equal(requestHeaders.get("X-eBirdApiToken"), env.EBIRD_API_KEY);
    assert.doesNotMatch(body, /test-ebird-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unknown locations without calling eBird", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("eBird should not be called");
  };

  try {
    const request = new Request("https://worker.example/observations?location=unknown", {
      headers: { Origin: origin }
    });
    const response = await worker.fetch(request, env);

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /configured location/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports a missing API key without calling eBird", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("eBird should not be called");
  };

  try {
    const request = new Request("https://worker.example/observations?location=krakow", {
      headers: { Origin: origin }
    });
    const response = await worker.fetch(request, { ALLOWED_ORIGINS: origin });

    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /API key is not configured/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects requests from origins not configured for the Pages site", async () => {
  const request = new Request("https://worker.example/observations?location=krakow", {
    headers: { Origin: "https://attacker.example" }
  });
  const response = await worker.fetch(request, env);

  assert.equal(response.status, 403);
});

test("reports upstream eBird failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });

  try {
    const request = new Request("https://worker.example/observations?location=krakow", {
      headers: { Origin: origin }
    });
    const response = await worker.fetch(request, env);

    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /HTTP 429/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
