# Function of Babel

Interactive playground for [Tupper's self-referential formula](https://en.wikipedia.org/wiki/Tupper%27s_self-referential_formula) — draw 106×17 patterns, encode them to a `y` coordinate, and scroll through infinite possibilities.

Inspired by [libraryofbabel.info](https://libraryofbabel.info/): same vibe of infinite shelves and finite rules, except here you scroll through `y` instead of hexagonal galleries.

## What it does

Tupper's formula is a deceptively small equation that encodes every possible 106×17 bitmap. Given an `x` and `y`, it tells you whether a pixel should be on or off. Function of Babel lets you interact with that idea instead of just reading about it on Wikipedia.

- **Draw** — Paint patterns on a 106×17 grid. Hold <kbd>Shift</kbd> to erase.
- **Encode** — Your drawing is converted to the `y` value that reproduces it.
- **Explore** — Scroll the chart vertically to see what the formula renders at other coordinates.
- **Verify** — The chart highlights the band that matches your current `y`, so you can confirm the encoding is right.

## Demo

Live at [josepdecid.github.io/function-of-babel](https://josepdecid.github.io/function-of-babel/).

## Static at heart

There is no backend here — just HTML, CSS, and JavaScript running in the browser. After a build, you can open `dist/index.html` and play with it directly, or host the `dist/` folder anywhere static files go.

The Rsbuild + Bun setup is only for development: hot reloading, bundling the CSS import in `index.js`, and a smoother workflow while you edit. You do not need a server to use the app itself.

## Getting started

For local development, use [Bun](https://bun.sh/) 1.3.9 (see `packageManager` in `package.json`):

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

To produce the static files:

```bash
bun run build
```

Then open `dist/index.html` in your browser, or run `bun run preview` to serve the build locally.

## Tech stack

- Vanilla JavaScript with Canvas 2D
- [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) for arbitrary-precision `y` values
- MathML for the formula display
- [Rsbuild](https://rsbuild.dev/) + [Bun](https://bun.sh/) for dev server, bundling, and hot reload
- [Biome](https://biomejs.dev/) for formatting

## Project structure

```folder-structure
index.html      Page layout and copy
index.js        Grid editor, encoding/decoding, chart rendering
styles.css      Layout and theme
public/         Favicons and web manifest
rsbuild.config.mjs
```

## License

Licensed under the [MIT License](LICENSE).
