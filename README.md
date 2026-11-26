# Bird Words

Bird Words is a static English–Polish bird vocabulary game. All four modes use a built-in list of 475 birds recorded in Poland.

## Playing locally

Open `index.html` in a browser and choose a difficulty. Keep `birds.js` alongside it; no location, eBird connection, API key, or server is needed. Starter photos still require an internet connection.

The catalog in `birds.js` is adapted from [Ptaki Polski](https://pl.wikipedia.org/w/index.php?title=Ptaki_Polski&oldid=80130065) and [List of birds of Poland](https://en.wikipedia.org/w/index.php?title=List_of_birds_of_Poland&oldid=1377457040), by Wikipedia contributors, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The lists were joined by scientific name; renamed species were matched using their species articles, and the urban pigeon uses its parent species' scientific name for photo lookup. The catalog is a static snapshot and does not update automatically.

The legacy eBird Worker files remain in the repository but are no longer used by the game. Existing deployed Workers are not removed automatically.

On a phone, use Connect by tapping a Polish name and then its English translation; dragging is optional.

Next and practice buttons appear inside the game panel on desktop and stay fixed near the bottom of the screen on mobile. **Choose difficulty** sits below the title.

In Starter show, the game looks up a photo by scientific name through Wikipedia and Wikimedia Commons as soon as the bird appears, before revealing the translation. A credit and license link appear with the photo. The photo illustrates the species; if a photo or its credit information is unavailable, the game continues without it.

All modes show an approximate British English IPA guide and a **Listen** button once the English name is available without giving away the answer. The IPA in `birds.js` was generated with eSpeak NG and may not be exact. Audio uses the browser's speech synthesis with a British English voice installed on the device; the game reports when speech or a suitable voice is unavailable.

In Type it in, answers are case-insensitive and the word “Common” may be omitted from the start of an English name. A single missing, extra, substituted, or swapped adjacent character is marked “Almost”; only exact answers, including the accepted shorter names, count as correct. **Show letter** reveals one letter at a time in a separate hint without affecting the score.

In Pick a translation, the other choices preferentially come from the correct bird's family. If there are not enough, other birds fill the remaining choices.

After a multiple-choice, Connect, or typing round with mistakes, **Fix mistakes** starts a new round containing only the missed birds. In Connect, a mismatched Polish name is recorded even if it is later matched correctly; in typing, “Almost” also counts as a mistake. Each practice round has its own score and can be retried again if needed.

After a round, **Keep playing** continues the same difficulty without a limit, drawing from the built-in bird list. Connect continues in groups of five pairs. During continuous play, **Fix mistakes** pauses the current game for a practice round and then resumes it; birds missed again remain available for further practice. **Start over** clears the score and mistakes and begins a new continuous session.

The interface uses the locally bundled [Inter font](https://github.com/rsms/inter), licensed under the [SIL Open Font License](./fonts/Inter-LICENSE.txt).

The background image is stored locally in `assets/background.jpg`.

## Tests

Run the Worker and game tests with `node --test tests/*.test.mjs`. They use Node's built-in test runner and do not require external packages.
