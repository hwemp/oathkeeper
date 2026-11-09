# Oathkeeper project instructions

## Working with the owner

The project owner has no technical background. Explain progress, decisions, and
questions in plain language. Describe what a choice means for someone using the
app, and offer a recommended option when asking about a tradeoff. Do not ask the
owner questions that can be answered by inspecting the repository.

The requirements below describe the intended product, not features already
implemented. Keep documentation honest about what currently works.

## Agreed product requirements

Oathkeeper is an online Dungeons & Dragons character tracker and community app.

- Start with **D&D fifth edition's 2014 rules** and the 2014 Player's Handbook
  character options. This replaces the earlier preference for 2024 rules.
- Provide guided character creation, leveling, and editing. Changes to a
  character value must automatically update affected values for supported rules.
- Allow manual entries and adjustments for options from books that are not yet
  supported. Clearly distinguish manual values from automated calculations.
- Let users download character save files and upload them to restore or move
  characters. Also support importing PDF character sheets, with a review step
  before saving the imported character.
- Provide accounts and online character storage.
- Provide both a public community and private gaming groups, with discussion
  posts, comments, and live chat.
- Support uploads of images, PDFs, and videos.
- Expand coverage of official books, third-party books, and community-created
  material in stages. All-book coverage is a long-term goal, not a launch promise.
- Support both character calculations and relevant rules descriptions in the
  app. Establish permission to include content from each source before adding
  it; do not assume that owning a book permits redistributing its text.

Character tracking and community features are both part of the intended first
release. Develop them in manageable steps without silently reducing that scope.

## Implementation guidance

- Build on the existing project structure and conventions.
- Keep character calculations separate from screen presentation. Test that
  editing a source value updates its dependent values correctly.
- Preserve manual entries and adjustments during recalculation. Make their
  effect on calculated results understandable to users.
- Identify which rules and book options have automated support. Do not silently
  treat unsupported options as fully automated.
- Let users inspect and correct PDF import results before saving. Do not assume
  every PDF layout can be read reliably.
- Verify that downloading and restoring a character preserves its data,
  including manual entries and adjustments.
- Ask about unresolved product choices before implementing features that depend
  on them: character visibility, group permissions, moderation, upload limits,
  and hosting budget. Record decisions as they are made.
- Select tests appropriate to each change. For character rules, cover dependent
  calculations and interactions with manual adjustments. For community and
  storage features, verify the agreed access permissions and failure behavior.

## Repository and development commands

This repository uses npm workspaces and Turborepo, with Node.js 24+ and npm 11.

- `apps/frontend`: React Router, React, Tailwind CSS, and Vite.
- `apps/backend`: Express API and production frontend server, using MongoDB.
- `README.md`: development, database, and deployment setup instructions.

Run commands from the repository root:

```bash
npm ci                         # Install dependencies
docker compose up -d mongo     # Start the local database
npm run dev                    # Start development servers
npm test                       # Run character calculation and save-file tests
npm run typecheck              # Check TypeScript types
npm run build                  # Build both applications
npm start                      # Run the built application; requires MongoDB
```

Character calculation and save-file tests run with Node's built-in test runner.
Add focused tests as features require them, and document how to run them. Keep these instructions
and the README aligned with changes to setup or verification commands.

For documentation-only changes, review the content and run `git diff --check`.
For application changes, run relevant tests, type checks, and build checks as
appropriate, and report any checks that could not be completed.
