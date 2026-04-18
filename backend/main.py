"""
昆仑工坊 — 数字工厂后端启动入口
NOTE: 所有后端启动统一通过 python main.py，
ASGI 应用定义在 app.py 中。

为什么 app 定义和启动入口要分开？
uvicorn reload 模式在 Windows 上使用 multiprocessing.spawn 创建子进程，
如果 app 定义文件同时也是 python 入口文件（__main__），
子进程 re-import 时会触发"双重加载"问题，导致 "app" not found 报错。
分离后，main.py 只做环境准备和 uvicorn 启动，app.py 只做纯粹的应用定义，
彻底避免此问题。
"""

import os
import sys
import shutil
from pathlib import Path

# HACK: 禁用 .pyc 缓存生成 + 清理残留缓存
# uvicorn reload 子进程会继承环境变量，从而在整个进程树中禁用 bytecode 缓存，
# 防止 stale .pyc 导致模块加载失败
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True

_backendDir = Path(__file__).parent
for _cache in _backendDir.rglob("__pycache__"):
    shutil.rmtree(_cache, ignore_errors=True)

if __name__ == "__main__":
    import uvicorn

    # NOTE: 生产环境关闭 reload，通过 ENV 环境变量控制
    _isProd = os.environ.get("ENV", "development") == "production"
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=not _isProd,
    )
