# TG-Matrix 官网静态页

## 位置

- 主页：`website/index.html`
- 样式：`website/styles.css`
- 脚本：`website/app.js`
- 资源：`website/assets/`

## 本地预览

在 `tg-group` 目录执行：

```bash
python -m http.server 4173 -d website
```

然后打开：

- `http://127.0.0.1:4173`

## 对外部署

这是一套纯静态页面，可以直接部署到：

- Vercel
- Netlify
- Cloudflare Pages
- 任意支持静态文件托管的平台

部署目录直接选 `website/` 即可。

## 后续你需要替换的内容

1. 联系方式（`mailto:hello@tgmatrix.local`）
2. 下载按钮链接
3. 正式域名
4. 如果要补下载页 / 更新日志 / FAQ，可以继续往 `website/` 下加页面
