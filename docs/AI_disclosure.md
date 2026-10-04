# AI tool disclosure · Hackathon

Team MindRoot used AI tools throughout the build. This page says which work was AI-assisted, which was not, and how
we used the tools.

## Tools

- **Claude (Anthropic), through Claude Code** in VS Code: coding assistant with access to this repository.
- Google Stitch and Figma were used in the Designathon for design exploration (not for this code).

## AI-assisted

- **Code.** Claude wrote most of the code in this repository from the team's instructions: the React web app for all
  roles, the shared domain reducer, the planning engine (`app/src/domain/planner.js`), the API server
  (`server/`), the database schema and seed script, the sync and offline outbox, the Docker setup and the tests.
  The team directed each feature, reviewed the result in the running app, and asked for changes.
- **Analysis.** Claude read the Challenge Booklet and the datasets, summarised the rules and data facts, and
  wrote the peak-day optimisation used for the team's published S1 plan. That plan and the engine's plans are
  checked with the organisers' `check_allocation.py`.
- **Documentation.** Claude drafted this README, `docs/architecture.md`, `docs/data-model.md` and this page; the
  team edited them.
- **Testing help.** Claude wrote automated tests (`server/test/`) and drove headless-browser checks of every screen,
  and it found and fixed bugs (for example: offline records syncing from the wrong device, an over-capacity swap
  in the engine that the organisers' checker caught, the service worker caching API responses).

## Not AI-assisted

- The choice of problems to solve, their order, the scope, and the "fair before full" policy: team discussion.
- The product decisions that shaped the build: one shared account per store and per depot with a name tap, one
  driver per vehicle, the loader's "who is loading?" per truck, the three bad days and how each should end, the
  bottom navigation and phone-first layout for field roles.
- Testing the flows on our own phones and laptops, and the feedback that changed them.
- The WP logo (traced by a team member) and checking the Sinhala and Tamil wording.
- The demo video recording and narration.

## How we used it

AI was a coding, analysis and writing assistant working inside our repository. A team member asked for each change,
checked it in the running app and accepted or corrected it. Every rule in the planning engine is checked against the
booklet and the organisers' checker, and the automated tests (`npm test` in `server/`) run the judge walkthrough
through the real API.
