function createSharedProgress({ birds, onSettings }) {
  const form = document.getElementById("profile-form");
  const nameInput = document.getElementById("profile-name");
  const guestButton = document.getElementById("profile-guest");
  const status = document.getElementById("profile-status");
  const summary = document.getElementById("profile-summary");
  const details = document.getElementById("profile-details");
  const list = document.getElementById("profile-birds");
  const api = document.querySelector('meta[name="bird-progress-api"]').content.trim();
  const names = new Map(birds.map(bird => [bird.id, bird]));
  const modeNames = ["Starter show", "Pick a translation", "Connect", "Type it in"];
  let profile = "";
  let selection = 0;
  let settingsVersion = 0;
  let syncing = null;
  let syncAgain = false;

  function setStatus(text) {
    status.textContent = text;
  }

  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open("bird-words-progress", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("events", { keyPath: "id" });
      request.result.createObjectStore("data");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Local progress database is blocked by another tab."));
  });

  async function transaction(storeName, mode, action) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = action(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Local progress transaction was aborted."));
    });
  }

  async function commitBatch(selected, data, events) {
    const db = await database;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["events", "data"], "readwrite");
      tx.objectStore("data").put(data, `profile:${selected}`);
      for (const event of events) tx.objectStore("events").delete(event.id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Could not store synced progress."));
    });
  }

  function normalizeName(value) {
    const result = value.trim().normalize("NFC").toLowerCase();
    return result.length && result.length <= 40 && !/[\u0000-\u001f\u007f]/.test(result) ? result : "";
  }

  async function snapshot(selected) {
    const cached = await transaction("data", "readonly", store => store.get(`profile:${selected}`));
    const pending = (await transaction("events", "readonly", store => store.getAll()))
      .filter(event => event.profile === selected);
    const stats = new Map((cached?.birds || []).map(item => [item.birdId, { ...item }]));
    let settings = cached?.settings || null;
    for (const event of pending) {
      if (event.kind === "settings") {
        if (!settings || event.occurredAt > settings.occurredAt
          || (event.occurredAt === settings.occurredAt && event.id > settings.id)) {
          settings = { value: event.settings, occurredAt: event.occurredAt, id: event.id };
        }
      } else {
        const row = stats.get(event.birdId) || { birdId: event.birdId, seen: 0, correct: 0, mistakes: 0 };
        if (event.kind === "seen") row.seen++;
        if (event.kind === "correct") row.correct++;
        if (event.kind === "mistake") row.mistakes++;
        stats.set(event.birdId, row);
      }
    }
    return { birds: [...stats.values()], settings, pending: pending.length };
  }

  async function render(selected) {
    if (!selected) {
      summary.textContent = "";
      list.replaceChildren();
      details.hidden = true;
      return null;
    }
    const data = await snapshot(selected);
    if (profile !== selected) return null;
    const total = data.birds.reduce((sum, row) => {
      sum.seen += row.seen;
      sum.correct += row.correct;
      sum.mistakes += row.mistakes;
      return sum;
    }, { seen: 0, correct: 0, mistakes: 0 });
    const lastMode = data.settings ? ` Last difficulty: ${modeNames[data.settings.value.mode]}.` : "";
    summary.textContent = `Profile: ${selected} · Seen: ${total.seen} · Correct: ${total.correct} · Mistakes: ${total.mistakes}.${lastMode}`;
    const rows = data.birds.sort((a, b) => (names.get(a.birdId)?.pl || a.birdId).localeCompare(names.get(b.birdId)?.pl || b.birdId, "pl"));
    list.replaceChildren();
    for (const row of rows) {
      const bird = names.get(row.birdId);
      const item = document.createElement("li");
      item.textContent = `${bird ? `${bird.pl} / ${bird.en}` : row.birdId}: seen ${row.seen}, correct ${row.correct}, mistakes ${row.mistakes}`;
      list.append(item);
    }
    details.hidden = rows.length === 0;
    return data;
  }

  async function request(url, options) {
    const result = await fetch(url, options);
    if (!result.ok) {
      let message = `HTTP ${result.status}`;
      try {
        const body = await result.json();
        if (typeof body.error === "string") message = body.error;
      } catch (error) {
        console.error("Could not read progress service error:", error);
      }
      throw new Error(message);
    }
    return result.json();
  }

  function fetchProfile(selected) {
    const url = new URL(api);
    url.searchParams.set("profile", selected);
    return request(url.href);
  }

  function sync() {
    if (syncing) {
      syncAgain = true;
      return syncing;
    }
    if (!api) {
      if (profile) setStatus("Progress is saved on this device. Configure the progress service to sync.");
      return Promise.resolve();
    }
    syncing = (async () => {
      try {
        do {
          syncAgain = false;
          const pending = await transaction("events", "readonly", store => store.getAll());
          if (pending.length) {
            const selected = pending[0].profile;
            const batch = pending.filter(event => event.profile === selected).slice(0, 100);
            await request(api, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ profile: selected, events: batch })
            });
            const data = await fetchProfile(selected);
            await commitBatch(selected, data, batch);
            syncAgain = true;
            continue;
          }
          const selected = profile;
          if (selected) {
            const data = await fetchProfile(selected);
            await transaction("data", "readwrite", store => store.put(data, `profile:${selected}`));
            if (profile === selected) {
              await render(selected);
              setStatus("Progress synced.");
            }
          }
        } while (syncAgain);
      } catch (error) {
        console.error("Progress sync failed:", error);
        setStatus(`Progress sync failed; locally saved changes will retry: ${error.message}`);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  }

  async function queue(kind, value) {
    const selected = profile;
    if (!selected) return;
    try {
      const event = {
        id: crypto.randomUUID(),
        profile: selected,
        kind,
        occurredAt: new Date().toISOString(),
        ...(kind === "settings" ? { settings: value } : { birdId: value })
      };
      await transaction("events", "readwrite", store => store.add(event));
      if (profile === selected) await render(selected);
      void sync();
    } catch (error) {
      console.error("Could not save progress locally:", error);
      setStatus(`Could not save progress on this device: ${error.message}`);
    }
  }

  async function openProfile(name) {
    const selected = normalizeName(name);
    if (!selected) {
      setStatus("Enter a profile name of 1–40 characters without control characters.");
      return;
    }
    const currentSelection = ++selection;
    const version = settingsVersion;
    profile = selected;
    nameInput.value = selected;
    try {
      await transaction("data", "readwrite", store => store.put(selected, "selected"));
      if (currentSelection !== selection) return;
      const cached = await render(selected);
      if (cached?.settings && settingsVersion === version) onSettings(cached.settings.value);
      await sync();
      if (profile === selected && currentSelection === selection && settingsVersion === version) {
        const updated = await render(selected);
        if (updated?.settings && settingsVersion === version) onSettings(updated.settings.value);
      }
    } catch (error) {
      console.error("Could not open profile:", error);
      setStatus(`Could not open profile: ${error.message}`);
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    void openProfile(nameInput.value);
  });
  guestButton.addEventListener("click", async () => {
    selection++;
    profile = "";
    nameInput.value = "";
    await render("");
    try {
      await transaction("data", "readwrite", store => store.delete("selected"));
      setStatus("Playing as guest. Previously queued changes will still sync.");
      void sync();
    } catch (error) {
      console.error("Could not update profile selection:", error);
      setStatus(`Could not update profile selection: ${error.message}`);
    }
  });
  window.addEventListener("online", () => { void sync(); });
  window.setInterval(() => { void sync(); }, 30000);
  void (async () => {
    try {
      const initialSelection = selection;
      const selected = await transaction("data", "readonly", store => store.get("selected"));
      if (selection !== initialSelection) return;
      if (selected) await openProfile(selected);
      else {
        setStatus("Playing as guest. Open a profile to save progress.");
        await sync();
      }
    } catch (error) {
      console.error("Could not initialize progress:", error);
      setStatus(`Progress storage is unavailable: ${error.message}`);
    }
  })();

  return {
    record(kind, birdId) { void queue(kind, birdId); },
    saveSettings(settings) {
      if (profile) settingsVersion++;
      void queue("settings", settings);
    }
  };
}
