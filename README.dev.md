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
