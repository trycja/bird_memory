import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const dataStart = html.indexOf("    const polishNames =");
const dataEnd = html.indexOf("    const modes =", dataStart);
const helperStart = html.indexOf("    function choiceOptions(");
const helperEnd = html.indexOf("    function renderChoice(", helperStart);
assert.ok(dataStart !== -1 && dataEnd !== -1 && helperStart !== -1 && helperEnd !== -1);

function createGame(names) {
  const game = vm.createContext({ shuffle: items => [...items] });
  vm.runInContext(
    html.slice(dataStart, dataEnd)
      + `let birds = ${JSON.stringify(names)}.map(en => ({ en, pl: polishNames.get(en) }));\n`
      + html.slice(helperStart, helperEnd),
    game
  );
  return game;
}

test("prefers observed and catalog birds from the correct family over unrelated birds", () => {
  const game = createGame(["Common Blackbird", "Fieldfare", "House Sparrow", "Mallard", "White Stork"]);
  const options = vm.runInContext("choiceOptions(birds[0]).map(bird => bird.en).join(',')", game);
  assert.equal(options, "Common Blackbird,Fieldfare,Redwing,Song Thrush");
});

test("fills missing family choices from other birds without duplicate species aliases", () => {
  const game = createGame(["Common Wood Pigeon", "Common Wood-Pigeon", "House Sparrow", "Mallard", "White Stork"]);
  const options = vm.runInContext("choiceOptions(birds[0]).map(bird => bird.en).join(',')", game);
  assert.equal(options, "Common Wood Pigeon,Eurasian Collared-Dove,House Sparrow,Mallard");
});

test("all playable names have exactly one family and every family member is playable", () => {
  const game = createGame([]);
  const issue = vm.runInContext(`
    [...polishNames.keys()].find(name => birdFamilies.filter(family => family.includes(name)).length !== 1)
      || birdFamilies.flat().find(name => !polishNames.has(name))
  `, game);
  assert.equal(issue, undefined);
});
