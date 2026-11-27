import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    function typingResult(");
const end = html.indexOf("    function renderTyping()", start);
assert.ok(start !== -1 && end !== -1, "Typing evaluation must exist in the game page");
const context = vm.createContext({});
vm.runInContext(html.slice(start, end), context);
const { typingResult } = context;

test("accepts lowercase, surrounding whitespace and equivalent Unicode spellings", () => {
  assert.equal(typingResult("  wróbel  ", "Wróbel"), "correct");
  assert.equal(typingResult("z\u0307uraw", "Żuraw"), "correct");
  assert.equal(typingResult("great tit", "Great Tit"), "correct");
});

test("classifies a single missing, extra, substituted or swapped character as almost", () => {
  assert.equal(typingResult("wrobel", "Wróbel"), "almost");
  assert.equal(typingResult("wróbl", "Wróbel"), "almost");
  assert.equal(typingResult("wróbell", "Wróbel"), "almost");
  assert.equal(typingResult("wróebl", "Wróbel"), "almost");
});

test("classifies unrelated, multiple-error and blank answers as wrong", () => {
  assert.equal(typingResult("wrona", "Wróbel"), "wrong");
  assert.equal(typingResult("wrbeol", "Wróbel"), "wrong");
  assert.equal(typingResult("   ", "Wróbel"), "wrong");
});

function setupTypingGame(coarsePointer = false, bird = { en: "Great Tit", pl: "Bogatka" }, random = 0.5) {
  const pronounced = [];
  const recorded = [];
  function element(tagName) {
    return {
      tagName,
      children: [],
      listeners: {},
      classList: { add() {} },
      append(...items) { this.children.push(...items); },
      setAttribute() {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      focus() { this.focused = true; }
    };
  }
  const activity = element("div");
  const math = Object.create(Math);
  math.random = () => random;
  const game = vm.createContext({
    Math: math,
    activity,
    message: element("p"),
    window: { matchMedia: () => ({ matches: coarsePointer }) },
    document: {
      createElement: element,
      createTextNode: text => ({ textContent: text })
    },
    makeButton(text, className, handler) {
      const button = element("button");
      button.textContent = text;
      button.addEventListener("click", handler);
      return button;
    },
    showNextButton() {},
    recordProgress(kind, item) { recorded.push([kind, item.en]); },
    showPronunciation(bird) { pronounced.push(bird.en); },
    updateContinuousActions() {}
  });
  const renderEnd = html.indexOf("    function showNextButton()", end);
  assert.ok(renderEnd !== -1, "Typing render function must exist in the game page");
  vm.runInContext(
    `let round = [${JSON.stringify(bird)}], index = 0, answered = false, correctCount = 0, mistakes = new Set();\n`
      + html.slice(start, renderEnd),
    game
  );
  game.renderTyping();
  return { game, activity, pronounced, recorded };
}

test("does not reveal the English answer's pronunciation before submission", () => {
  const { activity, pronounced } = setupTypingGame();
  assert.equal(pronounced.length, 0);
  activity.children[1].children[0].value = "wrong";
  activity.children[1].listeners.submit({ preventDefault() {} });
  assert.deepEqual(pronounced, ["Great Tit"]);
});

test("shows pronunciation immediately when the English name is the prompt", () => {
  const { pronounced } = setupTypingGame(false, { en: "Great Tit", pl: "Bogatka" }, 0.1);
  assert.deepEqual(pronounced, ["Great Tit"]);
});

test("reveals one letter at a time without changing the answer or score", () => {
  const { game, activity } = setupTypingGame();
  const form = activity.children[1];
  const input = form.children[0];
  const showLetter = form.children[4];
  const hint = activity.children[2];
  input.value = "great tit";
  showLetter.listeners.click();
  assert.equal(hint.textContent, "Hint: G____ ___");
  assert.equal(input.value, "great tit");
  showLetter.listeners.click();
  assert.equal(hint.textContent, "Hint: Gr___ ___");
  for (let i = 0; i < 6; i++) showLetter.listeners.click();
  assert.equal(hint.textContent, "Hint: Great Tit");
  assert.equal(showLetter.disabled, true);

  form.listeners.submit({ preventDefault() {} });
  assert.equal(game.message.textContent, "Correct!");
  assert.equal(vm.runInContext("correctCount", game), 1);
  assert.equal(vm.runInContext("mistakes.size", game), 0);
});

test("accepts English names without Common and still flags typos", () => {
  const bird = { en: "Common Chiffchaff", pl: "Pierwiosnek" };
  for (const [input, expected, score] of [
    ["chiffchaff", "Correct!", 1],
    [" common chiffchaff ", "Correct!", 1],
    ["chiffchaf", "Almost:", 0],
    ["common", "Wrong!", 0]
  ]) {
    const { game, activity } = setupTypingGame(false, bird);
    const form = activity.children[1];
    form.children[0].value = input;
    form.listeners.submit({ preventDefault() {} });
    assert.ok(game.message.textContent.startsWith(expected), input);
    assert.equal(vm.runInContext("correctCount", game), score, input);
    assert.equal(vm.runInContext("mistakes.size", game), score ? 0 : 1, input);
  }
});

test("accepts English names without Eurasian and still flags typos", () => {
  const bird = { en: "Eurasian Curlew", pl: "Kulik wielki" };
  for (const [input, expected, score] of [
    ["curlew", "Correct!", 1],
    [" eurASian curlew ", "Correct!", 1],
    ["curle", "Almost:", 0],
    ["eurasian", "Wrong!", 0]
  ]) {
    const { game, activity } = setupTypingGame(false, bird);
    const form = activity.children[1];
    form.children[0].value = input;
    form.listeners.submit({ preventDefault() {} });
    assert.ok(game.message.textContent.startsWith(expected), input);
    assert.equal(vm.runInContext("correctCount", game), score, input);
    assert.equal(vm.runInContext("mistakes.size", game), score ? 0 : 1, input);
  }
});

test("records an almost answer for mistake practice", () => {
  const { game, activity, recorded } = setupTypingGame();
  const form = activity.children[1];
  form.children[0].value = "great ti";
  form.listeners.submit({ preventDefault() {} });
  assert.match(game.message.textContent, /^Almost:/);
  assert.equal(vm.runInContext("mistakes.size", game), 1);
  assert.deepEqual(recorded, [["mistake", "Great Tit"]]);
});

test("does not automatically focus the typing field on a coarse pointer device", () => {
  const touchGame = setupTypingGame(true);
  const desktopGame = setupTypingGame(false);
  assert.notEqual(touchGame.activity.children[1].children[0].focused, true);
  assert.equal(desktopGame.activity.children[1].children[0].focused, true);
});
