import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const dataStart = html.indexOf("    const polishNames =");
const dataEnd = html.indexOf("    const modes =", dataStart);
const loaderStart = html.indexOf("    function loadSampleBirds()");
const loaderEnd = html.indexOf("    function startMode(", loaderStart);
assert.ok(dataStart !== -1 && dataEnd !== -1 && loaderStart !== -1 && loaderEnd !== -1);

function element(hidden = false) {
  const classes = new Set(hidden ? ["hidden"] : []);
  return {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    }
  };
}

function setup(fetch) {
  const game = vm.createContext({
    URL,
    fetch,
    ebirdProxyUrl: "https://worker.example",
    modeChooser: element(true),
    locationAttribution: element(),
    locationStatus: element(),
    locationSelect: { value: "biebrza", selectedOptions: [{ text: "Biebrza" }] },
    loadLocationButton: element(),
    loadSampleButton: element()
  });
  vm.runInContext(
    html.slice(dataStart, dataEnd) + "let birds = [];\n" + html.slice(loaderStart, loaderEnd),
    game
  );
  return game;
}

test("sample mode loads playable translated birds without contacting eBird", () => {
  const game = setup(() => assert.fail("sample mode must not fetch eBird data"));
  game.loadSampleBirds();
  assert.ok(vm.runInContext("birds.length >= 5", game));
  assert.equal(vm.runInContext("birds.every(bird => bird.en && bird.pl && bird.scientificName)", game), true);
  assert.equal(game.modeChooser.classList.contains("hidden"), false);
  assert.equal(game.locationAttribution.classList.contains("hidden"), true);
  assert.match(game.locationStatus.textContent, /sample birds, not location reports/i);
});

test("switching from sample to real reports disables sample loading until the request finishes", async () => {
  let resolveFetch;
  const game = setup(() => new Promise(resolve => { resolveFetch = resolve; }));
  game.loadSampleBirds();
  const loading = game.loadLocationBirds();
  assert.equal(game.loadSampleButton.disabled, true);
  assert.equal(game.locationAttribution.classList.contains("hidden"), false);
  assert.equal(game.modeChooser.classList.contains("hidden"), true);
  resolveFetch({
    ok: true,
    json: async () => ["House Sparrow", "Great Tit", "Mallard", "Mute Swan", "White Stork"]
      .map(comName => ({ comName, sciName: "Example species" }))
  });
  await loading;
  assert.equal(game.loadSampleButton.disabled, false);
  assert.equal(vm.runInContext("birds.length", game), 5);
  assert.match(game.locationStatus.textContent, /reported near Biebrza/);
});

test("a missing sample translation is reported rather than starting an invalid game", () => {
  const game = setup(() => assert.fail("sample mode must not fetch eBird data"));
  game.loadSampleBirds();
  vm.runInContext('polishNames.delete("House Sparrow")', game);
  game.loadSampleBirds();
  assert.equal(vm.runInContext("birds.length", game), 0);
  assert.equal(game.modeChooser.classList.contains("hidden"), true);
  assert.match(game.locationStatus.textContent, /translation is missing for House Sparrow/);
});
