import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    function choiceOptions(");
const end = html.indexOf("    function renderChoice(", start);
assert.ok(start !== -1 && end !== -1);

function createGame(birds) {
  const game = vm.createContext({ birds, shuffle: items => [...items] });
  vm.runInContext(html.slice(start, end), game);
  return game;
}

test("prefers birds from the correct family over unrelated birds", () => {
  const birds = [
    { en: "Blackbird", pl: "Kos", family: "Turdidae" },
    { en: "Sparrow", pl: "Wróbel", family: "Passeridae" },
    { en: "Fieldfare", pl: "Kwiczoł", family: "Turdidae" },
    { en: "Redwing", pl: "Droździk", family: "Turdidae" },
    { en: "Thrush", pl: "Drozd", family: "Turdidae" }
  ];
  const options = createGame(birds).choiceOptions(birds[0]);
  assert.equal(Array.from(options, bird => bird.en).join(","), "Blackbird,Fieldfare,Redwing,Thrush");
});

test("fills missing family choices from other birds without duplicate translations", () => {
  const birds = [
    { en: "Pigeon", pl: "Gołąb", family: "Columbidae" },
    { en: "Pigeon alias", pl: "Gołąb", family: "Columbidae" },
    { en: "Dove", pl: "Sierpówka", family: "Columbidae" },
    { en: "Sparrow", pl: "Wróbel", family: "Passeridae" },
    { en: "Mallard", pl: "Krzyżówka", family: "Anatidae" }
  ];
  const options = createGame(birds).choiceOptions(birds[0]);
  assert.equal(Array.from(options, bird => bird.en).join(","), "Pigeon,Dove,Sparrow,Mallard");
});
