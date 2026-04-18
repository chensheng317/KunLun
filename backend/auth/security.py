"""
密码安全模块

NOTE: 直接使用 bcrypt 库进行密码哈希和验证（提醒.md #16 第一层防护）
      避免 passlib 与新版 bcrypt 的兼容性问题
      - 注册 / 改密时调用 hashPassword
      - 登录时调用 verifyPassword
      - password_hash 永不通过 API 返回前端
"""
import bcrypt


def hashPassword(plainPassword: str) -> str:
    """
    将明文密码哈希为 bcrypt 格式字符串

    @param plainPassword 用户输入的明文密码
    @returns bcrypt 哈希后的字符串（含盐值，约 60 个字符）
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plainPassword.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verifyPassword(plainPassword: str, hashedPassword: str) -> bool:
    """
    验证明文密码是否与哈希匹配

    @param plainPassword 用户输入的明文密码
    @param hashedPassword 数据库中存储的 bcrypt 哈希
    @returns 密码是否正确
    """
    return bcrypt.checkpw(
        plainPassword.encode("utf-8"),
        hashedPassword.encode("utf-8"),
    )
