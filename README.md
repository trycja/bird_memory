# Bird Words

Bird Words is a static English–Polish bird vocabulary game. It loads recent eBird observations for a player-selected location and uses the supported species in all four game modes.

## eBird and GitHub Pages setup

GitHub Pages only serves static files, so the eBird API key must stay in a Cloudflare Worker secret rather than in `index.html` or this repository.

1. Create a Cloudflare account and install or run Wrangler with Node.js available.
2. Set `ALLOWED_ORIGINS` in `wrangler.jsonc` to the origin of the GitHub Pages site, for example `https://trycja.github.io`. If you use a custom domain, use that domain instead.
3. From the repository directory, run `npx wrangler login` and `npx wrangler deploy` to create the Worker.
4. Add the eBird API key as a Worker secret with `npx wrangler secret put EBIRD_API_KEY`. Paste the key only into Wrangler's secure prompt, not into source code or chat.
5. Run `npx wrangler deploy` again to publish the Worker with its secret.
6. In `index.html`, set `ebirdProxyUrl` to the Worker URL printed by Wrangler, such as `https://bird-words-ebird-proxy.<your-subdomain>.workers.dev`.
7. Publish the updated static site to GitHub Pages and select a location, then press **Load birds**.

The Worker permits requests only from the configured browser origin, exposes only the two configured location IDs, and sends the API key to eBird in a request header. The origin check is a browser CORS restriction, not authentication; if the public Worker receives unwanted traffic, configure Cloudflare rate limiting for it.

The location centers and search radii are configured in `worker.mjs`: Biebrzański Park Narodowy uses a 50 km radius and Kraków uses a 30 km radius. Update these coordinates and the matching location choices in `index.html` if you want to add or change places.

The page uses recent reports from the previous 30 days and currently includes Polish translations for a curated set of common species. Species without a translation are not offered in the game; add their English common name and Polish name to the `polishNames` map in `index.html`. The selected location needs at least five supported species in recent reports to start a round.

In Starter show, the game looks up a photo by scientific name through Wikipedia and Wikimedia Commons after revealing the translation. A credit and license link appear with the photo. The photo illustrates the species and is not necessarily from the selected location; if a photo or its credit information is unavailable, the game continues without it.

## Tests

Run the Worker and photo lookup tests with `node --test tests/*.test.mjs`. They use Node's built-in test runner and do not require external packages.
