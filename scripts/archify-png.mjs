#!/usr/bin/env node
/**
 * archify-png —— 把 Archify 交付的 HTML 渲染成静态 PNG（README 用）。
 *
 * 为什么需要它：Archify 的 HTML 是自包含可交互成品，但 GitHub README 只能放图片。
 * HTML 里的 inline SVG 依赖页面 <style> 里的 CSS 类与自定义属性（var(--x)），
 * 单独的 SVG 文件在严格 SVG 光栅化器里会丢掉样式。本脚本把每个元素的生效样式
 * 解析成内联 style，再交给 resvg 光栅化，因此在没有可用浏览器（截图）的环境里
 * 也能稳定出图，并且深/浅两套主题可以各出一张。
 *
 * 用法：
 *   node scripts/archify-png.mjs <delivered.html> <out-dir> <base-name> [options]
 *
 * 选项：
 *   --themes dark,light   要渲染的主题（默认 dark,light）
 *   --width <px>          位图宽度，默认 2260
 *   --font <family>       给所有文字指定字体族（例如中文用 "Noto Sans SC"）
 *   --font-file <path>    额外加载的字体文件，可重复；配合 --font 使用
 *   --svg                 同时输出 <base>.<theme>.svg（内联样式后的独立 SVG）
 *   --quiet               不打印每张图的尺寸
 *
 * 依赖（二选一）：
 *   a) 本仓库安装：pnpm add -D @resvg/resvg-js @xmldom/xmldom
 *   b) 临时安装后指定搜索路径：ARCHIFY_PNG_DEPS=<dir>/node_modules node scripts/archify-png.mjs ...
 *
 * 中文提示：系统若没有中文字体，中文会渲染成方块。用 --font "Noto Sans SC"
 * --font-file /path/to/NotoSansSC-Regular.ttf（可再给一个 Bold）即可。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
function loadDep(name) {
  const candidates = [name]
  if (process.env.ARCHIFY_PNG_DEPS) candidates.push(path.join(process.env.ARCHIFY_PNG_DEPS, name))
  for (const candidate of candidates) {
    try { return require(candidate) } catch { /* try next */ }
  }
  console.error('缺少依赖 ' + name + '。先安装：pnpm add -D @resvg/resvg-js @xmldom/xmldom')
  console.error('或用 ARCHIFY_PNG_DEPS 指向已装好的 node_modules 目录再运行。')
  process.exit(1)
}
const { DOMParser, XMLSerializer } = loadDep('@xmldom/xmldom')
const { Resvg } = loadDep('@resvg/resvg-js')

const [htmlPath, outDir, base, ...rest] = process.argv.slice(2)
if (!htmlPath || !outDir || !base) {
  console.error('用法: node scripts/archify-png.mjs <delivered.html> <out-dir> <base-name> [--themes dark,light] [--width 2260] [--font NAME] [--font-file PATH]... [--svg] [--quiet]')
  process.exit(2)
}
const opts = { themes: ['dark', 'light'], width: 2260, font: '', fontFiles: [], svg: false, quiet: false }
for (let i = 0; i < rest.length; i++) {
  const arg = rest[i]
  if (arg === '--themes') opts.themes = String(rest[++i] || '').split(',').filter(Boolean)
  else if (arg === '--width') opts.width = Number(rest[++i])
  else if (arg === '--font') opts.font = String(rest[++i] || '')
  else if (arg === '--font-file') opts.fontFiles.push(String(rest[++i] || ''))
  else if (arg === '--svg') opts.svg = true
  else if (arg === '--quiet') opts.quiet = true
  else { console.error('未知选项: ' + arg); process.exit(2) }
}
if (!Number.isFinite(opts.width) || opts.width <= 0) { console.error('--width 必须是正数'); process.exit(2) }

const html = fs.readFileSync(htmlPath, 'utf8')
const rawSvg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>') + 6)
if (!rawSvg.startsWith('<svg')) { console.error('没在 HTML 里找到 <svg>：' + htmlPath); process.exit(1) }
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')

const declList = (text) => text.split(';').map(s => s.trim()).filter(Boolean).map(s => {
  const k = s.indexOf(':')
  return k < 0 ? null : { name: s.slice(0, k).trim(), value: s.slice(k + 1).trim() }
}).filter(Boolean)

/** 扫描 CSS，展开 @media/@supports/@layer，收集普通规则；@font-face/@keyframes/@page 跳过。 */
function parseRules(text) {
  const rules = []
  let i = 0
  const n = text.length
  function readBlock() {
    let depth = 1
    const start = i
    while (i < n) {
      const ch = text[i]
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { const c = text.slice(start, i); i++; return c } }
      i++
    }
    return text.slice(start)
  }
  function walk() {
    while (i < n) {
      const start = i
      while (i < n && text[i] !== '{' && text[i] !== '}') i++
      if (i >= n) break
      if (text[i] === '}') { i++; continue }
      const prelude = text.slice(start, i).trim()
      if (prelude.startsWith('@')) {
        const at = prelude.split(/[\s(]/)[0].toLowerCase()
        if (at === '@media' || at === '@supports' || at === '@layer' || at === '@container') { i++; walk() }
        else { i++; readBlock() }
      } else {
        i++
        rules.push({ selector: prelude, decls: readBlock() })
      }
    }
  }
  walk()
  return rules
}
const rules = parseRules(css)

