import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    function clearPronunciation()");
const end = html.indexOf("    function startMode(", start);
assert.ok(start !== -1 && end !== -1);

function element() {
  return {
    children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = value; }
  };
}

function setup(speechSynthesis) {
  const pronunciation = element();
  const window = {
    speechSynthesis,
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    }
  };
  const game = vm.createContext({
    window,
    pronunciation,
    document: { createElement: element, createElementNS: element },
    makeButton(text, className, click) {
      return { ...element(), textContent: text, className, click };
    }
  });
  vm.runInContext(html.slice(start, end), game);
  return { game, pronunciation };
}

test("shows the approximate guide and speaks only on demand using a British voice", () => {
  const spoken = [];
  let cancellations = 0;
  const british = { lang: "en-GB" };
  const synth = {
    getVoices: () => [{ lang: "en-US" }, british],
    cancel() { cancellations++; },
    speak(utterance) { spoken.push(utterance); }
  };
  const { game, pronunciation } = setup(synth);
  game.showPronunciation({ en: "Mute swan", pronunciation: "mjˈuːt swˈɒn" });
  const [guide, button, status] = pronunciation.children[0].children;
  assert.match(guide.textContent, /approximate IPA: \/mjˈuːt swˈɒn\//);
  assert.equal(button["aria-label"], "Listen to the English pronunciation of Mute swan");
  assert.equal(button.children.length, 1);
  assert.equal(button.children[0]["aria-hidden"], "true");
  assert.equal(spoken.length, 0);
  button.click();
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, "Mute swan");
  assert.equal(spoken[0].lang, "en-GB");
  assert.equal(spoken[0].voice, british);
  assert.equal(cancellations, 1);
  spoken[0].onerror({ error: "audio-busy" });
  assert.match(status.textContent, /audio-busy/);
});

test("explains unsupported speech or a missing British voice", () => {
  for (const [synth, expected] of [
    [undefined, /not supported/],
    [{ getVoices: () => [{ lang: "en-US" }], cancel() {}, speak() {} }, /No British English voice/],
    [{ getVoices: () => { throw new Error("voice failure"); } }, /voice failure/]
  ]) {
    const { game, pronunciation } = setup(synth);
    game.showPronunciation({ en: "Smew", pronunciation: "smjˈuː" });
    const [, button, status] = pronunciation.children[0].children;
    button.click();
    assert.match(status.textContent, expected);
  }
});
