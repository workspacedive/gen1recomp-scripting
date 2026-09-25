# release/

`RecompDeck.scripting` is the installable package of `scripting/RecompDeck`
(a ZIP with the project folder at the top level — the format the Scripting app
imports). It is committed so that the one-tap import link in the README can
point at a plain file URL.

- Rebuild after any change under `scripting/RecompDeck`: `npm run release`
- Packaging is reproducible (sorted entries, fixed timestamps), so
  `npm run check` (`check:release`) fails if this file is stale.
- The `.sha256` file holds the SHA-256 of the package.
