import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../birds.js", import.meta.url), "utf8");
const birds = vm.runInNewContext(source + "\nbirds");

test("the complete catalog has unique bilingual names, scientific names and families", () => {
  assert.equal(birds.length, 475);
  for (const field of ["id", "en", "pl", "scientificName", "family", "pronunciation"]) {
    assert.ok(birds.every(bird => typeof bird[field] === "string" && bird[field].trim()));
  }
  for (const field of ["id", "en", "pl", "scientificName"]) {
    assert.equal(new Set(birds.map(bird => bird[field].toLocaleLowerCase())).size, birds.length);
  }
});

test("species with different scientific classifications have the correct English names", () => {
  const expected = [
    ["Mergellus albellus", "Bielaczek", "Smew"],
    ["Microcarbo pygmaeus", "Kormoran mały", "Pygmy cormorant"],
    ["Anthus japonicus", "Świergotek syberyjski", "Siberian pipit"],
    ["Columba livia", "Gołąb miejski", "Feral pigeon"]
  ];
  for (const [scientificName, pl, en] of expected) {
    const bird = birds.find(item => item.scientificName === scientificName);
    assert.equal(bird?.pl, pl);
    assert.equal(bird?.en, en);
  }
});
