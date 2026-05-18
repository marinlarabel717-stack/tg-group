# TG-Matrix 官网静态页

## 位置

- 首页：`website/index.html`
- 功能详情模板页：`website/feature.html`
- 功能数据：`website/features.js`
- 样式：`website/styles.css`
- 脚本：`website/app.js`
- 资源：`website/assets/`
- 旧版功能预览图：`website/assets/features/*.svg`
- 真实软件截图：`website/assets/features-real/*.png`
- 教程裁剪图：`website/assets/features-real/crops/*.png`

## 本地预览

在 `tg-group` 目录执行：

```bash
python -m http.server 4173 -d website
```

然后打开：

- `http://127.0.0.1:4173`
- 功能页示例：`http://127.0.0.1:4173/feature.html?slug=auto-join`

## 对外部署

这是一套纯静态页面，可以直接部署到：

- Vercel
- Netlify
- Cloudflare Pages
- 任意支持静态文件托管的平台

部署目录直接选 `website/` 即可。

## 当前官网能力

1. 首页功能总览
2. 每个功能可点击进入详情页
3. 每个详情页带真实软件 UI 截图
4. 每个详情页带更细的图文教程说明

## 后续你需要替换的内容

1. 联系方式（`mailto:hello@tgmatrix.local`）
2. 下载按钮链接
3. 正式域名
4. 如果后面拿到真实软件截图，可把 `website/assets/features/*.svg` 替换成真实截图图像
