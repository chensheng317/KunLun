"""
ADB 设备发现与管理

NOTE: 参考 已经实现多设备的应用/multi_device.py 的设备发现模式，
      过滤 mDNS 自动发现的重复项，查询设备真实型号和品牌。
"""

import logging
import subprocess
from typing import Optional

from digital_worker.schemas import DeviceInfo, DeviceStatus

logger = logging.getLogger(__name__)

# 正在执行任务的设备 ID 集合，由 TaskManager 维护
_busy_devices: set[str] = set()


def mark_device_busy(device_id: str) -> None:
    """标记设备为忙碌状态"""
    _busy_devices.add(device_id)


def mark_device_free(device_id: str) -> None:
    """标记设备为空闲状态"""
    _busy_devices.discard(device_id)


def get_connected_devices() -> list[DeviceInfo]:
    """
    动态检测所有已连接的 ADB 设备

    返回真实设备 ID、型号、品牌、状态。
    过滤 mDNS 自动发现的重复条目（如 adb-xxx._adb-tls-connect._tcp）。
    """
    try:
        result = subprocess.run(
            ["adb", "devices"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except FileNotFoundError:
        logger.error("ADB is not installed or not in PATH")
        return []
    except subprocess.TimeoutExpired:
        logger.error("adb devices command timed out")
        return []

    lines = result.stdout.strip().split("\n")
    devices: list[DeviceInfo] = []

    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) < 2:
            continue

        device_id, adb_status = parts[0], parts[1]

        # 过滤 mDNS 自动发现条目（与 IP:PORT 连接是同一台设备的重复项）
        if "_adb-tls-connect._tcp" in device_id:
            continue

        # 只保留在线设备
        if adb_status != "device":
            continue

        # 查询设备详细信息
        model = _get_device_property(device_id, "ro.product.model")
        brand = _get_device_property(device_id, "ro.product.brand")

        # 判断设备是否忙碌
        status = (
            DeviceStatus.BUSY
            if device_id in _busy_devices
            else DeviceStatus.ONLINE
        )

        devices.append(DeviceInfo(
            id=device_id,
            model=model or "Unknown",
            brand=brand or "Unknown",
            status=status,
        ))

    return devices


def get_device_info(device_id: str) -> Optional[DeviceInfo]:
    """获取单个设备的详细信息"""
    devices = get_connected_devices()
    for device in devices:
        if device.id == device_id:
            return device
    return None


def is_device_available(device_id: str) -> bool:
    """检查设备是否可用（在线且未忙碌）"""
    device = get_device_info(device_id)
    if device is None:
        return False
    return device.status == DeviceStatus.ONLINE


def _get_device_property(device_id: str, prop_name: str) -> str:
    """
    通过 adb shell getprop 获取设备属性

    Args:
        device_id: ADB 设备 ID
        prop_name: 属性名称，如 ro.product.model
    """
    try:
        result = subprocess.run(
            ["adb", "-s", device_id, "shell", "getprop", prop_name],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip()
    except Exception:
        return ""
