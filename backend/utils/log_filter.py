"""
日志脱敏过滤器

NOTE: Phase 2.5 安全要求 — 自动过滤日志中可能泄露的敏感信息
      - API Key / Secret Key 模式替换为 ***REDACTED***
      - JWT Token 模式替换为 [JWT_TOKEN]
      - 密码字段模式替换为 ********
"""
import re
import logging


class SensitiveDataFilter(logging.Filter):
    """
    日志脱敏过滤器

    NOTE: 挂载到根 logger 后，所有日志记录中的敏感模式会被自动替换
          不影响应用逻辑，仅影响日志输出
    """

    # 编译正则（只编译一次，提升性能）
    _PATTERNS = [
        # 火山引擎 Access Key（AKLT 开头）
        (re.compile(r'AKLT[A-Za-z0-9+/=]{20,}'), '***AK_REDACTED***'),
        # 火山引擎 Secret Key（Base64 长串）
        (re.compile(r'[A-Za-z0-9+/=]{40,}'), '***SK_REDACTED***'),
        # Coze API Token（pat_ 开头）
        (re.compile(r'pat_[A-Za-z0-9_\-]{20,}'), '***COZE_TOKEN_REDACTED***'),
        # JWT Token（eyJ 开头的 Base64 编码）
        (re.compile(r'eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+'), '[JWT_TOKEN]'),
        # Authorization: Bearer xxx
        (re.compile(r'(?i)(bearer\s+)[A-Za-z0-9_\-\.]+'), r'\1[REDACTED]'),
        # password=xxx 或 password: xxx（URL 或日志中）
        (re.compile(r'(?i)(password["\s:=]+)[^\s,}"\']+'), r'\1********'),
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        """
        过滤日志记录中的敏感信息

        NOTE: 返回 True 表示保留该日志（我们不丢弃日志，只替换内容）
        """
        if isinstance(record.msg, str):
            msg = record.msg
            for pattern, replacement in self._PATTERNS:
                msg = pattern.sub(replacement, msg)
            record.msg = msg

        # 同时处理 args 中的字符串参数
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: self._redactValue(v) for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(self._redactValue(a) for a in record.args)

        return True

    def _redactValue(self, value):
        """对单个值执行脱敏"""
        if isinstance(value, str):
            for pattern, replacement in self._PATTERNS:
                value = pattern.sub(replacement, value)
        return value


def installLogFilter() -> None:
    """
    将脱敏过滤器安装到根 logger

    NOTE: 在应用启动时调用一次即可（app.py lifespan 中）
    """
    rootLogger = logging.getLogger()
    rootLogger.addFilter(SensitiveDataFilter())
    logging.getLogger(__name__).info("Sensitive data log filter installed")
