import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    function stopBirdSound()");
const end = html.indexOf("    async function showBirdPhoto(", start);
assert.ok(start !== -1 && end !== -1);

function element(tagName) {
  return {
    tagName, children: [], events: {}, textContent: "",
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(type, handler) { this.events[type] = handler; },
    setAttribute(name, value) { this[name] = value; },
    pause() { this.paused = true; }
  };
}

function setup(fetch) {
  const context = vm.createContext({
    URL, URLSearchParams, fetch,
    document: { createElement: element, createTextNode: text => ({ textContent: text }) },
    DOMParser: class {
      parseFromString(text) { return { body: { textContent: text.replace(/<[^>]*>/g, "") } }; }
    },
    makeButton(text, className, handler) {
      const button = element("button");
      button.textContent = text;
      button.click = handler;
      return button;
    }
  });
  vm.runInContext("let birdSoundContainer = null, birdSoundAudio = null;\n" + html.slice(start, end), context);
  return context;
}

const bird = { pl: "Kos", soundFile: "Turdus_merula.ogg" };
const recording = {
  query: { pages: { 1: {
    title: "File:Turdus merula.ogg",
    videoinfo: [{
      url: "https://upload.wikimedia.org/example.ogg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.ogg",
      derivatives: [{ type: "audio/mpeg", src: "https://upload.wikimedia.org/example.mp3" }],
      extmetadata: {
        Artist: { value: "<b>Author</b>" },
        LicenseShortName: { value: "CC BY 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" }
      }
    }]
  } } }
};

test("loads the selected recording only on demand with credits and stops on navigation", async () => {
  const requests = [];
  const context = setup(async url => {
    requests.push(new URL(url));
    return { ok: true, json: async () => recording };
  });
  const container = context.createBirdSound(bird);
  assert.equal(requests.length, 0);
  await container.children[0].click();
  assert.equal(requests[0].searchParams.get("titles"), "File:Turdus_merula.ogg");
  const [status, audio, credit] = container.children;
  assert.equal(status.textContent, "Bird sound ready.");
  assert.equal(audio.controls, true);
  assert.equal(audio.preload, "none");
  assert.equal(audio.children[0].type, "audio/mpeg");
  assert.equal(audio.children[1].type, "audio/ogg");
  assert.match(credit.children[1].textContent, /Author/);
  assert.equal(credit.children[2].href, "https://creativecommons.org/licenses/by/4.0/");
  audio.children[1].events.error();
  assert.match(status.textContent, /playback failed/);
  context.stopBirdSound();
  assert.equal(audio.paused, true);
});

test("shows unavailable for birds without a source recording", () => {
  const context = setup(() => assert.fail("must not fetch"));
  const container = context.createBirdSound({ pl: "Unknown" });
  assert.match(container.children[0].textContent, /No bird sound available/);
});

test("allows public-domain recordings without a license URL", async () => {
  const data = structuredClone(recording);
  data.query.pages[1].videoinfo[0].extmetadata = {
    Copyrighted: { value: "False" },
    LicenseShortName: { value: "Public domain" }
  };
  const container = setup(async () => ({ ok: true, json: async () => data })).createBirdSound(bird);
  await container.children[0].click();
  assert.equal(container.children[1].tagName, "audio");
  assert.equal(container.children[2].children[2].textContent, "Public domain");
});

test("rejects missing credits and allows retry after lookup failure", async () => {
  const data = structuredClone(recording);
  delete data.query.pages[1].videoinfo[0].extmetadata.Artist;
  const container = setup(async () => ({ ok: true, json: async () => data })).createBirdSound(bird);
  const button = container.children[0];
  await button.click();
  assert.match(container.children[1].textContent, /credit or license information is missing/);
  assert.equal(button.disabled, false);

  const offline = setup(async () => { throw new Error("offline"); }).createBirdSound(bird);
  await offline.children[0].click();
  assert.match(offline.children[1].textContent, /offline/);
});

test("ignores a lookup that finishes after navigation", async () => {
  let resolve;
  const context = setup(() => new Promise(done => { resolve = done; }));
  const old = context.createBirdSound(bird);
  const loading = old.children[0].click();
  context.stopBirdSound();
  const current = context.createBirdSound({ pl: "Next bird" });
  resolve({ ok: true, json: async () => recording });
  await loading;
  assert.equal(old.children.length, 2);
  assert.match(current.children[0].textContent, /No bird sound/);
});
