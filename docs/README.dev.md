# WiKarte Developer Notes

## Installation (developer mode)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

---

## Versioning

WiKarte uses semantic versioning across both `package.json` and `manifest.json`.

- Default commit behaviour: `minor` bump
- Optional one-time override: `patch` or `major`

After enabling the repo hooks:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

Normal commit flow:

```bash
git commit -m "Your message"
```

That bumps the version automatically as `minor`.

For a one-time `patch` bump on the next commit:

```bash
npm run version:next:patch
git commit -m "Your message"
```

For a one-time `major` bump on the next commit:

```bash
npm run version:next:major
git commit -m "Your message"
```

You can also bump manually without committing:

```bash
npm run version:minor
npm run version:patch
npm run version:major
```

## Release tags

Version bumps and release tags are intentionally separate.

- Normal commits keep updating `package.json` and `manifest.json`
- A Git tag is created only when you explicitly decide to cut a release

Create an annotated release tag from the current version:

```bash
npm run release:tag
```

That creates a tag like `v1.12.0` from the current `package.json` version.

Guardrails:

- the worktree must be clean
- the current branch must be `main`
- the tag must not already exist

After the tag is created, push it manually:

```bash
git push origin v1.12.0
```

This workflow does not create a GitHub Release automatically. It only creates the Git tag so you can decide later if and when to publish a GitHub release from it.

## Web Store package output

Build the Chrome Web Store package with:

```bash
npm run build:webstore
```

This produces:

- `dist/wikarte-webstore.zip`
- `dist/wikarte-webstore-v<version>.zip`
