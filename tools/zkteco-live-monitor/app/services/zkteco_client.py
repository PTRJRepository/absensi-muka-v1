"""
ZKTeco client service.

The Python desktop app stays small and local, while the actual ZKTeco protocol
calls go through zkteco_bridge.cjs. The bridge uses the repo's proven
node-zklib dependency and exposes read-only actions only.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, List, Optional, Tuple


class AttendanceEventType(Enum):
    CHECK_IN = "CHECK_IN"
    CHECK_OUT = "CHECK_OUT"
    UNKNOWN = "UNKNOWN"


@dataclass
class AttendanceRecord:
    timestamp: str
    raw_uid: int
    raw_id: str
    event_type: AttendanceEventType
    raw_data: dict[str, Any]


@dataclass
class UserRecord:
    uid: int
    user_id: str
    name: str
    card: int
    role: int
    password: str


@dataclass
class DeviceInfo:
    firmware_version: str
    serial_number: str
    device_time: str
    capacity: int
    users_count: int
    attendance_count: int
    mac_address: str


@dataclass
class ConnectionResult:
    success: bool
    message: str
    device_info: Optional[DeviceInfo] = None
    error_code: Optional[str] = None


TOOL_ROOT = Path(__file__).resolve().parents[2]
BRIDGE_PATH = TOOL_ROOT / "zkteco_bridge.cjs"


def _first_value(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value in (None, ""):
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _format_timestamp(value: Any) -> str:
    if value in (None, ""):
        return ""
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return str(value)


def _event_type(value: Any) -> AttendanceEventType:
    normalized = str(value).strip().lower()
    if normalized in {"0", "in", "check_in", "checkin", "check-in"}:
        return AttendanceEventType.CHECK_IN
    if normalized in {"1", "out", "check_out", "checkout", "check-out", "5"}:
        return AttendanceEventType.CHECK_OUT
    return AttendanceEventType.UNKNOWN


def _parse_json_stdout(stdout: str) -> dict[str, Any]:
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue
    raise ValueError("Bridge did not return JSON output.")


class ZKTecoClient:
    """Read-only ZKTeco client used by the desktop app."""

    def __init__(
        self,
        ip: str,
        port: int = 4370,
        password: str = "12345",
        timeout_ms: int = 30000,
    ):
        self.ip = ip
        self.port = int(port)
        self.password = password or "12345"
        self.timeout_ms = timeout_ms
        self._connected = False
        self._last_info: Optional[DeviceInfo] = None
        self._user_count = 0
        self._attendance_count = 0

    def _run_bridge(self, action: str, max_records: int | None = None) -> dict[str, Any]:
        if not BRIDGE_PATH.exists():
            return {
                "success": False,
                "error": {
                    "code": "BRIDGE_NOT_FOUND",
                    "message": f"Bridge script not found: {BRIDGE_PATH}",
                },
            }

        command = [
            "node",
            str(BRIDGE_PATH),
            "--action",
            action,
            "--ip",
            self.ip,
            "--port",
            str(self.port),
            "--password",
            self.password,
            "--timeout",
            str(self.timeout_ms),
        ]
        if max_records is not None and max_records > 0:
            command.extend(["--max-records", str(max_records)])

        try:
            completed = subprocess.run(
                command,
                cwd=str(TOOL_ROOT),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=max((self.timeout_ms / 1000) * 3, (self.timeout_ms / 1000) + 10),
            )
        except FileNotFoundError:
            return {
                "success": False,
                "error": {
                    "code": "NODE_NOT_FOUND",
                    "message": "Node.js is required because this tool uses node-zklib for machine protocol access.",
                },
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": {
                    "code": "TIMEOUT",
                    "message": f"Timed out connecting to {self.ip}:{self.port}",
                },
            }

        stdout = completed.stdout or ""
        stderr = (completed.stderr or "").strip()

        try:
            payload = _parse_json_stdout(stdout)
        except ValueError:
            return {
                "success": False,
                "error": {
                    "code": "BRIDGE_ERROR",
                    "message": stderr or stdout.strip() or "No bridge output.",
                },
            }

        if completed.returncode not in (0, 2) and payload.get("success") is not True:
            payload.setdefault("error", {})
            payload["error"].setdefault("code", "BRIDGE_ERROR")
            payload["error"].setdefault("message", stderr or "Bridge command failed.")
        return payload

    def _error_result(self, payload: dict[str, Any]) -> ConnectionResult:
        error = payload.get("error") or {}
        code = str(error.get("code") or "UNKNOWN_ERROR")
        message = str(error.get("message") or payload.get("message") or "Unknown ZKTeco error")
        return ConnectionResult(False, f"{code}: {message}", error_code=code)

    def connect(self) -> ConnectionResult:
        """Test a real ZKTeco protocol connection."""
        payload = self._run_bridge("test")
        if not payload.get("success"):
            self._connected = False
            return self._error_result(payload)

        self._connected = True
        info_payload = (payload.get("data") or {}).get("info") or {}
        if isinstance(info_payload, dict):
            self._last_info = self._normalize_device_info(info_payload)
        return ConnectionResult(
            success=True,
            message=str(payload.get("message") or f"Connected to {self.ip}:{self.port}"),
            device_info=self._last_info,
        )

    async def connect_async(self) -> ConnectionResult:
        return await asyncio.to_thread(self.connect)

    def disconnect(self):
        """Bridge calls are stateless; this only clears local state."""
        self._connected = False

    def _ensure_connected(self) -> Tuple[bool, str]:
        if self._connected:
            return True, ""
        result = self.connect()
        return result.success, result.message

    async def get_users_async(self) -> Tuple[bool, List[UserRecord], str]:
        return await asyncio.to_thread(self.get_users)

    def get_users(self) -> Tuple[bool, List[UserRecord], str]:
        ok, message = self._ensure_connected()
        if not ok:
            return False, [], message

        payload = self._run_bridge("users")
        if not payload.get("success"):
            return False, [], self._error_result(payload).message

        data = payload.get("data") or {}
        raw_users = data.get("users") if isinstance(data, dict) else []
        users = [self._normalize_user(item) for item in raw_users if isinstance(item, dict)]
        self._user_count = int(data.get("count") or len(users))
        return True, users, f"Retrieved {len(users)}/{self._user_count} users"

    async def get_attendance_async(
        self,
        callback: Optional[Callable] = None,
        max_records: int = 1000,
    ) -> Tuple[bool, List[AttendanceRecord], str]:
        return await asyncio.to_thread(self.get_attendance, callback, max_records)

    def get_attendance(
        self,
        callback: Optional[Callable] = None,
        max_records: int = 1000,
    ) -> Tuple[bool, List[AttendanceRecord], str]:
        ok, message = self._ensure_connected()
        if not ok:
            return False, [], message

        payload = self._run_bridge("attendance", max_records=max_records)
        if not payload.get("success"):
            return False, [], self._error_result(payload).message

        data = payload.get("data") or {}
        raw_records = data.get("records") if isinstance(data, dict) else []
        records = [
            self._normalize_attendance(item)
            for item in raw_records
            if isinstance(item, dict)
        ]
        self._attendance_count = int(data.get("count") or len(records))
        for record in records:
            if callback:
                callback(record)
        return True, records, f"Retrieved {len(records)}/{self._attendance_count} attendance records"

    def get_machine_time(self) -> Tuple[bool, str]:
        info = self.get_device_info()
        if not info:
            return False, "Unable to read machine time"
        return True, info.device_time

    def sync_time(self) -> Tuple[bool, str]:
        return False, "Sync Time is disabled in this read-only checker."

    async def sync_time_async(self) -> Tuple[bool, str]:
        return await asyncio.to_thread(self.sync_time)

    def get_device_info(self) -> Optional[DeviceInfo]:
        ok, message = self._ensure_connected()
        if not ok:
            return None

        payload = self._run_bridge("info")
        if not payload.get("success"):
            return self._last_info

        info_payload = (payload.get("data") or {}).get("info") or {}
        if isinstance(info_payload, dict):
            self._last_info = self._normalize_device_info(info_payload)
        return self._last_info

    async def get_device_info_async(self) -> Optional[DeviceInfo]:
        return await asyncio.to_thread(self.get_device_info)

    def clear_attendance_logs(self) -> Tuple[bool, str]:
        return False, "Clear Attendance is disabled in this read-only checker."

    def clear_all_users(self) -> Tuple[bool, str]:
        return False, "Clear Users is disabled in this read-only checker."

    def reboot(self) -> Tuple[bool, str]:
        return False, "Reboot is disabled in this read-only checker."

    def is_connected(self) -> bool:
        return self._connected

    def _normalize_user(self, raw: dict[str, Any]) -> UserRecord:
        user_id = str(_first_value(
            raw,
            "userId",
            "user_id",
            "userid",
            "deviceUserId",
            "device_user_id",
            "uid",
            default="",
        ))
        return UserRecord(
            uid=_safe_int(_first_value(raw, "uid", "userSn", "user_sn", default=0)),
            user_id=user_id,
            name=str(_first_value(raw, "name", "username", "userName", default="")),
            card=_safe_int(_first_value(raw, "card", "cardno", "cardNo", default=0)),
            role=_safe_int(_first_value(raw, "role", "privilege", default=0)),
            password=str(_first_value(raw, "password", default="")),
        )

    def _normalize_attendance(self, raw: dict[str, Any]) -> AttendanceRecord:
        raw_id = str(_first_value(
            raw,
            "deviceUserId",
            "device_user_id",
            "userId",
            "user_id",
            "userid",
            "id",
            "uid",
            default="",
        ))
        timestamp = _format_timestamp(_first_value(
            raw,
            "recordTime",
            "record_time",
            "timestamp",
            "time",
            "punchTime",
            "punch_time",
            default="",
        ))
        event_value = _first_value(raw, "type", "status", "punch", "punchState", "punch_state", default="")
        return AttendanceRecord(
            timestamp=timestamp,
            raw_uid=_safe_int(_first_value(raw, "uid", "userSn", "user_sn", default=0)),
            raw_id=raw_id,
            event_type=_event_type(event_value),
            raw_data=raw,
        )

    def _normalize_device_info(self, raw: dict[str, Any]) -> DeviceInfo:
        return DeviceInfo(
            firmware_version=str(_first_value(raw, "firmwareVersion", "firmware", "version", default="Unknown")),
            serial_number=str(_first_value(raw, "serialNumber", "serial", "sn", default="Unknown")),
            device_time=_format_timestamp(_first_value(raw, "deviceTime", "time", "clock", default=datetime.now().isoformat())),
            capacity=_safe_int(_first_value(raw, "capacity", "maxUser", default=0)),
            users_count=_safe_int(_first_value(raw, "usersCount", "userCount", default=self._user_count)),
            attendance_count=_safe_int(_first_value(raw, "attendanceCount", "logCount", default=self._attendance_count)),
            mac_address=str(_first_value(raw, "macAddress", "mac", default="Unknown")),
        )


class ZKTecoConnectionPool:
    """Small compatibility wrapper for existing UI code."""

    def __init__(self):
        self._connections: dict[str, ZKTecoClient] = {}

    async def test_connection(self, ip: str, port: int = 4370, password: str = "12345") -> ConnectionResult:
        client = ZKTecoClient(ip, port, password)
        result = await client.connect_async()
        key = f"{ip}:{port}"
        self._connections[key] = client
        return result

    def close_all(self):
        for client in self._connections.values():
            client.disconnect()
        self._connections.clear()


connection_pool = ZKTecoConnectionPool()
