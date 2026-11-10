# Contributing to git-abv

Thanks for stopping by the bar. Three kinds of help are especially welcome:

1. **Signatures.** A tool signs its commits in a way git-abv misses, or git-abv counts something it should not.
2. **Top-shelf entries.** A well-known repository that belongs in the table.
3. **Translations and styles.** A new language for the report, or a better joke.

Everything runs on plain Node.js (18 or newer) with **zero dependencies**. There is no build step.

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/git-abv
cd git-abv
node --test                 # the whole suite, a couple of seconds
node bin/git-abv.js         # run it on its own history
npm run demo                # build fictional repos under .demo/ and pour one
```

## Adding or fixing a signature

The database lives in [`src/core/signatures.js`](src/core/signatures.js). It is plain data.

**House rules**

1. **Never match a human.** Precision beats recall. `Claude Dupont <claude@example.com>` is a person, and so is anyone whose surname happens to be Cline. If a rule could plausibly match a real contributor, tighten it or leave it out.
2. **Prefer emails and bot logins over display names.** `cursoragent@cursor.com` is a signature. The name "Cursor" on its own is weaker.
3. **Show your source.** Link the tool's docs, its changelog, or a public commit in the pull request.
4. **Add an `eg`.** A real-looking example, so [SIGNATURES.md](SIGNATURES.md) can show what the rule catches.
5. **Add tests on both sides.** One case in `POSITIVE` and, where a human could be confused with the tool, one in `NEGATIVE`, in [`test/classify.test.js`](test/classify.test.js).

**Finding candidates**

```bash
git abv --suspects      # bot-looking identities that are not in the database
git abv --explain       # which signatures matched, how often, and sample commits
```

**A GitHub App agent** is one line:

```js
...ghApp('mytool', 'mytool-agent'),   // matches mytool-agent[bot] and its noreply email
```

**A co-author trailer** is one rule:

```js
{ tool: 'mytool', email: /^agent@mytool\.dev$/i, eg: 'Co-authored-by: MyTool <agent@mytool.dev>' },
```

Add the tool to `TOOLS` (a display name and a colour), then:

```bash
node --test
npm run sync:web          # copies src/core into docs/lib for the web app
npm run signatures:md     # regenerates SIGNATURES.md
```

The test suite fails if either of those two generated copies is stale, so you cannot forget.

## Layout

```
bin/git-abv.js          entry point
src/cli.js              flags, I/O, exit codes
src/git.js              the only file that runs a process (one streaming `git log`)
src/analyze.js          git log -> classify -> aggregate
src/render-terminal.js  the terminal report
src/core/               pure, browser-safe modules shared with the web app
  signatures.js           the database
  classify.js             one commit in, a verdict out
  aggregate.js            a stream of verdicts in, one report out
  excludes.js             which paths count toward volume
  styles.js, i18n.js      the fun part
  card.js, badge.js       SVG renderers
docs/                   the web app (GitHub Pages). docs/lib is a generated copy of src/core.
scripts/                demo data, asset generation, the top-shelf measurement
test/                   node:test suites. They build real git repos with `git fast-import`.
```

`src/core` must stay free of Node APIs: the browser imports it as-is.

## Updating the top shelf

```bash
node scripts/top-shelf.mjs
```

This fetches **commit metadata only** (bare, treeless, shallow clones) for every repository in
[`scripts/top-shelf-repos.txt`](scripts/top-shelf-repos.txt), measures the last twelve months by commits, and
writes `docs/data/top-shelf.json`. It prints the Markdown table for the READMEs. To propose a repository,
add it to the list. Repositories are chosen for being widely known, never for their result.

## Style

- No dependencies. If the standard library cannot do it, we probably do not need it.
- Comments say why, not what.
- Output that people read is part of the product. Sweat the alignment.
- Humour is welcome. Sneering at people or projects is not: a high ABV is not an insult and a low one is not a medal.

## Releasing (maintainers)

1. Bump `version` in `package.json`.
2. `node --test && npm run assets`
3. `npm publish`
4. Tag `vX.Y.Z` and move the major tag (`v0`, `v1`) so the GitHub Action reference stays valid.
