---
description: flex 布局中视觉隐藏元素仍占据空间导致 justify-center 失效的踩坑经验
---

用 `opacity-0 w-0 overflow-hidden` 视觉隐藏一个 flex 子元素时，**必须同时移除它的 `flex-1`**（改为 `flex-none`），否则它仍会在 flex 布局中抢占全部剩余空间，导致同级元素的 `justify-center` 完全失效。
