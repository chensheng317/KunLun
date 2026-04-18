# KunLun 昆仑工坊

基于 **React 19 + TypeScript + Tailwind CSS v4 + FastAPI + PostgreSQL** 构建的电商全域数字中枢平台。  
设计风格为 **赛博工业风（Nexus）**，支持深色/浅色主题切换，青色主色调，集成瞄准镜光标、Three.js 粒子特效等沉浸式交互。

> **当前版本：** v2.0.0 · 开发阶段  
> **最后更新：** 2026-04-18

---

## 目录

- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [环境要求](#环境要求)
- [新电脑从零部署指南](#新电脑从零部署指南)
- [环境变量配置](#环境变量配置)
- [第三方 API 申请指南](#第三方-api-申请指南)
- [启动项目](#启动项目)
- [路由与页面说明](#路由与页面说明)
- [角色与积分体系](#角色与积分体系)
- [数据存储架构](#数据存储架构)
- [常见问题排查](#常见问题排查)
- [配色规范](#配色规范)

---

## 核心功能

### 🏠 官网首页（Landing Page）

PPT 式全屏翻页体验，包含以下 Section：

- **Hero 区** — 全屏视频背景 + 指令输入框 + 粒子动效
- **轮播 Banner** — 产品亮点展示
- **功能展示** — 核心能力介绍（含 3D 卡片堆叠动效）
- **案例展示** — 用户成功案例
- **工具展示** — 9 大数字工厂工具一览
- **FAQ** — 常见问题折叠面板
- **Footer** — 公司信息 / 社交链接 / 联系方式

### 🤖 数字员工（核心模块 — 基于 Open-AutoGLM）

数字员工是昆仑工坊的核心功能模块，基于 **智谱 Open-AutoGLM** 手机操控大模型构建。  
用户通过自然语言下达指令，AutoGLM Agent 驱动真实手机设备自动执行电商运营任务。

**Agent 架构：**
- **PhoneAgent 封装** (`agent_wrapper.py`) — 将 Open-AutoGLM 的同步阻塞式 PhoneAgent 封装为支持回调钩子的异步包装器
- **TaskManager** (`task_manager.py`) — 管理任务生命周期（创建 → 执行 → 完成/失败），支持 WebSocket 实时推送执行进度
- **DeviceManager** (`device_manager.py`) — ADB 设备连接管理，支持多台安卓设备
- **Router** (`router.py`) — FastAPI 路由，提供 REST + WebSocket 接口

**6 大技能 Prompt（Skill Prompts）：**

| 技能 | 说明 |
|------|------|
| 竞品分析 (`competitive_analysis`) | 自动打开电商平台，采集竞品价格/销量/评价数据 |
| 内容发布 (`content_publish`) | 自动在目标平台发布图文/短视频内容 |
| 拟人互动 (`human_simulation`) | 模拟真实用户行为进行自然交互 |
| 店铺诊断 (`shop_diagnosis`) | 自动巡检店铺数据，生成诊断报告 |
| 视频评审 (`video_review`) | 自动抓取视频素材并进行审核 |
| 微信回复 (`wechat_reply`) | 自动处理微信消息，智能客服回复 |

### 🏭 数字工厂（9 大 AI 工具）

| 工具 | 后端模块 | 前端组件 | 技术方案 |
|------|---------|---------|---------| 
| 爆款视频提取 | `video_extractor.py` | `VideoExtractorTool.tsx` | 多平台视频/图文链接解析与下载 |
| 爆款拆解 / AI 创作 | `viral_content.py` | `ViralContentTool.tsx` | GLM 大模型分析爆款结构 |
| 图片生成 | `image_generator.py` | `ImageGeneratorTool.tsx` | RunningHub API 图片生成 |
| 视频生成 | `video_generator.py` | `VideoGeneratorTool.tsx` | RunningHub API 视频生成 |
| AI 语音合成 | `tts_synthesis.py` | `TtsSynthesisTool.tsx` | MiniMax TTS API + 声音克隆 |
| 水印/字幕消除 | `watermark_removal.py` | `WatermarkRemovalTool.tsx` | RunningHub 图像修复工作流 |
| 数字人直播 | `digital_human.py` | `DigitalHumanTool.tsx` | 火山引擎即梦 API 数字人合成 |
| AI 营销音乐 | `music_generator.py` | `MusicGeneratorTool.tsx` | Mureka AI 音乐生成 |
| JSON 提示词大师 | `json_prompt_master.py` | `JsonPromptMasterTool.tsx` | Coze 智能体 + SSE 流式对话 |

### 🧪 实验室

- **知识蒸馏** (`knowledge_distill.py` / `KnowledgeDistillTool.tsx`) — URL 文章提取 + AutoGLM API 智能分析与主题拆分
- **知识库管理** (`lab_knowledge.py`) — 蒸馏后的结构化知识存储与检索

### 🛠 工作台（Workbench）

- **首页面板** (`WorkbenchHome.tsx`) — 快捷启动入口 + 数据概览
- **数字员工** (`DigitalWorkersPage.tsx`) — AutoGLM 交互界面
- **数字工厂** (`DigitalFactoryPage.tsx`) — 9 大工具选择与使用
- **实验室** (`LabPage.tsx`) — 知识蒸馏与知识库
- **资产库** (`AssetLibraryPage.tsx`) — 用户生成内容的统一管理（预览/下载）
- **历史记录** (`HistoryPage.tsx`) — 操作日志与版本回溯（支持删除）
- **积分管理** (`CreditsPage.tsx`) — 积分余额与充值
- **个人中心** (`PersonalCenterPage.tsx`) — 修改用户名/密码、我的订单（含分页）、积分记录（含分页）

**工作台 UI 框架组件：**
- `WorkbenchSidebar.tsx` — 可折叠侧边栏导航
- `WorkbenchTopBar.tsx` — 顶部信息栏（用户信息/通知/积分）
- `UserSettingsModal.tsx` — 用户设置弹窗（账户管理/语言切换/主题切换/联系客服）
- `TargetCursor.tsx` — 瞄准镜光标特效组件

### 💳 会员订阅系统

- **3 级付费套餐** + 免费版，支持月付/年付：

| 套餐 | 月付 | 年付 | 积分 | 首次加赠 |
|------|------|------|------|---------|
| 免费版 | — | — | 50 | — |
| 基础版 | ¥99/月 | ¥79/月 | 1,000 | 500 |
| 专业版 | ¥299/月 | ¥249/月 | 3,000 | 1,500 |
| 旗舰版 | ¥999/月 | ¥799/月 | 10,000 | 5,000 |

- **积分体系**：开通即赠 + 首次加赠（一次性） + 积分直充
- **会员时长**：续费自动叠加、到期自动降级为游客
- **订单管理**：升级方案 / 积分直充订单记录

### 👤 用户系统

- 注册 / 登录 / 退出（JWT Token 认证）
- 6 级角色体系：`super_admin` > `admin` > `ultra` > `pro` > `normal` > `guest`
- 侧栏用户卡片显示会员到期日
- 用户设置弹窗（账户管理 / 语言切换 / 主题切换 / 联系客服）
- 维护模式下管理员正常访问，普通用户显示维护页面
- 公网注册开关（可通过环境变量或管理后台控制）

### 🔒 管理后台（9 大管理模块）

| 模块 | 组件 | 说明 |
|------|------|------|
| 数据概览 | `AdminDashboard.tsx` | 用户/积分/工具调用统计概览 |
| 用户管理 | `UserManagement.tsx` | 角色调整、禁用/启用、积分修改 |
| 积分管理 | `CreditManagement.tsx` | 积分发放/消耗监控 |
| 订单管理 | `OrderManagement.tsx` | 会员订单与充值订单 |
| 工具管理 | `ToolManagement.tsx` | 工具启用/禁用与定价配置 |
| 公告管理 | `AnnouncementManagement.tsx` | 站内公告发布与管理 |
| 资产管理 | `AssetManagement.tsx` | 全站资产统计 |
| 系统设置 | `SystemSettings.tsx` | 维护模式/注册开关/站点配置 |
| 管理侧栏 | `AdminSidebar.tsx` | 管理后台导航 |

### 🌐 国际化（i18n）

支持 4 种语言，基于 `i18next` + `react-i18next`：

| 语言 | 文件 |
|------|------|
| 简体中文 | `locales/zh-CN.json` |
| 繁体中文 | `locales/zh-TW.json` |
| 英文 | `locales/en.json` |
| 日文 | `locales/ja.json` |

---

## 技术栈

### 前端

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React | 19.x |
| 语言 | TypeScript | 5.9 |
| 构建工具 | Vite | 8.x |
| 样式方案 | Tailwind CSS (v4 + Vite 插件) | 4.2 |
| 动画 | Framer Motion + GSAP | 12.x / 3.x |
| 3D 渲染 | Three.js + postprocessing | 0.183 |
| 路由 | React Router | 7.x |
| 图标 | Lucide React | 0.577 |
| 国际化 | i18next + react-i18next | 26.x / 17.x |
| Markdown | react-markdown + rehype-highlight | 10.x / 7.x |
| 特效组件 | react-bits (CardSwap / Hyperspeed / LiquidEther 等) | 自定义 |

### 后端

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | FastAPI | 0.115 |
| ASGI 服务器 | Uvicorn | 0.30 |
| HTTP 客户端 | httpx | 0.27 |
| 数据校验 | Pydantic | 2.9 |
| 数据库 | PostgreSQL + SQLAlchemy 2.x | latest |
| 数据库驱动 | psycopg (v3) | ≥3.1 |
| 数据库迁移 | Alembic | ≥1.13 |
| 认证方案 | JWT (python-jose) + bcrypt (passlib) | latest |
| 图像处理 | Pillow | 10.4 |
| 文件上传 | python-multipart | 0.0.9 |
| 对象存储 | volcengine + tos | latest |

### 第三方 AI 服务

| 服务商 | 用途 | 对应工具 |
|--------|------|---------| 
| RunningHub | ComfyUI 工作流托管 | 图片生成、视频生成、水印消除 |
| MiniMax | TTS 语音合成 + 声音克隆 | AI 语音合成 |
| Mureka | AI 音乐生成 | AI 营销音乐 |
| 火山引擎 (即梦 API) | 数字人视频合成 | 数字人直播 |
| 火山引擎 TOS | 对象存储中转 | 数字人直播（图片/音频 URL） |
| Coze (扣子) | 智能体对话 | JSON 提示词大师 |
| 智谱 (Open-AutoGLM) | 手机操控大模型 | 数字员工 |

---

## 项目结构

```
KunLun/
├── frontend/                     # 🎨 前端 (React + TypeScript + Vite 8)
│   ├── public/                   #    静态资源
│   │   ├── logo.png              #       站点 Logo
│   │   ├── kefu.jpg              #       客服二维码
│   │   ├── banner视频.mp4         #       首页背景视频
│   │   └── stream/               #       流媒体资源
│   ├── src/
│   │   ├── components/           #    可复用组件
│   │   │   ├── Navbar.tsx        #       顶部导航栏
│   │   │   ├── HeroSection.tsx   #       全屏 Hero 区
│   │   │   ├── FeaturesSection.tsx  #    功能展示
│   │   │   ├── BannerCarousel.tsx   #    轮播 Banner
│   │   │   ├── ToolsSection.tsx  #       工具展示
│   │   │   ├── CasesSection.tsx  #       案例展示
│   │   │   ├── FaqSection.tsx    #       FAQ 折叠面板
│   │   │   ├── Footer.tsx        #       页脚
│   │   │   ├── SideNavigation.tsx #      侧边翻页导航
│   │   │   ├── factory/          #       数字工厂 9 大工具组件
│   │   │   │   ├── VideoExtractorTool.tsx
│   │   │   │   ├── ViralContentTool.tsx
│   │   │   │   ├── ImageGeneratorTool.tsx
│   │   │   │   ├── VideoGeneratorTool.tsx
│   │   │   │   ├── TtsSynthesisTool.tsx
│   │   │   │   ├── WatermarkRemovalTool.tsx
│   │   │   │   ├── DigitalHumanTool.tsx
│   │   │   │   ├── MusicGeneratorTool.tsx
│   │   │   │   ├── JsonPromptMasterTool.tsx
│   │   │   │   ├── VoiceClonePanel.tsx   # 声音克隆面板
│   │   │   │   └── video-gen-panels.tsx  # 视频生成子面板
│   │   │   ├── workbench/        #       工作台框架组件
│   │   │   │   ├── WorkbenchSidebar.tsx
│   │   │   │   ├── WorkbenchTopBar.tsx
│   │   │   │   ├── UserSettingsModal.tsx
│   │   │   │   └── TargetCursor.tsx
│   │   │   ├── admin/            #       管理后台 9 大模块
│   │   │   │   ├── AdminDashboard.tsx
│   │   │   │   ├── AdminSidebar.tsx
│   │   │   │   ├── UserManagement.tsx
│   │   │   │   ├── CreditManagement.tsx
│   │   │   │   ├── OrderManagement.tsx
│   │   │   │   ├── ToolManagement.tsx
│   │   │   │   ├── AnnouncementManagement.tsx
│   │   │   │   ├── AssetManagement.tsx
│   │   │   │   └── SystemSettings.tsx
│   │   │   ├── lab/              #       实验室组件
│   │   │   │   └── KnowledgeDistillTool.tsx
│   │   │   └── react-bits/       #       第三方动效组件
│   │   │       ├── CardSwap.tsx
│   │   │       ├── GradientText.tsx
│   │   │       ├── Hyperspeed.tsx
│   │   │       ├── LiquidEther.tsx
│   │   │       └── ShinyText.tsx
│   │   ├── pages/                #    路由页面
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── PricingPage.tsx
│   │   │   ├── CreditRechargePage.tsx
│   │   │   ├── AdminPage.tsx
│   │   │   ├── WorkbenchPage.tsx
│   │   │   ├── MaintenancePage.tsx
│   │   │   └── workbench/        #       工作台子页面
│   │   │       ├── WorkbenchHome.tsx
│   │   │       ├── DigitalWorkersPage.tsx
│   │   │       ├── DigitalFactoryPage.tsx
│   │   │       ├── LabPage.tsx
│   │   │       ├── AssetLibraryPage.tsx
│   │   │       ├── HistoryPage.tsx
│   │   │       ├── CreditsPage.tsx
│   │   │       └── PersonalCenterPage.tsx
│   │   ├── contexts/             #    全局状态管理
│   │   │   └── AuthContext.tsx   #       认证上下文（JWT/用户/积分/权限/订单/会员）
│   │   ├── hooks/                #    自定义 Hooks
│   │   │   ├── useCreditsGuard.ts   # 积分余额前置检查
│   │   │   ├── useFullPageSnap.ts   # 首页全屏翻页滚动
│   │   │   └── useTheme.ts          # 主题切换（暗色/亮色/跟随系统）
│   │   ├── utils/                #    工具函数
│   │   │   ├── api-client.ts     #       HTTP 请求封装（自动携带 JWT + 401 拦截）
│   │   │   └── factory-records.ts #      资产库/历史记录 API 调用
│   │   ├── locales/              #    国际化语言包
│   │   │   ├── zh-CN.json
│   │   │   ├── zh-TW.json
│   │   │   ├── en.json
│   │   │   └── ja.json
│   │   ├── fonts/                #    自定义字体
│   │   ├── i18n.ts               #    i18next 初始化配置
│   │   ├── App.tsx               #    路由入口 + 维护模式拦截
│   │   ├── main.tsx              #    React 挂载入口（含主题初始化防闪白）
│   │   └── index.css             #    Tailwind v4 @theme 全局主题（Nexus 设计系统）
│   ├── index.html                #    HTML 模板
│   ├── vite.config.ts            #    Vite 配置 (含 /api 代理 → localhost:8000)
│   ├── tsconfig.json             #    TypeScript 配置
│   ├── tsconfig.app.json         #    应用 TS 配置
│   ├── tsconfig.node.json        #    Node TS 配置
│   ├── eslint.config.js          #    ESLint 配置
│   └── package.json
│
├── backend/                      # ⚙️ 后端 (Python FastAPI + PostgreSQL)
│   ├── main.py                   #    启动入口（uvicorn 启动 + pyc 缓存清理）
│   ├── app.py                    #    ASGI 应用工厂（路由注册 / CORS / .env 加载 / 种子数据）
│   ├── __init__.py
│   ├── .env                      #    环境变量 (已 gitignore)
│   ├── .env.example              #    环境变量模板（复制为 .env 后填入真实值）
│   ├── requirements.txt          #    Python 依赖
│   │
│   ├── api/                      # 📡 RESTful API 路由层
│   │   ├── auth.py               #       登录/注册/Token 刷新
│   │   ├── users.py              #       用户 CRUD
│   │   ├── credits.py            #       积分管理
│   │   ├── orders.py             #       订单管理
│   │   ├── admin.py              #       管理后台接口
│   │   ├── assets.py             #       资产库接口
│   │   ├── config.py             #       站点配置接口
│   │   └── libraries.py          #       自建素材库
│   │
│   ├── services/                 # 🧩 业务逻辑层
│   │   ├── auth_service.py       #       认证逻辑
│   │   ├── user_service.py       #       用户逻辑
│   │   ├── credit_service.py     #       积分逻辑
│   │   ├── order_service.py      #       订单逻辑
│   │   ├── admin_service.py      #       管理后台逻辑
│   │   ├── factory_service.py    #       工厂工具逻辑
│   │   ├── library_service.py    #       素材库逻辑
│   │   └── tos_service.py        #       火山引擎 TOS 对象存储
│   │
│   ├── models/                   # 🗄️ ORM 模型（SQLAlchemy）
│   │   ├── user.py               #       用户表
│   │   ├── credit.py             #       积分流水表
│   │   ├── order.py              #       订单表
│   │   ├── config.py             #       站点配置 + 工具配置表
│   │   ├── factory.py            #       工厂资产/历史记录表
│   │   ├── library.py            #       素材库表
│   │   ├── conversation.py       #       对话记录表
│   │   ├── admin_log.py          #       管理员操作日志表
│   │   ├── tool_log.py           #       工具调用日志表
│   │   ├── preference.py         #       用户偏好设置表
│   │   └── worker.py             #       数字员工任务表
│   │
│   ├── schemas/                  # 📐 Pydantic 请求/响应模型
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── credit.py
│   │   ├── order.py
│   │   ├── admin.py
│   │   ├── factory.py
│   │   └── library.py
│   │
│   ├── auth/                     # 🔑 认证模块
│   │   ├── security.py           #       密码哈希（bcrypt）
│   │   ├── jwt_handler.py        #       JWT 签发/验证
│   │   └── dependencies.py       #       FastAPI 依赖注入（当前用户提取）
│   │
│   ├── database/                 # 🗃️ 数据库管理
│   │   ├── connection.py         #       SQLAlchemy 引擎 + Session 工厂
│   │   ├── base.py               #       ORM Base 声明
│   │   └── seed.py               #       种子数据初始化（管理员 + 站点配置 + 工具配置）
│   │
│   ├── utils/                    # 🔧 工具函数
│   │   └── log_filter.py         #       日志脱敏过滤器
│   │
│   ├── scripts/                  # 📜 运维脚本
│   │   ├── reset_testuser.py     #       重置测试用户
│   │   └── fix_configs.py        #       修复配置数据
│   │
│   ├── alembic/                  # 🔄 数据库迁移（Alembic）
│   │   └── ...
│   ├── alembic.ini               #    Alembic 配置
│   │
│   ├── digital_worker/           # 🤖 数字员工模块 (核心)
│   │   ├── router.py             #       REST + WebSocket 路由
│   │   ├── task_manager.py       #       任务生命周期管理
│   │   ├── agent_wrapper.py      #       Open-AutoGLM PhoneAgent 封装
│   │   ├── device_manager.py     #       ADB 设备管理
│   │   ├── schemas.py            #       Pydantic 数据模型
│   │   ├── log_writer.py         #       执行日志写入
│   │   └── skill_prompts/        #       6 大技能 Prompt
│   │       ├── competitive_analysis.py
│   │       ├── content_publish.py
│   │       ├── human_simulation.py
│   │       ├── shop_diagnosis.py
│   │       ├── video_review.py
│   │       └── wechat_reply.py
│   │
│   ├── Open-AutoGLM-main/       # 📦 AutoGLM 框架源码 (智谱开源)
│   │
│   ├── data/                    # 📁 文件数据存储（非数据库）
│   │   ├── json_prompt_conversations.json  # JSON 提示词大师对话记录
│   │   └── lab_knowledge/                  # 知识蒸馏知识库文件
│   │
│   ├── uploads/                 # 📤 用户上传文件 (已 gitignore)
│   ├── outputs/                 # 📥 工具输出文件 (已 gitignore)
│   │
│   ├── video_extractor.py       #    爆款视频提取
│   ├── viral_content.py         #    爆款拆解/创作
│   ├── image_generator.py       #    图片生成 (RunningHub API)
│   ├── video_generator.py       #    视频生成 (RunningHub API)
│   ├── tts_synthesis.py         #    语音合成 (MiniMax TTS)
│   ├── watermark_removal.py     #    水印/字幕消除
│   ├── digital_human.py         #    数字人直播形象
│   ├── music_generator.py       #    AI 营销音乐
│   ├── json_prompt_master.py    #    JSON 提示词大师
│   ├── knowledge_distill.py     #    知识蒸馏
│   └── lab_knowledge.py         #    知识库管理
│
├── .gitignore
└── README.md
```

---

## 环境要求

在一台全新的电脑上部署本项目，需要安装以下软件：

### 必须安装

| 软件 | 最低版本 | 推荐版本 | 用途 |
|------|---------|---------|------|
| **Node.js** | 18.x | 20.x LTS | 前端运行时 |
| **npm** | 9.x | 10.x (随 Node.js 附带) | 前端包管理 |
| **Python** | 3.10 | 3.11 ~ 3.12 | 后端运行时 |
| **pip** | 23.x | 最新版 (随 Python 附带) | Python 包管理 |
| **PostgreSQL** | 14.x | 16.x | 数据库（用户/积分/订单/资产等业务数据） |
| **Git** | 2.x | 最新版 | 版本控制 |

### 可选安装（核心功能需要）

| 软件 | 用途 |
|------|------|
| **ADB (Android Debug Bridge)** | 数字员工功能 — 连接安卓手机设备 |
| **Android 手机** | 数字员工功能 — 被 AutoGLM 操控的真实设备 |

---

## 新电脑从零部署指南

> 以下以 **Windows** 系统为例，假设你拿到项目文件夹后从零开始配置。

### 第一步：安装 Node.js

1. 访问 [Node.js 官网](https://nodejs.org/)，下载 **LTS 版本**（推荐 20.x）
2. 运行安装程序，**全部默认选项**即可
3. 安装完成后**重新打开一个终端窗口**（命令提示符或 PowerShell）
4. 验证安装：

```bash
node --version    # 应输出 v20.x.x
npm --version     # 应输出 10.x.x
```

### 第二步：安装 Python

1. 访问 [Python 官网](https://www.python.org/downloads/)，下载 **3.11 或 3.12**
2. 安装时 **务必勾选** `Add Python to PATH`（安装界面底部的复选框，很容易忽略！）
3. 安装完成后**重新打开一个终端窗口**
4. 验证安装：

```bash
python --version   # 应输出 Python 3.11.x 或 3.12.x
pip --version      # 应输出 pip 23.x 或更高
```

> ⚠️ **Windows 常见问题：** 如果输入 `python` 后弹出 Microsoft Store，请在 Windows 设置中搜索"管理应用执行别名"，**关闭** `python.exe` 和 `python3.exe` 两个别名。

### 第三步：安装 PostgreSQL

1. 访问 [PostgreSQL 官网](https://www.postgresql.org/download/windows/)，下载 Windows 安装包（推荐 16.x）
2. 运行安装程序，设置步骤如下：
   - **安装目录**：默认即可
   - **选择组件**：全部勾选（至少需要 PostgreSQL Server + pgAdmin + Command Line Tools）
   - **数据目录**：默认即可
   - **超级用户密码**：设置一个密码（例如 `ROOT`），**务必记住这个密码**，后面配环境变量要用
   - **端口**：默认 `5432`
   - **区域配置**：选择 `Chinese, China` 或默认即可
3. 安装完成后，**创建项目专用数据库**：

```bash
# 方式一：使用 psql 命令行（安装时已加入 PATH）
psql -U postgres
# 输入刚才设置的密码后进入 PostgreSQL 命令行
CREATE DATABASE kunlun;
\q
```

```bash
# 方式二：使用 pgAdmin 图形界面
# 打开 pgAdmin → 连接到本地服务器 → 右键 Databases → Create → Database
# Database 名称填入 kunlun → Save
```

4. 验证数据库创建成功：

```bash
psql -U postgres -d kunlun -c "SELECT 1;"
# 应输出一行结果，说明数据库连接正常
```

### 第四步：安装 Git（如果还没有）

1. 访问 [Git 官网](https://git-scm.com/)，下载安装
2. 验证安装：

```bash
git --version      # 应输出 git version 2.x.x
```

### 第五步：获取项目代码

如果已经有项目文件夹（U盘拷贝等），跳过此步。如果需要从仓库克隆：

```bash
git clone <仓库地址>
cd KunLun
```

### 第六步：安装前端依赖

```bash
cd frontend
npm install
```

> 首次安装约需 2~5 分钟。如果速度慢，先设置 npm 国内镜像：
> ```bash
> npm config set registry https://registry.npmmirror.com
> ```
> 设置后重新执行 `npm install`。

### 第七步：安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

> 推荐使用 Python 虚拟环境（避免全局包冲突）：
> ```bash
> # 创建虚拟环境
> python -m venv .venv
> 
> # 激活虚拟环境（Windows PowerShell）
> .venv\Scripts\Activate.ps1
> # 如果 PowerShell 报错"无法运行脚本"，先执行：
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> 
> # 激活虚拟环境（Windows CMD）
> .venv\Scripts\activate.bat
> 
> # 安装依赖
> pip install -r requirements.txt
> ```

### 第八步：配置环境变量

1. 在 `backend/` 目录下，复制模板文件：

```bash
cd backend
copy .env.example .env
```

2. 用 VSCode 打开 `backend/.env`，填入以下**必填项**：

```bash
# 数据库连接（把 YOUR_PASSWORD 替换为你在第三步设的 PostgreSQL 密码）
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/kunlun

# JWT 密钥（替换为任意长字符串即可，例如用键盘乱敲 32 位）
JWT_SECRET_KEY=your-random-secret-key-at-least-32-chars
```

3. 其他 API Key 按需填写（不填的工具调用时会报错提示，不影响其他功能）
4. 详细配置见下方 [环境变量配置](#环境变量配置) 章节

### 第九步：启动项目

需要**同时启动前后端**，打开**两个终端窗口**：

**终端 1 — 启动后端：**
```bash
cd backend
# 如果用了虚拟环境，先激活：.venv\Scripts\Activate.ps1
python main.py
# 看到 "Uvicorn running on http://0.0.0.0:8000" 表示启动成功
# 首次启动会自动创建数据库表 + 初始化管理员账号
```

**终端 2 — 启动前端：**
```bash
cd frontend
npm run dev
# 看到 "VITE v8.x.x ready in xxx ms" 表示启动成功
```

5. 打开浏览器访问 **http://localhost:5174** 即可使用
6. 默认管理员账号：**admin** / **admin123**

---

## 环境变量配置

在 `backend/.env` 中填写以下配置（可参考 `backend/.env.example`）：

```bash
# ============================================================
# 数据库配置（必填）
# ============================================================
# 格式：postgresql://用户名:密码@主机:端口/数据库名
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/kunlun

# ============================================================
# JWT 认证配置（必填）
# ============================================================
JWT_SECRET_KEY=change-me-to-a-strong-random-secret
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440          # Token 有效期（分钟），1440 = 24 小时

# ============================================================
# 公网注册开关
# ============================================================
# false = 关闭注册（仅允许预置账号登录，推荐测试阶段）
# true  = 开放注册
ALLOW_PUBLIC_REGISTRATION=false

# ============================================================
# RunningHub (图片生成 · 视频生成 · 水印/字幕消除)
# ============================================================
RUNNINGHUB_API_KEY=your_runninghub_api_key

# ============================================================
# MiniMax (AI 语音合成 TTS + 声音克隆)
# ============================================================
MINIMAX_API_KEY=your_minimax_api_key

# ============================================================
# Mureka (AI 营销音乐)
# ============================================================
MUREKA_API_KEY=your_mureka_api_key

# ============================================================
# 火山引擎 / 即梦 (数字人直播形象)
# ============================================================
VOLC_ACCESS_KEY=your_volc_access_key
VOLC_SECRET_KEY=your_volc_secret_key

# ============================================================
# 火山引擎 TOS 对象存储
# ============================================================
TOS_BUCKET=your_tos_bucket_name
TOS_ENDPOINT=tos-cn-beijing.volces.com
TOS_REGION=cn-beijing

# ============================================================
# Coze 扣子智能体 (JSON 提示词大师)
# ============================================================
COZE_API_TOKEN=your_coze_api_token
COZE_BOT_ID=your_coze_bot_id

# ============================================================
# 智谱 AutoGLM (数字员工 — 手机自动化)
# ============================================================
AUTOGLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
AUTOGLM_MODEL=autoglm-phone
AUTOGLM_API_KEY=your_autoglm_api_key
```

> **最小可用配置：** 只需填写 `DATABASE_URL` + `JWT_SECRET_KEY` 即可启动项目。其他 API Key 缺失的工具在调用时会返回错误提示，不影响系统其他功能。

---

## 第三方 API 申请指南

| 服务 | 申请地址 | 备注 |
|------|---------|------|
| RunningHub | [runninghub.cn](https://www.runninghub.cn/) | 注册后在个人中心获取 API Key |
| MiniMax | [minimaxi.com](https://www.minimaxi.com/) | 开放平台 → API 管理 → 创建 Key |
| Mureka | [mureka.ai](https://www.mureka.ai/) | API 文档页面申请 |
| 火山引擎 | [volcengine.com](https://www.volcengine.com/) | 控制台 → 即梦 AI → 获取 Access Key/Secret Key |
| 火山引擎 TOS | [volcengine.com](https://www.volcengine.com/) | 控制台 → 对象存储 → 创建 Bucket |
| Coze (扣子) | [coze.cn](https://www.coze.cn/) | 创建 Bot → 获取 Bot ID → 生成 API Token |
| 智谱 AI | [open.bigmodel.cn](https://open.bigmodel.cn/) | 开放平台 → API 管理 → 获取 Key |

---

## 启动项目

### 后端启动

```bash
cd backend
python main.py
```

后端服务将运行在 `http://localhost:8000`。

- 健康检查：`GET http://localhost:8000/health`
- API 文档：`http://localhost:8000/docs` (FastAPI 自动生成 Swagger UI)
- 开发模式：已启用 `uvicorn reload`，修改代码自动重启
- 首次启动自动执行：建表 → 创建管理员账号 → 初始化站点/工具配置

### 前端启动

```bash
cd frontend
npm run dev
```

前端开发服务器将运行在 `http://localhost:5174` (固定端口)。

### 前后端联调

前端 Vite 配置了 `/api` 路径代理，所有 `/api/*` 请求自动转发到后端 `http://localhost:8000`：

```
前端请求 /api/xxx → Vite 代理 → http://localhost:8000/api/xxx
```

**同时启动前后端后**，在浏览器访问 `http://localhost:5174` 即可正常使用全部功能。

### 生产构建

```bash
cd frontend
npm run build    # 输出到 frontend/dist/
npm run preview  # 预览生产构建
```

---

## 路由与页面说明

| 路由 | 页面 | 权限要求 |
|------|------|---------| 
| `/` | 官网首页 (Landing Page) | 无 |
| `/login` | 登录页面 | 无 |
| `/register` | 注册页面 | 无（需后端开启注册） |
| `/pricing` | 定价页面 (会员套餐) | 无 |
| `/recharge` | 积分充值页面 | 需登录 |
| `/workbench` | 工作台 (SPA 子路由) | 需登录 |
| `/admin` | 管理后台 | 需 admin / super_admin 角色 |

> **维护模式：** 管理员在 `/admin` 的系统设置中开启维护模式后，非管理员用户访问任何页面都会看到维护页面，`/login` 始终放行以便管理员登录。

---

## 角色与积分体系

| 角色 | 标识 | 开通积分 | 首次加赠 | 年付月均 | 月付 |
|------|------|---------|---------|---------|------|
| 超级管理员 | `super_admin` | 99,999 | — | — | — |
| 普通管理员 | `admin` | — | — | — | — |
| 旗舰版 | `ultra` | 10,000 | 5,000 | ¥799/月 | ¥999/月 |
| 专业版 | `pro` | 3,000 | 1,500 | ¥249/月 | ¥299/月 |
| 基础版 | `normal` | 1,000 | 500 | ¥79/月 | ¥99/月 |
| 游客 | `guest` | 50 | — | 免费 | 免费 |

### 预置账号

首次启动后端时，数据库会自动创建超级管理员：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `admin123` | 超级管理员 |

> 其他测试用户可通过管理后台手动创建，或通过 `backend/scripts/reset_testuser.py` 脚本批量创建。

---

## 数据存储架构

### PostgreSQL 数据库（核心业务数据）

所有用户、积分、订单、资产等业务数据均存储在 PostgreSQL 数据库中，通过 SQLAlchemy ORM 操作。

| ORM 模型 | 数据表 | 说明 |
|----------|--------|------|
| `User` | 用户表 | 账号信息、角色、积分余额、会员到期日 |
| `CreditLog` | 积分流水表 | 积分增减记录（充值/消耗/赠送/扣费） |
| `Order` | 订单表 | 会员订阅/积分充值订单 |
| `SiteConfig` | 站点配置表 | 注册开关、维护模式、定价方案 |
| `ToolConfig` | 工具配置表 | 11 个工具的积分消耗与开关 |
| `FactoryAsset` | 工厂资产表 | 用户通过工具生成的图片/视频/音频等 |
| `FactoryHistory` | 历史记录表 | 工具调用历史日志 |
| `Library` | 素材库表 | 用户自建素材库 |
| `Conversation` | 对话记录表 | JSON 提示词大师对话历史 |
| `AdminLog` | 管理员日志表 | 管理员操作审计 |
| `ToolLog` | 工具调用日志表 | 工具使用统计 |
| `Preference` | 用户偏好表 | 主题/语言等设置 |
| `Worker` | 数字员工任务表 | AutoGLM 任务记录 |

### 文件存储（非数据库）

| 路径 | 说明 |
|------|------|
| `backend/data/json_prompt_conversations.json` | JSON 提示词大师对话历史（文件级） |
| `backend/data/lab_knowledge/` | 知识蒸馏知识库 |
| `backend/uploads/` | 用户上传文件（声音素材/图片等，已 gitignore） |
| `backend/outputs/` | 工具生成输出（视频/图片/音频等，已 gitignore） |

### 前端本地存储（仅用户偏好）

| 键名 | 说明 |
|------|------|
| `kunlun_theme` | 主题偏好（dark/light/system） |
| `kunlun_token` | JWT 登录 Token |

---

## 常见问题排查

### 前端启动问题

**Q: `npm install` 报错或速度极慢**  
A: 设置 npm 国内镜像后重试：
```bash
npm config set registry https://registry.npmmirror.com
rm -rf node_modules package-lock.json
npm install
```

**Q: 端口 5174 被占用**  
A: Vite 配置了 `strictPort: true`，不会自动切换端口。需要手动关闭占用进程：
```bash
# Windows PowerShell
netstat -ano | findstr :5174
taskkill /PID <进程ID> /F
```

**Q: Tailwind CSS 样式不生效**  
A: 确认使用的是 Tailwind CSS v4（通过 `@tailwindcss/vite` 插件集成），v4 的配置方式与 v3 完全不同，**不使用** `tailwind.config.js`，主题定义在 `frontend/src/index.css` 的 `@theme` 块中。

### 后端启动问题

**Q: `python main.py` 报 ModuleNotFoundError**  
A: 确保在 `backend/` 目录下执行命令，且已安装所有依赖：
```bash
cd backend
pip install -r requirements.txt
python main.py
```
如果用了虚拟环境，先确认激活了虚拟环境（终端提示符前有 `(.venv)` 字样）。

**Q: 数据库连接失败（psycopg.OperationalError）**  
A: 逐项排查：
1. PostgreSQL 服务是否正在运行？（Windows 服务列表中找 `postgresql-x64-16`）
2. `.env` 中 `DATABASE_URL` 的密码是否正确？
3. 数据库 `kunlun` 是否已创建？(`psql -U postgres -c "\l"` 查看列表)
4. 端口 5432 是否被占用？

**Q: 后端启动但接口不通 (502)**  
A: 可能是 `__pycache__` 残留导致的模块加载失败。`main.py` 启动时会自动清理缓存，但如果问题持续：
```bash
# 手动清理所有 __pycache__（Windows PowerShell）
Get-ChildItem -Path . -Filter __pycache__ -Recurse -Directory | Remove-Item -Recurse -Force
python main.py
```

**Q: 某个工具调用返回错误**  
A: 检查 `backend/.env` 中对应的 API Key 是否已配置且有效。缺少 Key 不影响其他工具使用。

### 前后端联调问题

**Q: 前端页面正常但 API 请求 404**  
A: 确认后端已启动在 `localhost:8000`，Vite 代理配置正确。检查请求路径是否以 `/api` 开头。

**Q: 登录后跳转但页面空白**  
A: 检查浏览器控制台是否有 401 错误。可能 JWT Token 过期，尝试清除 `localStorage` 后重新登录。

**Q: 文件上传超时**  
A: Vite 代理已配置 300 秒超时。如果仍然超时，检查上传文件大小和网络状况。

---

## 配色规范

本项目使用自定义 **Nexus 赛博工业风** 设计系统，支持 **深色 (Dark)** 和 **浅色 (Light)** 两种模式。主题色定义在 `frontend/src/index.css` 的 `@theme` 块中，通过 `<html data-theme="...">` 属性切换。

### 核心色值速查

| CSS 变量 | 深色模式 | 浅色模式 |
|----------|---------|---------|
| `--color-nexus-bg` | `#161823` 漆黑 | `#F5F7FA` 浅灰白 |
| `--color-nexus-surface` | `#2D2B38` 青灰 | `#FFFFFF` 纯白 |
| `--color-nexus-surface-alt` | `#053154` 暗宝石 | `#EEF2F7` 冰蓝灰 |
| `--color-nexus-primary` | `#3eede7` 碧蓝 | `#0D9B9B` 深青 |
| `--color-nexus-secondary` | `#5EB8AC` 铜绿 | `#3D9B93` 暗铜绿 |
| `--color-nexus-text` | `#E0E6ED` 浅蓝灰 | `#1A2332` 深墨 |
| `--color-nexus-muted` | `#7D8A99` | `#7B8794` |
| `--color-nexus-inverse` | `#161823` | `#FFFFFF` |
| `--color-nexus-border` | `#3A3F58` | `#E2E8F0` |

完整配色规范、字体系统、动画 Token 和组件样式指南参见 [`docs/used/配色.md`](docs/used/配色.md)。

---

## 开发约定

- **代码规范** — 遵循项目根目录 `.agent/` 下的工程规则
- **命名规范** — 组件 PascalCase / 文件 kebab-case / 变量 camelCase
- **注释语言** — 所有代码注释使用简体中文
- **后端分层** — 严格遵循 api → service → model 三层架构，禁止在 api 层直接操作数据库
- **认证方案** — JWT Token，前端通过 `api-client.ts` 自动附加 + 401 自动拦截登出
- **分支策略** — `main` 为主分支，功能开发使用 `feature/*` 分支
