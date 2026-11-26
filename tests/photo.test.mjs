import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    async function showBirdPhoto(");
const end = html.indexOf("    function renderShow()", start);
assert.ok(start !== -1 && end !== -1, "Photo function must exist in the game page");
const source = html.slice(start, end);
const helperStart = html.indexOf("    function createBirdPhoto(", start);
assert.ok(helperStart !== -1);
const photoHelper = html.slice(helperStart, end);

function element(tagName) {
  const node = {
    tagName,
    children: [],
    textContent: "",
    className: "",
    attributes: {},
    isConnected: true,
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener() {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  };
  node.classList = {
    add(name) { node.className = `${node.className} ${name}`.trim(); },
    remove(name) { node.className = node.className.split(/\s+/).filter(item => item !== name).join(" "); },
    contains(name) { return node.className.split(/\s+/).includes(name); }
  };
  return node;
}

function setup(responses) {
  const requests = [];
  const context = {
    URL,
    URLSearchParams,
    document: {
      createElement: element,
      createTextNode: text => ({ textContent: text })
    },
    DOMParser: class {
      parseFromString(text) {
        return { body: { textContent: text.replace(/<[^>]*>/g, "") } };
      }
    },
    fetch: async url => {
      requests.push(new URL(url));
      const data = responses.shift();
      if (data instanceof Error) throw data;
      return { ok: true, json: async () => data };
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { show: context.showBirdPhoto, requests };
}

const page = { query: { pages: { 1: { pageimage: "Example.jpg" } } } };
const image = {
  query: { pages: { 1: {
    title: "File:Example.jpg",
    imageinfo: [{
      thumburl: "https://upload.wikimedia.org/example.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      extmetadata: {
        Artist: { value: "<b>Example author</b>" },
        LicenseShortName: { value: "CC BY 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" }
      }
    }]
  } } }
};

test("looks up the scientific name and displays the photo with attribution", async () => {
  const { show, requests } = setup([page, image]);
  const container = element("div");
  await show({ en: "House Sparrow", pl: "Wróbel", scientificName: "Passer domesticus" }, container);

  assert.equal(requests[0].searchParams.get("titles"), "Passer domesticus");
  assert.equal(requests[1].searchParams.get("titles"), "File:Example.jpg");
  const figure = container.children[0];
  assert.equal(figure.children[0].alt, "Zdjęcie: Wróbel");
  assert.equal(figure.children[0].lang, "pl");
  const caption = figure.children[1].children;
  assert.match(caption[1].textContent, /Example author/);
  assert.equal(caption[2].href, "https://creativecommons.org/licenses/by/4.0/");
});

test("starts the photo lookup before the English translation is revealed", () => {
  const renderStart = html.indexOf("    function renderShow()");
  const renderEnd = html.indexOf("    function choiceOptions(", renderStart);
  assert.ok(renderStart !== -1 && renderEnd !== -1, "Starter mode must exist in the game page");
  const bird = { en: "House Sparrow", pl: "Wróbel", scientificName: "Passer domesticus" };
  const activity = element("div");
  const controls = element("div");
  const requests = [];
  const guides = [];
  const context = vm.createContext({
    bird,
    activity,
    controls,
    message: element("p"),
    document: { createElement: element },
    showBirdPhoto: (item, container) => requests.push({ item, container }),
    createBirdSound: () => element("div"),
    showPronunciation() { const guide = element("div"); guides.push(guide); return guide; },
    inContinuousPlay: () => false,
    nextQuestion() {},
    makeButton(text, className, handler) {
      const button = element("button");
      button.textContent = text;
      button.click = handler;
      return button;
    }
  });
  vm.runInContext(
    "let round = [bird, bird], index = 0, answered = false, correctCount = 0;\n"
      + photoHelper + html.slice(renderStart, renderEnd),
    context
  );
  context.renderShow();
  assert.equal(activity.children[0].textContent, "Wróbel");
  assert.equal(activity.children[1].textContent, "House Sparrow");
  assert.equal(activity.children[1].classList.contains("reserved-answer"), true);
  assert.equal(activity.children[1].attributes["aria-hidden"], "true");
  assert.equal(guides[0].classList.contains("reserved-answer"), true);
  assert.equal(guides[0].attributes["aria-hidden"], "true");
  assert.equal(activity.children[2].className, "photo-status");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].item, bird);
  assert.equal(requests[0].container, activity.children[2]);
  assert.equal(controls.children.length, 1);

  controls.children[0].click();
  assert.equal(activity.children[1].textContent, "House Sparrow");
  assert.equal(activity.children[1].classList.contains("reserved-answer"), false);
  assert.equal(activity.children[1].attributes["aria-hidden"], undefined);
  assert.equal(guides[0].classList.contains("reserved-answer"), false);
  assert.equal(guides[0].attributes["aria-hidden"], undefined);
  assert.equal(activity.children[2], requests[0].container);
  assert.equal(requests.length, 1);
  assert.equal(controls.children.length, 1);

  vm.runInContext("index = 1; answered = false;", context);
  context.renderShow();
  controls.children[0].click();
  assert.equal(controls.children.length, 1);
  assert.equal(controls.children[0].textContent, "Next bird");
  assert.notEqual(controls.children[0].disabled, true);
});

test("shows the current bird's photo between the Polish name and translation choices", () => {
  const renderStart = html.indexOf("    function renderChoice()");
  const renderEnd = html.indexOf("    function renderConnect()", renderStart);
  assert.ok(renderStart !== -1 && renderEnd !== -1);
  const bird = { en: "House Sparrow", pl: "Wróbel", scientificName: "Passer domesticus" };
  const activity = element("div");
  const requests = [];
  const game = vm.createContext({
    bird,
    activity,
    document: { createElement: element },
    showBirdPhoto: (item, container) => requests.push({ item, container }),
    choiceOptions: () => [bird],
    makeButton: () => element("button")
  });
  vm.runInContext("let round = [bird], index = 0;\n" + photoHelper + html.slice(renderStart, renderEnd), game);
  game.renderChoice();
  assert.equal(activity.children[0].textContent, "Wróbel");
  assert.equal(activity.children[1].className, "photo-status");
  assert.equal(activity.children[2].className, "answers");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].item, bird);
  assert.equal(requests[0].container, activity.children[1]);
});

test("does not display images without license information", async () => {
  const missingLicense = structuredClone(image);
  delete missingLicense.query.pages[1].imageinfo[0].extmetadata.LicenseUrl;
  const { show } = setup([page, missingLicense]);
  const container = element("div");
  await show({ en: "House Sparrow", scientificName: "Passer domesticus" }, container);

  assert.equal(container.children.length, 0);
  assert.match(container.textContent, /Photo unavailable/);
});

test("reports a failed photo lookup without breaking the game", async () => {
  const { show } = setup([new Error("Network error")]);
  const container = element("div");
  await show({ en: "House Sparrow", scientificName: "Passer domesticus" }, container);

  assert.match(container.textContent, /Photo unavailable: Network error/);
});
