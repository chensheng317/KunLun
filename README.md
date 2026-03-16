# KunLun 昆仑工坊 — 门户前端

基于 React + TypeScript + Tailwind CSS v4 构建的赛博工业风门户网站。

## 项目结构

```
KunLun/
├── docs/                  # 📋 任务文档 & 设计规范（放你的 md 文件）
│   └── 配色.md
├── public/                # 🌐 静态公共资源（构建时原样复制）
│   └── logo.png
├── src/
│   ├── assets/            # 🎨 UI 资源（通过 import 引用、会被构建处理）
│   │   ├── images/        #    PNG/JPG/WebP 图片
│   │   └── icons/         #    SVG 图标
│   ├── components/        # 🧩 可复用组件
│   ├── pages/             # 📄 独立路由页面
│   ├── App.tsx            # 路由入口
│   ├── main.tsx           # 应用挂载点
│   └── index.css          # Tailwind 全局主题
├── index.html             # HTML 模版
├── vite.config.ts         # Vite 配置
└── package.json
```

## 快速开始

```bash
npm install
npm run dev       # 开发模式 http://localhost:5173
npm run build     # 生产构建
```

## 配色规范

详见 `docs/配色.md`
