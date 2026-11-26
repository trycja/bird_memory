import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../birds.js", import.meta.url), "utf8");
const birds = vm.runInNewContext(source + "\nbirds");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    function filteredBirds()");
const end = html.indexOf("    function updateStatusFilter()", start);
assert.ok(start !== -1 && end !== -1);

test("the source statuses have explicit, valid category mappings", () => {
  const valid = new Set(["breeding", "migrating", "rare", "exceptional", "historical", "captive"]);
  assert.equal(new Set(birds.map(bird => bird.status)).size, 75);
  for (const bird of birds) {
    assert.ok(bird.status && bird.categories.length);
    assert.ok(bird.categories.every(category => valid.has(category)));
  }
  const examples = [
    ["Gęsiówka egipska", "lęgowy sporadycznie, zalatuje rzadko", ["breeding", "rare"]],
    ["Wieszczek", "dawniej lęgowy sporadycznie, zalatuje wyjątkowo", ["exceptional", "historical"]],
    ["Raróg górski", "pochodzący z niewoli", ["captive"]],
    ["Rybitwa różowa", "zalatuje wyjatkowo", ["exceptional"]],
    ["Kulik cienkodzioby", "zalatuje wyjątkowo (wymarły)", ["historical"]]
  ];
  for (const [pl, status, categories] of examples) {
    const bird = birds.find(item => item.pl === pl);
    assert.equal(bird?.status, status);
    assert.deepEqual(Array.from(bird.categories), categories);
  }
});

test("status selection includes any selected category and no selection includes all birds", () => {
  const statusInputs = [
    { value: "breeding", checked: false },
    { value: "rare", checked: false },
    { value: "captive", checked: false }
  ];
  const game = vm.createContext({ birds, statusInputs });
  vm.runInContext(html.slice(start, end), game);
  assert.equal(game.filteredBirds().length, birds.length);
  statusInputs[0].checked = true;
  statusInputs[2].checked = true;
  const result = game.filteredBirds();
  assert.ok(result.some(bird => bird.pl === "Raróg górski"));
  assert.ok(result.every(bird => bird.categories.includes("breeding") || bird.categories.includes("captive")));
  assert.equal(result.length, birds.filter(bird => bird.categories.includes("breeding") || bird.categories.includes("captive")).length);
});
