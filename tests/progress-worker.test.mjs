import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../progress-worker.mjs";

const [major, minor] = process.versions.node.split(".").map(Number);
const sqlite = major >= 24 || (major === 23 && minor >= 4) || (major === 22 && minor >= 13)
  ? await import("node:sqlite") : null;
const origin = "https://trycja.github.io";

async function setup() {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(await readFile(new URL("../progress-schema.sql", import.meta.url), "utf8"));
  const binding = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            run() { return db.prepare(sql).run(...params); },
            all() { return { results: db.prepare(sql).all(...params) }; },
            first() { return db.prepare(sql).get(...params) || null; }
          };
        }
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = statements.map(statement => statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
  const env = { ALLOWED_ORIGINS: origin, PROGRESS_DB: binding };
  function call(method, profile, events) {
    const url = new URL("https://worker.example/progress");
    if (method === "GET") url.searchParams.set("profile", profile);
    return worker.fetch(new Request(url, {
      method,
      headers: { Origin: origin, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ profile, events }) } : {})
    }), env);
  }
  return { db, call };
}

function event(id, kind, extra = {}) {
  return { id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, kind, occurredAt: "2026-01-01T00:00:00.000Z", ...extra };
}

test("syncs profiles independently and retries events without double-counting", { skip: !sqlite && "A Node version with built-in SQLite is required" }, async () => {
  const { db, call } = await setup();
  try {
    const events = [
      event(1, "seen", { birdId: "Columba livia" }),
      event(2, "mistake", { birdId: "Columba livia" }),
      event(3, "correct", { birdId: "Columba livia" }),
      event(4, "settings", { settings: { mode: 3, statuses: ["breeding"] } })
    ];
    assert.equal((await call("POST", "  Bird Fan  ", events)).status, 200);
    assert.equal((await call("POST", "bird fan", events)).status, 200);
    assert.equal((await call("POST", "other", [event(5, "seen", { birdId: "Columba livia" })])).status, 200);
    const data = await (await call("GET", "BIRD FAN")).json();
    assert.deepEqual(data.birds, [{ birdId: "Columba livia", seen: 1, correct: 1, mistakes: 1 }]);
    assert.deepEqual(data.settings.value, { mode: 3, statuses: ["breeding"] });
    assert.equal((await (await call("GET", "other")).json()).birds[0].seen, 1);
  } finally {
    db.close();
  }
});

test("rejects invalid batches without saving any events", { skip: !sqlite && "A Node version with built-in SQLite is required" }, async () => {
  const { db, call } = await setup();
  try {
    const good = event(1, "seen", { birdId: "Columba livia" });
    const bad = event(2, "settings", { settings: { mode: 9, statuses: [] } });
    assert.equal((await call("POST", "profile", [good, bad])).status, 400);
    assert.deepEqual((await (await call("GET", "profile")).json()).birds, []);
    assert.equal((await call("POST", " ", [good])).status, 400);
  } finally {
    db.close();
  }
});

test("keeps the newest settings when an older device synchronizes later", { skip: !sqlite && "A Node version with built-in SQLite is required" }, async () => {
  const { db, call } = await setup();
  try {
    const newer = event(1, "settings", { occurredAt: "2026-01-02T00:00:00.000Z", settings: { mode: 3, statuses: ["rare"] } });
    const older = event(2, "settings", { settings: { mode: 1, statuses: [] } });
    assert.equal((await call("POST", "profile", [newer])).status, 200);
    assert.equal((await call("POST", "profile", [older])).status, 200);
    const data = await (await call("GET", "profile")).json();
    assert.deepEqual(data.settings.value, newer.settings);
  } finally {
    db.close();
  }
});
