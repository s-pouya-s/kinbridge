// Builds every app icon from the owner's logo picture (a round tree emblem
// inside a rounded tile, on wine red).
//   node scripts/logo/fromPhoto.mjs assets/logo-source.png [emblem cx cy r]
// Needs @resvg/resvg-js (not an app dependency; install it outside the
// project). It samples the tile color, then writes assets/icon.png, the
// Android adaptive icon parts, splash-icon.png and favicon.png, and prints
// the color to use for app.json and SplashIntro's SPLASH_BACKGROUND.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { extname } from 'path';

const [, , input, cxArg, cyArg, rArg] = process.argv;
const bytes = readFileSync(input);
const mime = extname(input).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const href = `data:${mime};base64,${bytes.toString('base64')}`;
const SRC = 1024; // the picture is drawn at 1024x1024
// Where the round emblem sits in the picture (tuned for the 1024 original).
const cx = Number(cxArg ?? 512), cy = Number(cyArg ?? 508), r = Number(rArg ?? 362);

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render();
const svgOf = (body, size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;

// Tile color: the picture at a spot inside the tile but outside the emblem.
const probe = render(svgOf(`<image href="${href}" width="${SRC}" height="${SRC}"/>`), SRC);
const px = (x, y) => { const i = (y * SRC + x) * 4; return [probe.pixels[i], probe.pixels[i + 1], probe.pixels[i + 2]]; };
const spots = [[200, 160], [820, 160], [200, 870], [820, 870]].map(([x, y]) => px(x, y));
const avg = [0, 1, 2].map((c) => Math.round(spots.reduce((s, p) => s + p[c], 0) / spots.length));
const color = '#' + avg.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

/** The emblem scaled so its radius is `radius`, centered in a 1024 canvas, edge feathered into the background. */
const emblem = (radius) => {
  const s = radius / r;
  return `<defs><radialGradient id="fade"><stop offset="0.93" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="m"><circle cx="512" cy="512" r="${radius * 1.03}" fill="url(#fade)"/></mask></defs>
    <g mask="url(#m)"><image href="${href}" width="${SRC}" height="${SRC}" transform="translate(${512 - cx * s} ${512 - cy * s}) scale(${s})"/></g>`;
};
const bg = `<rect width="1024" height="1024" fill="${color}"/>`;
const out = (name, svg, width = 1024) => writeFileSync(new URL(`../../assets/${name}`, import.meta.url), render(svg, width).asPng());

out('icon.png', svgOf(bg + emblem(430)));
out('favicon.png', svgOf(bg + emblem(470)), 48);
// Adaptive icon: the launcher crops to a circle of about 2/3 of the canvas.
out('android-icon-background.png', svgOf(bg));
out('android-icon-foreground.png', svgOf(emblem(300)));
out('splash-icon.png', svgOf(emblem(500)));
// Monochrome (Android themed icons): the bright copper lines become solid, the dark red clear.
out('android-icon-monochrome.png', svgOf(`<filter id="lines" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 1.4 0.4 0 -0.9"/></filter><g filter="url(#lines)">${emblem(300)}</g>`));
console.log(color);