/** 取某个主题下生效的自定义属性（:root 兜底 + [data-theme=..] 覆盖），并递归解析 var()。 */
function buildVars(theme) {
  const map = {}
  for (const r of rules) {
    for (const sel of r.selector.split(',')) {
      const s = sel.trim()
      const dark = /\[data-theme=["']?dark["']?\]/.test(s)
      const light = /\[data-theme=["']?light["']?\]/.test(s)
      const root = /:root/.test(s)
      const applies = dark ? theme === 'dark' : light ? theme === 'light' : root
      if (!applies) continue
      for (const d of declList(r.decls)) if (d.name.startsWith('--')) map[d.name] = d.value
    }
  }
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const k of Object.keys(map)) {
      const nv = map[k].replace(/var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]*))?\)/g, (m, name, fb) => map[name] !== undefined ? map[name] : (fb !== undefined ? fb : m))
      if (nv !== map[k]) { map[k] = nv; changed = true }
    }
    if (!changed) break
  }
  return map
}
const resolveVars = (value, vars) => {
  let out = value
  for (let pass = 0; pass < 6; pass++) {
    const nx = out.replace(/var\((--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]*))?\)/g, (m, name, fb) => vars[name] !== undefined ? vars[name] : (fb !== undefined ? fb : m))
    if (nx === out) break
    out = nx
  }
  return out
}

/** class -> 生效声明（跳过其他 preset / 其他主题 / 伪类的规则，后写的覆盖先写的）。 */
function classStyleMap(theme, vars) {
  const byClass = {}
  rules.forEach((r, idx) => {
    for (const sel of r.selector.split(',')) {
      const s = sel.trim()
      if (/:(hover|focus|active|focus-visible|visited)/.test(s)) continue
      const preset = s.match(/data-preset=["']([^"']+)["']/)
      if (preset && preset[1] !== 'classic') continue
      const themeAttr = s.match(/data-theme=["']([^"']+)["']/)
      if (themeAttr && themeAttr[1] !== theme) continue
      const last = s.split(/\s+/).pop() || ''
      const cls = last.match(/\.([a-zA-Z0-9_-]+)/)
      if (!cls) continue
      const out = []
      for (const d of declList(r.decls)) {
        if (d.name.startsWith('--')) continue
        const v = resolveVars(d.value, vars)
        if (/color-mix\(/.test(v)) continue
        out.push(d.name + ': ' + v)
      }
      if (!out.length) continue
      ;(byClass[cls[1]] = byClass[cls[1]] || []).push({ idx, text: out.join('; ') })
    }
  })
  const flat = {}
  for (const cls of Object.keys(byClass)) {
    byClass[cls].sort((a, b) => a.idx - b.idx)
    const merged = new Map()
    for (const entry of byClass[cls]) for (const kv of entry.text.split('; ')) merged.set(kv.split(':')[0], kv)
    flat[cls] = [...merged.values()].join('; ')
  }
  return flat
}

for (const theme of opts.themes) {
  const vars = buildVars(theme)
  const classStyles = classStyleMap(theme, vars)
  const themed = rawSvg.replace(/<svg\b([^>]*)>/, (_m, attrs) => {
    let a = attrs.replace(/\sdata-theme="[^"]*"/, '')
    if (!/xmlns=/.test(a)) a = ' xmlns="http://www.w3.org/2000/svg"' + a
    return '<svg' + a + ' data-theme="' + theme + '">'
  })
  const doc = new DOMParser().parseFromString(themed, 'image/svg+xml')
  const all = doc.getElementsByTagName('*')
  let touched = 0
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    if (!el.getAttribute) continue
    const cls = el.getAttribute('class')
    if (cls) {
      const parts = cls.split(/\s+/).map(c => classStyles[c]).filter(Boolean)
      if (parts.length) {
        const merged = new Map()
        for (const p of parts) for (const kv of p.split('; ')) merged.set(kv.split(':')[0], kv)
        el.setAttribute('style', [...merged.values()].join('; '))
        touched++
      }
    }
    if (opts.font && (el.tagName === 'text' || el.tagName === 'tspan')) {
      const st = el.getAttribute('style')
      el.setAttribute('style', (st ? st + '; ' : '') + 'font-family: ' + opts.font)
    }
  }
  const out = new XMLSerializer().serializeToString(doc)
  if (opts.svg) fs.writeFileSync(path.join(outDir, base + '.' + theme + '.svg'), out)
  const fontOpts = { loadSystemFonts: true }
  if (opts.fontFiles.length) fontOpts.fontFiles = opts.fontFiles
  const resvg = new Resvg(out, {
    fitTo: { mode: 'width', value: opts.width },
    background: theme === 'dark' ? '#020617' : '#ffffff',
    font: fontOpts,
  })
  const png = resvg.render().asPng()
  const pngPath = path.join(outDir, base + '.' + theme + '.png')
  fs.writeFileSync(pngPath, png)
  if (!opts.quiet) console.log(theme + ': ' + pngPath + ' (' + touched + ' styled elements, ' + png.length + ' bytes)')
}
