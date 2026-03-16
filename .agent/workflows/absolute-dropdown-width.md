---
description: 绝对定位下拉菜单用 w-full 仍比父元素宽的踩坑经验
---

绝对定位元素设置 `w-full` 只约束了 CSS width，但如果子内容的 `min-content`（文字+图标+padding）超出父元素宽度，浏览器仍会按内容撑开渲染。解决方法：必须同时精简下拉菜单内部内容（去掉多余图标、缩小 padding/gap），确保内容本身不超出父元素宽度，`w-full` 才能真正生效。
