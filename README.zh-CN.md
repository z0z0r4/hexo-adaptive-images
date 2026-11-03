# hexo-adaptive-images

[English](README.md) | 简体中文

为 `png` / `jpg` 图片提供 JPEG XL / WebP（或 AVIF）版本。

构建时，插件会：

1. 在每张源图片旁边生成 `.jxl` / `.webp` 文件并缓存。
2. 把生成的 HTML 里匹配的 `<img>` 改写成 `<picture>`：

   ```html
   <picture>
     <source type="image/jxl"  srcset="/images/a.jxl">
     <source type="image/webp" srcset="/images/a.webp">
     <img src="/images/a.png">
   </picture>
   ```

   `<img data-src>` 会变成 `<source data-srcset>`。

只依赖 npm 包（`sharp`、`@jsquash/jxl`），需要 Node >= 20.9。

## 配置

所有选项在 `_config.yml`：

```yaml
adaptive_images:
  enable: true
  dirs: [images]                  # 要扫描的目录，相对 source/
  extensions: [png, jpg, jpeg]    # 要转换的源图片类型
  cache_dir: node_modules/.cache/hexo-adaptive-images
  formats:                        # 顺序即 <picture> 里的优先级
    - { type: jxl,  quality: 80, effort: 4, progressive: true }
    - { type: webp, quality: 82 }
    # - { type: avif, quality: 50, effort: 4 }
```

- `formats[].type`：`jxl`、`webp` 或 `avif`。
- `progressive`（仅 jxl，默认 `true`）：渐进式编码，下载过程中先显示模糊的整图再逐步变清晰，文件会稍大。
- `extensions`：`png`、`jpg`、`jpeg`。不支持 GIF。