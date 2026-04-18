# NOTE: RESTful API 路由层统一入口
from api.auth import router as authRouter
from api.users import router as usersRouter
from api.credits import router as creditsRouter
from api.orders import router as ordersRouter
from api.admin import router as adminRouter
from api.assets import router as assetsRouter
from api.config import router as configRouter
from api.libraries import router as librariesRouter

__all__ = [
    "authRouter",
    "usersRouter",
    "creditsRouter",
    "ordersRouter",
    "adminRouter",
    "assetsRouter",
    "configRouter",
    "librariesRouter",
]
