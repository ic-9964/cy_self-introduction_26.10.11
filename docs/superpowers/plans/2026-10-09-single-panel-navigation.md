# Single-panel navigation implementation plan

**Goal:** Show the personal introduction by default, and show exactly one corresponding glass panel whenever a navigation link is activated.

**Architecture:** Keep the existing section content and hash links. Replace scroll-driven navigation in `app.js` with one hash-based controller that sets the native `hidden` property, updates the active navigation link, and handles browser history. Keep the existing coastal depth effect and portfolio filtering.

**Tech stack:** Static HTML, CSS, browser JavaScript; Playwright for interaction verification.

- [x] Add `tools/check-navigation.mjs` and run against the current service. The initial visible-section count must fail because all seven sections are visible.
- [x] Update `index.html`: mark the six secondary sections hidden initially, label/focus-enable the main region, add a no-JavaScript content fallback, and remove the redundant footer panel.
- [x] Replace `app.js`: resolve section hashes, intercept unmodified local navigation clicks, push history for changed sections, synchronize on history/hash changes, focus the newly displayed content, and scroll to its top. Invalid section hashes fall back to the introduction. Returning to the top must keep the current section and URL.
- [x] Update `coastal.css`: fill the viewport with scenery, keep one glass panel in the main region, animate only the active panel when reduced motion is disabled, and remove unused footer layout overrides.
- [x] Run the navigation check through all seven sections, history, reload/direct links, scroll, portfolio filtering/sorting, keyboard interaction, invalid hashes, and mobile widths. Run the existing static page check and JavaScript syntax checks. Inspect desktop and mobile screenshots.

The regression command is `node tools/check-navigation.mjs`. It accepts `PLAYWRIGHT_MODULE` for an existing Playwright installation, `BROWSER_CHANNEL` for the installed browser, and `CHECK_PAGE_URL` for the running local site; no application dependencies are added.

