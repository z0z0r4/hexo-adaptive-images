"use strict";
// hexo-adaptive-images: generate jxl/webp siblings of png/jpg images and wrap <img> in <picture>.
// See README.md for the configuration.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");

const SUPPORTED_EXT = ["png", "jpg", "jpeg"];
const MIME = { jxl: "image/jxl", webp: "image/webp", avif: "image/avif" };
const DEFAULTS = {
  enable: true,
  dirs: ["images"],
  extensions: SUPPORTED_EXT,
  cache_dir: path.join("node_modules", ".cache", "hexo-adaptive-images"),
  formats: [
    { type: "jxl", quality: 80, effort: 4 },
    { type: "webp", quality: 82 },
  ],
};

const options = Object.assign({}, DEFAULTS, hexo.config.adaptive_images);
if (options.enable === false) return;

const extensions = [...new Set([].concat(options.extensions).map((e) => String(e).toLowerCase().replace(/^\./, "")))];
for (const e of extensions) {
  if (!SUPPORTED_EXT.includes(e)) {
    throw new Error(`hexo-adaptive-images: unsupported extension "${e}" (supported: ${SUPPORTED_EXT.join(", ")})`);
  }
}
if (!extensions.length) return;
const RAW_EXT = new RegExp(`\\.(${extensions.join("|")})$`, "i");

const FORMATS = options.formats.map((f) => {
  if (!MIME[f.type]) throw new Error(`hexo-adaptive-images: unsupported format "${f.type}"`);
  const { type, ...params } = f;
  return {
    ext: type,
    mime: MIME[type],
    params,
    tag: crypto.createHash("sha1").update(JSON.stringify(params)).digest("hex").slice(0, 8),
  };
});
const CACHE_DIR = path.resolve(hexo.base_dir, options.cache_dir);
const log = (level, msg) => hexo.log[level](`adaptive-images: ${msg}`);

const available = new Map(); // "/images/a.png" -> [format, ...]

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
      )
    : [];

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const JXL_WORKER = path.join(__dirname, "lib", "jxl-worker.mjs");

const encoders = {
  // Runs in a child process: Hexo's sandbox has no dynamic import(), which the WASM encoder needs.
  async jxl(file, { quality = 80, effort = 4 }, cacheFile) {
    await execFileAsync(process.execPath, [JXL_WORKER, file, cacheFile, String(quality), String(effort)], { maxBuffer: 1 << 20 });
    return fs.readFileSync(cacheFile);
  },
  webp: (file, { quality = 82 }) => sharp(file).webp({ quality }).toBuffer(),
  avif: (file, { quality = 50, effort = 4 }) => sharp(file).avif({ quality, effort }).toBuffer(),
};

hexo.extend.generator.register("adaptive-images", async function () {
  available.clear();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const routes = [];
  const files = [];
  for (const dir of options.dirs) {
    const root = path.join(this.source_dir, dir);
    for (const file of walk(root).filter((f) => RAW_EXT.test(f))) {
      files.push({ file, rel: "/" + dir + "/" + path.relative(root, file).split(path.sep).join("/") });
    }
  }
  for (const item of files) {
    item.hash = crypto.createHash("sha1").update(fs.readFileSync(item.file)).digest("hex");
  }
  const cachePath = (item, fmt) => path.join(CACHE_DIR, `${item.hash}.${fmt.tag}.${fmt.ext}`);
  const jobs = files.length * FORMATS.length;
  const cached = files.reduce((n, item) => n + FORMATS.filter((fmt) => fs.existsSync(cachePath(item, fmt))).length, 0);
  const names = FORMATS.map((f) => f.ext).join(", ");
  const status =
    cached === 0 ? `encoding to ${names}` : cached === jobs ? `${names}: all cached` : `encoding to ${names} (${cached}/${jobs} cached)`;
  log("info", `found ${files.length} images, ${status}`);
  const startedAt = Date.now();
  let encoded = 0;
  for (const [index, item] of files.entries()) {
    const { file, rel } = item;
    const got = [];
    for (const fmt of FORMATS) {
      const cacheFile = cachePath(item, fmt);
      let buf = fs.existsSync(cacheFile) ? fs.readFileSync(cacheFile) : null;
      if (!buf) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
        log("info", `[${index + 1}/${files.length}] ${fmt.ext} ${rel} (${elapsed}s elapsed)`);
        try {
          buf = await encoders[fmt.ext](file, fmt.params, cacheFile);
          fs.writeFileSync(cacheFile, buf);
          encoded++;
        } catch (e) {
          log("warn", `failed to encode ${fmt.ext} for ${rel}: ${e.message}`);
          continue;
        }
      }
      got.push(fmt);
      routes.push({ path: rel.slice(1).replace(RAW_EXT, "." + fmt.ext), data: buf });
    }
    if (got.length) available.set(rel, got);
  }
  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  log("info", `done, ${available.size}/${files.length} images available, ${encoded} newly encoded, ${total}s`);
  return routes;
});

const IMG_RE = /<img\b[^>]*>/gi;
const ATTR_RE = /\b(src|data-src)=("([^"]*)"|'([^']*)')/i;

hexo.extend.filter.register("after_render:html", (html) => {
  if (!available.size) return html;
  return html
    .split(/(<picture[\s\S]*?<\/picture>)/i)
    .map((part, i) => {
      if (i % 2) return part;
      return part.replace(IMG_RE, (tag) => {
        const m = tag.match(ATTR_RE);
        if (!m) return tag;
        const src = m[3] ?? m[4];
        let key;
        try {
          key = decodeURI(src.split(/[?#]/)[0]);
        } catch {
          return tag;
        }
        const fmts = available.get(key);
        if (!fmts) return tag;
        const attr = m[1].toLowerCase() === "data-src" ? "data-srcset" : "srcset";
        const sources = fmts
          .map((f) => `<source type="${f.mime}" ${attr}="${src.replace(RAW_EXT, "." + f.ext)}">`)
          .join("");
        return `<picture>${sources}${tag}</picture>`;
      });
    })
    .join("");
});
