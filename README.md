# Sachsen-Anhalt election map

A Svelte and D3 visualization of the 2026 Sachsen-Anhalt state election. The
map uses a tile layout for the 41 constituencies and fills each tile with the
second-vote shares for the represented parties.

## Run locally

```sh
npm install
npm run dev
```

The production bundle can be generated with `npm run build` and previewed with
`npm run preview`.

## GitHub Pages

Run `npm run build`, then publish the contents of `dist/` at the Pages path
`e2maps/sachsen_anhalt/`. The source `index.html` redirects GitHub Pages to the
compiled bundle so the browser never loads `src/main.js` directly.
