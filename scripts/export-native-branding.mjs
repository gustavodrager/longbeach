import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const require = createRequire(import.meta.url)
const sharp = require(process.env.LONG_BEACH_SHARP_PATH || 'sharp')
const repo = path.resolve(import.meta.dirname, '..')
const publicAssets = path.join(repo, 'app/public/prototype-assets')
const symbol = await fs.readFile(path.join(publicAssets, 'logo-symbol.svg'), 'utf8')
const horizontal = await fs.readFile(path.join(publicAssets, 'logo-horizontal.svg'), 'utf8')
// Opaque background of the original Canva PNG, kept within the exported artwork.
const sand = '#F0E8DA'
async function files(dir) { const entries = await fs.readdir(dir, { withFileTypes: true }); const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name))); return nested.flat() }
async function render(filename, kind) {
  const metadata = await sharp(filename).metadata()
  const width = metadata.width, height = metadata.height
  if (!width || !height) throw new Error('Missing dimensions: '+filename)
  const isSplash = kind === 'splash'
  const ratio = isSplash ? (filename.includes('/ios/') ? Math.min(width, height) * .28 : Math.min(width * .55, Math.min(width, height) * .72)) : width * (kind === 'foreground' ? .56 : .60)
  const source = isSplash ? horizontal : symbol
  const artwork = await sharp(Buffer.from(source)).resize({ width: Math.round(ratio) }).png().toBuffer()
  const artMeta = await sharp(artwork).metadata()
  const background = kind === 'foreground' ? { r: 0, g: 0, b: 0, alpha: 0 } : sand
  let output = sharp({ create: { width, height, channels: 4, background } }).composite([{ input: artwork, left: Math.round((width-artMeta.width)/2), top: Math.round((height-artMeta.height)/2) }])
  if (kind !== 'foreground') output = output.removeAlpha()
  await output.png().toFile(filename+'.new')
  await fs.rename(filename+'.new', filename)
  return { file: path.relative(repo, filename), width, height }
}
const targets = [...await files(path.join(repo, 'app/android/app/src/main/res')), ...await files(path.join(repo, 'app/ios/App/App/Assets.xcassets'))].filter(file => file.endsWith('.png') && /(?:splash|AppIcon|ic_launcher)/.test(file))
const results = []
for (const file of targets) results.push(await render(file, file.includes('splash') ? 'splash' : file.includes('foreground') ? 'foreground' : 'icon'))
console.log(JSON.stringify({ rendered: results.length, assets: results }, null, 2))
