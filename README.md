# hexo-adaptive-images

English | [简体中文](README.zh-CN.md)

Serve JPEG XL / WebP (or AVIF) versions of `png` / `jpg` images.

At build time the plugin:

1. Generates `.jxl` / `.webp` files next to each source image and caches them.
2. Rewrites each matching `<img>` in the generated HTML into a `<picture>`:

   ```html
   <picture>
     <source type="image/jxl"  srcset="/images/a.jxl">
     <source type="image/webp" srcset="/images/a.webp">
     <img src="/images/a.png">
   </picture>
   ```

   `<img data-src>` becomes `<source data-srcset>`.

Only depends on npm packages (`sharp`, `@jsquash/jxl`). Requires Node >= 20.9.

## Configuration

All options are in `_config.yml`:

```yaml
adaptive_images:
  enable: true
  dirs: [images]                  # directories under source/ to scan
  extensions: [png, jpg, jpeg]    # source image types to convert
  cache_dir: node_modules/.cache/hexo-adaptive-images
  formats:                        # order is the priority in <picture>
    - { type: jxl,  quality: 80, effort: 4, progressive: true }
    - { type: webp, quality: 82 }
    # - { type: avif, quality: 50, effort: 4 }
```

- `formats[].type`: `jxl`, `webp` or `avif`.
- `progressive` (jxl only, default `true`): encode so the image renders blurry first and sharpens while downloading. Slightly larger files.
- `extensions`: `png`, `jpg`, `jpeg`. GIF is not supported.
