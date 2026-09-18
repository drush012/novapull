# Qike 博客（blog.qike.ccwu.cc）

一个和下载工具**分开**的纯内容站，用来做 SEO 流量、挂 Google AdSense，并向 NovaPull 桌面版导流。这里**没有任何下载功能**，以保持 AdSense 合规。

- 技术：Astro（静态、Markdown 写文章、双语 /zh /en）
- 托管：Cloudflare Pages
- 域名：`blog.qike.ccwu.cc`

## 本地开发

```bash
cd blog
npm install
npm run dev      # 本地预览 http://localhost:4321
npm run build    # 产出到 dist/
```

## 写文章

在 `src/content/posts/zh/` 或 `src/content/posts/en/` 下新建 `.md`，前置数据：

```yaml
---
title: "标题（含冒号时要加引号）"
description: "一句话摘要，会用于列表页和 SEO"
lang: zh            # zh 或 en
category: monetize  # monetize（运营变现） / tools（工具教程） / ai（AI 科普）
pubDate: 2026-09-18
---
正文用 Markdown 写。
```

## 部署到 Cloudflare Pages

1. Cloudflare 控制台 → **Workers & Pages** → 创建 **Pages** → 连接 GitHub 仓库 `drush012/novapull`
2. 构建设置：
   - **根目录 / Root directory**：`blog`
   - **构建命令 / Build command**：`npm run build`
   - **输出目录 / Build output directory**：`dist`
3. 部署成功后，在 Pages 项目的 **Custom domains** 添加 `blog.qike.ccwu.cc`（Cloudflare 会自动加好 DNS 记录）

## 开启 AdSense（审核通过后）

1. 拿到发布商 ID（`ca-pub-XXXXXXXXXXXXXXXX`）后，填进 `src/consts.ts` 的 `SITE.adsenseClient`
2. 每个广告位在 AdSense 后台建好广告单元，把 slot id 填进对应页面的 `<AdSlot slot="..." />`
3. 未填之前，广告脚本和广告位都**不会渲染**，不影响审核

> AdSense 审核要求「有实质原创内容」——建议先写够 15~30 篇再提交申请。
