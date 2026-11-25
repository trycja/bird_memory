import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("    async function showBirdPhoto(");
const end = html.indexOf("    function renderShow()", start);
assert.ok(start !== -1 && end !== -1, "Photo function must exist in the game page");
const source = html.slice(start, end);

function element(tagName) {
  return {
    tagName,
    children: [],
    textContent: "",
    isConnected: true,
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener() {}
  };
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
  await show({ en: "House Sparrow", scientificName: "Passer domesticus" }, container);

  assert.equal(requests[0].searchParams.get("titles"), "Passer domesticus");
  assert.equal(requests[1].searchParams.get("titles"), "File:Example.jpg");
  const figure = container.children[0];
  assert.equal(figure.children[0].alt, "Photo of House Sparrow");
  const caption = figure.children[1].children;
  assert.match(caption[1].textContent, /Example author/);
  assert.equal(caption[2].href, "https://creativecommons.org/licenses/by/4.0/");
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
