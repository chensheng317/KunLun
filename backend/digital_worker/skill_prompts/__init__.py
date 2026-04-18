"""
内置指令 Prompt 注册表

KEY 与前端 skill_id 一一对应，由 start_task 消息中的 skill_id 字段路由。
每个 prompt 模块还导出 RECOMMENDED_MAX_STEPS 用于覆盖默认步数。
"""

from digital_worker.skill_prompts.competitive_analysis import (
    SYSTEM_PROMPT as _P1,
    RECOMMENDED_MAX_STEPS as _S1,
)
from digital_worker.skill_prompts.human_simulation import (
    SYSTEM_PROMPT as _P2,
    RECOMMENDED_MAX_STEPS as _S2,
)
from digital_worker.skill_prompts.video_review import (
    SYSTEM_PROMPT as _P3,
    RECOMMENDED_MAX_STEPS as _S3,
)
from digital_worker.skill_prompts.wechat_reply import (
    SYSTEM_PROMPT as _P4,
    RECOMMENDED_MAX_STEPS as _S4,
)
from digital_worker.skill_prompts.shop_diagnosis import (
    SYSTEM_PROMPT as _P5,
    RECOMMENDED_MAX_STEPS as _S5,
)
from digital_worker.skill_prompts.content_publish import (
    SYSTEM_PROMPT as _P6,
    RECOMMENDED_MAX_STEPS as _S6,
)

SKILL_PROMPTS: dict[str, str] = {
    "competitive_analysis": _P1,
    "human_simulation": _P2,
    "video_review": _P3,
    "wechat_reply": _P4,
    "shop_diagnosis": _P5,
    "content_publish": _P6,
}

SKILL_MAX_STEPS: dict[str, int] = {
    "competitive_analysis": _S1,
    "human_simulation": _S2,
    "video_review": _S3,
    "wechat_reply": _S4,
    "shop_diagnosis": _S5,
    "content_publish": _S6,
}
