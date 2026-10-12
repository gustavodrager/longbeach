import fs from 'node:fs/promises'
import path from 'node:path'

// Keep the original Canva pixels intact. SVG only sets the presentation viewport;
// these wrappers are not vector artwork and must not be advertised as such.
const publicDir = path.resolve(import.meta.dirname, '../app/public')
const original = await fs.readFile(path.join(publicDir, 'brand/long-beach-canva.png'))
const image = `<image width="860" height="376" href="data:image/png;base64,${original.toString('base64')}"/>`
const title = '<title>Long Beach Arena</title>'
const svg = (viewBox, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">${title}${body}</svg>\n`
const symbolViewBox = '285 38 310 145'
// Match the source's opaque background only inside the icon; do not redefine UI colors.
const background = '#f0e8da'
const files = {
  'prototype-assets/logo-horizontal.svg': svg('0 0 860 376', image),
  'prototype-assets/logo-symbol.svg': svg(symbolViewBox, image),
  'icons/icon.svg': svg('0 0 512 512', `<rect width="512" height="512" rx="112" fill="${background}"/><svg x="80" y="174" width="352" height="165" viewBox="${symbolViewBox}">${image}</svg>`),
  'icons/icon-maskable.svg': svg('0 0 512 512', `<rect width="512" height="512" fill="${background}"/><svg x="112" y="189" width="288" height="135" viewBox="${symbolViewBox}">${image}</svg>`),
}
await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(path.join(publicDir, name), content)))
console.log(`Generated ${Object.keys(files).length} presentation assets from the unchanged Canva PNG.`)
