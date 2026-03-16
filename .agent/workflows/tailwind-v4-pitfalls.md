---
description: Tailwind CSS v4 关键踩坑经验
---

## 核心规则

在 Tailwind CSS v4 项目中，**所有自定义 CSS 必须放在 `@layer base` 内**。

不在 `@layer` 中的样式（如 `* { margin: 0; padding: 0; }`）优先级高于 Tailwind 的 `@layer utilities`，会导致 `px-*`、`mx-auto`、`py-*`、`mb-*` 等间距类全部静默失效，且无任何报错。
