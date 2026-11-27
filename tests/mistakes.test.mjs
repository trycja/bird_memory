import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

function extract(from, to) {
  const start = html.indexOf(`    function ${from}(`);
  const end = html.indexOf(`    ${to}`, start);
  assert.ok(start !== -1 && end !== -1, `${from} must exist in the game page`);
  return html.slice(start, end);
}

function element() {
  const classes = new Set();
  return {
    children: [],
    attributes: {},
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); }
    },
    get childNodes() { return this.children; },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(type, handler) { this[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function makeButton(text, className, handler) {
  const button = element();
  button.textContent = text;
  button.click = handler;
  return button;
}

function setupRounds() {
  const pronunciation = element();
  const recorded = [];
  const game = vm.createContext({
    modes: ["starter", "choice"],
    modeTitle: element(),
    home: element(),
    homeButton: element(),
    game: element(),
    activity: element(),
    pronunciation,
    controls: element(),
    continuousActions: element(),
    progress: element(),
    message: element(),
    shuffle: items => [...items],
    makeButton,
    saveProgressSettings() {},
    recordProgress(kind, bird) { recorded.push([kind, bird.en]); },
    clearPronunciation() { pronunciation.replaceChildren(); },
    showHome() {},
    renderChoice() {},
    renderShow() {}
  });
  vm.runInContext(
    `let birds = [{ en: "A" }, { en: "B" }, { en: "C" }, { en: "D" }, { en: "E" }];
     let activeBirds = birds;
     function filteredBirds() { return birds; }
     let round = [], mode = 0, index = 0, correctCount = 0, answered = false;
     let selectedSource = null, matched = new Set(), mistakes = new Set();
     let continuous = false, practicing = false, completedBirds = 0, pausedGame = null;
     let birdSoundContainer = null, birdSoundAudio = null;\n`
      + extract("startMode", "async function showBirdPhoto("),
    game
  );
  vm.runInContext(extract("nextQuestion", "function showHome("), game);
  game.recorded = recorded;
  return game;
}

test("records each newly displayed bird as seen", () => {
  const game = setupRounds();
  game.startMode(0);
  vm.runInContext("answered = true", game);
  game.nextQuestion();
  assert.deepEqual(game.recorded, [["seen", "A"], ["seen", "B"]]);
});

test("hides progress only in Starter show, including continuous play", () => {
  const game = setupRounds();
  game.startMode(0);
  assert.equal(game.progress.classList.contains("hidden"), true);
  assert.equal(game.message.classList.contains("hidden"), true);
  vm.runInContext("answered = true; nextQuestion();", game);
  assert.equal(game.progress.classList.contains("hidden"), true);
  game.startMode(1);
  assert.equal(game.progress.classList.contains("hidden"), false);
  assert.equal(game.message.classList.contains("hidden"), false);
  assert.equal(game.progress.textContent, "Bird 1 of 5 · Correct: 0");
});

test("retries only missed birds and clears mistakes for each new round", () => {
  const game = setupRounds();
  game.startMode(1);
  vm.runInContext("mistakes.add(round[1]); mistakes.add(round[3]);", game);
  game.finishRound();
  assert.equal(game.controls.children[0].textContent, "Fix mistakes");

  game.controls.children[0].click();
  assert.equal(vm.runInContext("round.map(bird => bird.en).join(',')", game), "B,D");
  assert.equal(vm.runInContext("mistakes.size", game), 0);
  assert.equal(game.progress.textContent, "Bird 1 of 2 · Correct: 0");

  vm.runInContext("mistakes.add(round[0]);", game);
  game.finishRound();
  game.controls.children[0].click();
  assert.equal(vm.runInContext("round.map(bird => bird.en).join(',')", game), "B");
  game.finishRound();
  assert.equal(game.controls.children.length, 1);
  assert.equal(game.controls.children[0].textContent, "Keep playing");
});

test("clears pronunciation when showing the round completion menu", () => {
  const game = setupRounds();
  game.startMode(1);
  game.pronunciation.append({ textContent: "last bird" });
  game.finishRound();
  assert.equal(game.pronunciation.children.length, 0);
  assert.equal(game.controls.children[0].textContent, "Keep playing");
});

test("continuous play crosses five-bird batches and start over resets the session", () => {
  const game = setupRounds();
  game.startMode(1);
  vm.runInContext("correctCount = 4; mistakes.add(round[1]);", game);
  game.finishRound();
  game.controls.children.find(button => button.textContent === "Keep playing").click();
  assert.equal(game.progress.textContent, "Bird 6 · Correct: 4");
  assert.equal(game.continuousActions.children[0].disabled, false);

  for (let i = 0; i < 7; i++) {
    vm.runInContext("answered = true; correctCount++; nextQuestion();", game);
  }
  assert.equal(game.progress.textContent, "Bird 13 · Correct: 11");
  game.continuousActions.children[1].click();
  assert.equal(game.progress.textContent, "Bird 1 · Correct: 0");
  assert.equal(vm.runInContext("mistakes.size", game), 0);
  assert.equal(game.continuousActions.children[0].disabled, true);
});

test("Starter continues across batches without a completion menu", () => {
  const game = setupRounds();
  game.startMode(0);
  assert.equal(vm.runInContext("inContinuousPlay()", game), true);
  for (let i = 0; i < 13; i++) {
    vm.runInContext("answered = true; nextQuestion();", game);
    assert.equal(game.message.classList.contains("hidden"), true);
    assert.equal(game.controls.children.length, 0);
  }
  assert.equal(game.progress.textContent, "Bird 14 · Correct: 0");
  assert.equal(game.continuousActions.classList.contains("hidden"), true);
  assert.equal(game.continuousActions.children.length, 0);
  game.startMode(1);
  assert.equal(vm.runInContext("inContinuousPlay()", game), false);
  game.finishRound();
  assert.equal(game.controls.children[0].textContent, "Keep playing");
});

test("Starter keeps playing when the filter contains one bird", () => {
  const game = setupRounds();
  vm.runInContext("filteredBirds = () => birds.slice(0, 1);", game);
  game.startMode(0);
  for (let i = 0; i < 3; i++) {
    vm.runInContext("answered = true; nextQuestion();", game);
    assert.equal(vm.runInContext("round.length", game), 1);
    assert.equal(vm.runInContext("round[0].en", game), "A");
    assert.equal(game.message.classList.contains("hidden"), true);
  }
});

test("short filtered rounds remain within the selected birds in continuous play", () => {
  const game = setupRounds();
  vm.runInContext("filteredBirds = () => birds.slice(0, 1);", game);
  game.startMode(1);
  assert.equal(vm.runInContext("round.length", game), 1);
  game.finishRound();
  game.controls.children.find(button => button.textContent === "Keep playing").click();
  assert.equal(vm.runInContext("round.map(bird => bird.en).join(',')", game), "A");
  vm.runInContext("answered = true; nextQuestion();", game);
  assert.equal(vm.runInContext("round.map(bird => bird.en).join(',')", game), "A");
});

test("practice restores the interrupted continuous question and retains repeated mistakes", () => {
  const game = setupRounds();
  game.startMode(1);
  vm.runInContext("mistakes.add(round[1]);", game);
  game.finishRound();
  game.controls.children.find(button => button.textContent === "Keep playing").click();
  const question = { textContent: "unfinished question" };
  const next = { textContent: "Next bird" };
  const pronunciation = { textContent: "previous pronunciation" };
  game.activity.append(question);
  game.controls.append(next);
  game.pronunciation.append(pronunciation);
  vm.runInContext("answered = true; correctCount = 3;", game);
  game.continuousActions.children[0].click();
  assert.equal(vm.runInContext("practicing", game), true);
  assert.equal(vm.runInContext("round.length", game), 1);
  vm.runInContext("mistakes.add(round[0]);", game);
  game.finishRound();
  assert.equal(game.activity.children[0], question);
  assert.equal(game.controls.children[0], next);
  assert.equal(game.pronunciation.children[0], pronunciation);
  assert.equal(vm.runInContext("answered && correctCount === 3", game), true);
  assert.equal(vm.runInContext("mistakes.size", game), 1);
  assert.equal(game.continuousActions.children[0].disabled, false);
  game.continuousActions.children[0].click();
  game.finishRound();
  assert.equal(game.continuousActions.children[0].disabled, true);
});

test("records an incorrect multiple-choice answer", () => {
  const pronounced = [];
  const recorded = [];
  const game = vm.createContext({
    activity: element(),
    controls: element(),
    message: element(),
    document: { createElement: element },
    makeButton,
    shuffle: items => [...items],
    createBirdPhoto: () => element(),
    recordProgress(kind, bird) { recorded.push([kind, bird.en]); },
    showNextButton() {},
    showPronunciation(bird) {
      pronounced.push(bird.en);
      return element();
    },
    updateContinuousActions() {}
  });
  vm.runInContext(
    `let birds = [{ en: "A", pl: "A" }, { en: "B", pl: "B" }, { en: "C", pl: "C" }, { en: "D", pl: "D" }];
     let round = [birds[0]], index = 0, answered = false, correctCount = 0, mistakes = new Set();\n`
      + `function choiceOptions(bird) { return [bird, ...birds.filter(item => item !== bird)]; }\n`
      + extract("renderChoice", "function renderConnect("),
    game
  );
  game.renderChoice();
  assert.equal(pronounced.length, 1);
  game.activity.children[2].children[1].click();
  assert.deepEqual(pronounced, ["A"]);
  assert.equal(game.activity.children[2].children[0].attributes.title, "A");
  assert.equal(game.activity.children[2].children[1].attributes.title, "B");
  assert.equal(vm.runInContext("mistakes.has(round[0])", game), true);
  assert.equal(game.message.classList.contains("correct"), false);
  vm.runInContext("answered = false;", game);
  game.renderChoice();
  game.activity.children[5].children[0].click();
  assert.equal(game.message.classList.contains("correct"), true);
  assert.deepEqual(recorded, [["mistake", "A"], ["correct", "A"]]);
});

test("records the selected Polish bird once when a Connect match is wrong", () => {
  const pronounced = [];
  const recorded = [];
  const game = vm.createContext({
    activity: element(),
    message: element(),
    updateProgress() {},
    finishRound() {},
    recordProgress(kind, bird) { recorded.push([kind, bird.pl]); },
    showPronunciation(bird) { pronounced.push(bird.en); },
    updateContinuousActions() {},
    inContinuousPlay: () => false
  });
  vm.runInContext(
    `let round = [{ pl: "A", en: "A" }, { pl: "B", en: "B" }];
     let matched = new Set(), mistakes = new Set(), selectedSource = null, correctCount = 0;\n`
      + extract("connectPair", "function typingResult("),
    game
  );
  vm.runInContext("connectPair(round[0], round[1]); connectPair(round[0], round[1]);", game);
  assert.equal(vm.runInContext("mistakes.size", game), 1);
  assert.equal(vm.runInContext("mistakes.has(round[0])", game), true);
  assert.deepEqual(pronounced, []);
  vm.runInContext("connectPair(round[0], round[0]);", game);
  assert.equal(vm.runInContext("mistakes.size", game), 1);
  assert.deepEqual(pronounced, ["A"]);
  vm.runInContext("connectPair(round[0], round[0]); connectPair(round[1], round[1]);", game);
  assert.deepEqual(pronounced, ["A", "B"]);
  assert.deepEqual(recorded, [["mistake", "A"], ["mistake", "A"], ["correct", "A"], ["correct", "B"]]);
});

test("completing a continuous Connect group offers the next group", () => {
  let nextGroup = false;
  const game = vm.createContext({
    activity: element(),
    controls: element(),
    message: element(),
    makeButton,
    recordProgress() {},
    showPronunciation() {},
    updateProgress() {},
    updateContinuousActions() {},
    inContinuousPlay: () => true,
    nextConnectGroup() { nextGroup = true; },
    finishRound() { assert.fail("continuous play must not end"); }
  });
  vm.runInContext(
    `let round = [{ pl: "A", en: "A" }, { pl: "B", en: "B" }];
     let matched = new Set(), mistakes = new Set(), selectedSource = null, correctCount = 0;\n`
      + extract("connectPair", "function nextConnectGroup("),
    game
  );
  vm.runInContext("connectPair(round[0], round[0]); connectPair(round[1], round[1]);", game);
  assert.equal(game.controls.children[0].textContent, "Next birds");
  game.controls.children[0].click();
  assert.equal(nextGroup, true);
});
