"""
ZKTeco Live Monitor.

Small read-only desktop checker for direct attendance-machine diagnostics.
"""

from __future__ import annotations

import asyncio
import calendar
import json
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Callable

import flet as ft
from flet import icons as flet_icons

from app.services.config import Machine, load_machines
from app.services.zkteco_client import AttendanceEventType, AttendanceRecord, UserRecord, ZKTecoClient
from app.theme import AppTheme, StatusColors


MAX_OUTPUT_LINES = 120
TOOL_ROOT = Path(__file__).resolve().parent


def attendance_key_variants(value: object) -> list[str]:
    text = "".join(ch for ch in str(value or "").strip().upper() if ch.isalnum())
    if not text:
        return []

    variants = [text]
    stripped = text.lstrip("0")
    if stripped:
        variants.append(stripped)

    digits = "".join(ch for ch in text if ch.isdigit())
    if digits:
        digit_stripped = digits.lstrip("0")
        variants.append(digit_stripped or digits)

    return list(dict.fromkeys(variants))


def parse_attendance_datetime(record: AttendanceRecord) -> datetime | None:
    candidates = [
        record.timestamp,
        record.raw_data.get("recordTime"),
        record.raw_data.get("record_time"),
        record.raw_data.get("timestamp"),
        record.raw_data.get("time"),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        text = str(candidate).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
            return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
                try:
                    return datetime.strptime(text, fmt)
                except ValueError:
                    continue
    return None


def build_user_lookup(users: list[UserRecord]) -> dict[str, UserRecord]:
    lookup: dict[str, UserRecord] = {}
    for user in users:
        for key in attendance_key_variants(user.user_id):
            lookup.setdefault(key, user)
        for key in attendance_key_variants(user.uid):
            lookup.setdefault(key, user)
    return lookup


def resolve_attendance_user(record: AttendanceRecord, user_lookup: dict[str, UserRecord]) -> UserRecord | None:
    for candidate in (record.raw_id, record.raw_uid):
        for key in attendance_key_variants(candidate):
            user = user_lookup.get(key)
            if user:
                return user
    return None


def attendance_record_id(record: AttendanceRecord) -> str:
    if record.raw_id:
        return record.raw_id
    if record.raw_uid:
        return f"#{record.raw_uid}"
    return "Unknown"


def summarize_attendance_cell(entries: list[tuple[AttendanceRecord, datetime]]) -> dict[str, str]:
    ordered = sorted(entries, key=lambda item: item[1])
    times = [dt.strftime("%H:%M") for _, dt in ordered if dt]
    count = len(times)

    if count <= 0:
        return {
            "primary": "—",
            "secondary": "No scan",
            "bgcolor": "#0D1117",
            "border": AppTheme.SURFACE_LIGHT,
            "secondary_color": AppTheme.TEXT_SECONDARY,
        }

    if count == 1:
        primary = times[0]
        secondary = "1 scan"
        bgcolor = "#2A2410"
        border = "#A66A00"
        secondary_color = "#F5D58B"
    elif count < 4:
        primary = f"{times[0]} - {times[-1]}"
        secondary = f"{count} scans"
        bgcolor = "#10311F"
        border = "#2E7D32"
        secondary_color = "#A5D6A7"
    else:
        primary = f"{times[0]} - {times[-1]}"
        secondary = f"{count} scans"
        bgcolor = "#15305A"
        border = "#4DA3FF"
        secondary_color = "#B5D5FF"

    return {
        "primary": primary,
        "secondary": secondary,
        "bgcolor": bgcolor,
        "border": border,
        "secondary_color": secondary_color,
    }


def make_border(color: str) -> ft.Border:
    return ft.Border(
        left=ft.BorderSide(1, color),
        top=ft.BorderSide(1, color),
        right=ft.BorderSide(1, color),
        bottom=ft.BorderSide(1, color),
    )


def build_attendance_calendar_model(
    records: list[AttendanceRecord],
    users: list[UserRecord] | None = None,
) -> dict[str, object]:
    user_lookup = build_user_lookup(users or [])
    valid_items: list[tuple[AttendanceRecord, datetime]] = []
    invalid_items: list[tuple[AttendanceRecord, datetime | None]] = []

    for record in records:
        parsed = parse_attendance_datetime(record)
        if parsed is None or parsed.year < 2000:
            invalid_items.append((record, parsed))
            continue
        valid_items.append((record, parsed))

    if not valid_items:
        raw_preview: list[dict[str, object]] = []
        for record, parsed in invalid_items[:12]:
            resolved_user = resolve_attendance_user(record, user_lookup)
            raw_preview.append(
                {
                    "timestamp": record.timestamp or (parsed.strftime("%Y-%m-%d %H:%M:%S") if parsed else "-"),
                    "display_name": (resolved_user.name if resolved_user and resolved_user.name else "Unknown user"),
                    "display_id": resolved_user.user_id if resolved_user and resolved_user.user_id else attendance_record_id(record),
                }
            )

        return {
            "mode": "raw",
            "record_count": len(records),
            "warnings": [f"{len(invalid_items)} record(s) had invalid timestamps and were hidden from the calendar."],
            "raw_preview": raw_preview,
        }

    month_counter = Counter((parsed.year, parsed.month) for _, parsed in valid_items)
    selected_year, selected_month = max(month_counter.items(), key=lambda item: (item[1], item[0][0], item[0][1]))[0]
    selected_items = [
        (record, parsed)
        for record, parsed in valid_items
        if (parsed.year, parsed.month) == (selected_year, selected_month)
    ]
    month_label = datetime(selected_year, selected_month, 1).strftime("%B %Y")
    days_in_month = calendar.monthrange(selected_year, selected_month)[1]
    days = [date(selected_year, selected_month, day) for day in range(1, days_in_month + 1)]

    rows_map: dict[str, dict[str, object]] = {}
    unmapped_count = 0
    for record, parsed in selected_items:
        resolved_user = resolve_attendance_user(record, user_lookup)
        if resolved_user:
            display_name = (resolved_user.name or resolved_user.user_id or "Unknown user").strip() or "Unknown user"
            display_id = (resolved_user.user_id or attendance_record_id(record)).strip()
            matched = True
        else:
            display_name = "Unknown user"
            display_id = attendance_record_id(record)
            matched = False
            unmapped_count += 1

        row_key = f"{'|'.join(attendance_key_variants(display_name))}|{'|'.join(attendance_key_variants(display_id))}"
        row = rows_map.setdefault(
            row_key,
            {
                "display_name": display_name,
                "display_id": display_id,
                "matched": matched,
                "scan_count": 0,
                "cells": defaultdict(list),
            },
        )

        row["matched"] = bool(row["matched"]) or matched
        row["scan_count"] = int(row["scan_count"]) + 1
        row["cells"][parsed.date()].append((record, parsed))

    rows: list[dict[str, object]] = []
    for row in rows_map.values():
        day_cells: dict[date, dict[str, str]] = {}
        cells = row.pop("cells")
        for day in days:
            entries = cells.get(day, [])
            if entries:
                day_cells[day] = summarize_attendance_cell(entries)
        row["day_cells"] = day_cells
        row["present_days"] = len(day_cells)
        rows.append(row)

    rows.sort(key=lambda item: ((item["display_name"] or "").lower(), (item["display_id"] or "").lower()))

    warnings: list[str] = []
    hidden_other_months = len(valid_items) - len(selected_items)
    if hidden_other_months > 0:
        warnings.append(f"{hidden_other_months} record(s) from other month(s) were hidden from the calendar.")
    if invalid_items:
        warnings.append(f"{len(invalid_items)} record(s) had invalid timestamps and were omitted.")

    return {
        "mode": "calendar",
        "month_label": month_label,
        "days": days,
        "rows": rows,
        "warnings": warnings,
        "record_count": len(records),
        "selected_record_count": len(selected_items),
        "invalid_record_count": len(invalid_items),
        "unmapped_count": unmapped_count,
    }


def build_attendance_matrix(records: list[AttendanceRecord], users: list[UserRecord] | None = None):
    model = build_attendance_calendar_model(records, users)

    warnings = model.get("warnings") or []
    warning_controls: list[ft.Control] = []
    for warning in warnings:
        warning_controls.append(ft.Text(warning, size=11, color=AppTheme.WARNING))

    if model.get("mode") != "calendar":
        preview = model.get("raw_preview") or []
        controls: list[ft.Control] = warning_controls[:]
        controls.append(ft.Text("No valid calendar timestamps were returned. Showing raw logs instead.", size=11, color=AppTheme.TEXT_SECONDARY))
        for item in preview:
            controls.append(
                ft.Container(
                    content=ft.Row(
                        [
                            ft.Container(
                                width=210,
                                content=ft.Column(
                                    [
                                        ft.Text(str(item.get("display_name") or "Unknown user"), size=11, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                                        ft.Text(str(item.get("display_id") or "-"), size=10, color=AppTheme.ACCENT, font_family="Consolas"),
                                    ],
                                    spacing=0,
                                ),
                            ),
                            ft.Container(expand=True, content=ft.Text(str(item.get("timestamp") or "-"), size=11, color=AppTheme.TEXT_SECONDARY, font_family="Consolas")),
                        ],
                        spacing=12,
                    ),
                    padding=8,
                    border_radius=6,
                    bgcolor="#0D1117",
                )
            )
        return controls

    days = model["days"] or []
    rows = model["rows"] or []
    month_label = model["month_label"] or "Attendance calendar"

    name_width = 200
    id_width = 104
    scans_width = 62
    day_width = 74
    header_height = 68
    row_height = 68
    table_width = name_width + id_width + scans_width + (len(days) * day_width)

    def text_cell(value: str, *, size: int, color: str, weight=None, font_family=None, max_lines: int = 1):
        return ft.Text(
            value,
            size=size,
            color=color,
            weight=weight,
            font_family=font_family,
            max_lines=max_lines,
            no_wrap=True,
            overflow=ft.TextOverflow.ELLIPSIS,
            text_align=ft.TextAlign.CENTER,
        )

    def header_block(title: str, subtitle: str | None, width: int) -> ft.Container:
        content: list[ft.Control] = [text_cell(title, size=10, color=AppTheme.TEXT_PRIMARY, weight=ft.FontWeight.BOLD)]
        if subtitle:
            content.append(text_cell(subtitle, size=7, color=AppTheme.TEXT_SECONDARY))
        return ft.Container(
            width=width,
            height=header_height,
            padding=4,
            alignment=ft.alignment.Alignment(0, 0),
            bgcolor=AppTheme.SURFACE_LIGHT,
            border=make_border(AppTheme.SURFACE_LIGHT),
            content=ft.Column(
                content,
                spacing=0,
                alignment=ft.MainAxisAlignment.CENTER,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            ),
        )

    def row_block(value: str, width: int, *, accent: bool = False) -> ft.Container:
        return ft.Container(
            width=width,
            height=row_height,
            padding=6,
            alignment=ft.alignment.Alignment(0, 0),
            bgcolor="#0D1117",
            border=make_border(AppTheme.SURFACE_LIGHT),
            content=ft.Text(
                value,
                size=10 if not accent else 9,
                color=AppTheme.ACCENT if accent else AppTheme.TEXT_PRIMARY,
                weight=ft.FontWeight.BOLD if not accent else None,
                font_family="Consolas" if accent else None,
                max_lines=1,
                no_wrap=True,
                overflow=ft.TextOverflow.ELLIPSIS,
                text_align=ft.TextAlign.CENTER,
            ),
        )

    def day_header(day: date) -> ft.Container:
        return ft.Container(
            width=day_width,
            height=header_height,
            padding=3,
            alignment=ft.alignment.Alignment(0, 0),
            bgcolor=AppTheme.SURFACE_LIGHT,
            border=make_border(AppTheme.SURFACE_LIGHT),
            content=ft.Column(
                [
                    text_cell(f"{day.day:02d}", size=10, color=AppTheme.TEXT_PRIMARY, weight=ft.FontWeight.BOLD),
                    text_cell(calendar.day_abbr[day.weekday()].upper(), size=7, color=AppTheme.TEXT_SECONDARY),
                ],
                spacing=0,
                alignment=ft.MainAxisAlignment.CENTER,
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            ),
        )

    def day_value_cell(summary: dict[str, str] | None) -> ft.Container:
        if summary:
            return ft.Container(
                width=day_width,
                height=row_height,
                padding=3,
                alignment=ft.alignment.Alignment(0, 0),
                border_radius=6,
                bgcolor=str(summary.get("bgcolor") or "#0D1117"),
                border=make_border(str(summary.get("border") or AppTheme.SURFACE_LIGHT)),
                content=ft.Column(
                    [
                        text_cell(str(summary.get("primary") or "—"), size=9, color=AppTheme.TEXT_PRIMARY, weight=ft.FontWeight.BOLD),
                        text_cell(str(summary.get("secondary") or ""), size=7, color=str(summary.get("secondary_color") or AppTheme.TEXT_SECONDARY)),
                    ],
                    spacing=0,
                    alignment=ft.MainAxisAlignment.CENTER,
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                ),
            )

        return ft.Container(
            width=day_width,
            height=row_height,
            padding=3,
            alignment=ft.alignment.Alignment(0, 0),
            border_radius=6,
            bgcolor="#0D1117",
            border=make_border(AppTheme.SURFACE_LIGHT),
            content=text_cell("—", size=11, color=AppTheme.TEXT_SECONDARY, weight=ft.FontWeight.BOLD),
        )

    header_row = ft.Row(
        [
            header_block("User name", "Employee", name_width),
            header_block("User ID", "Raw ID", id_width),
            header_block("Scans", "Total", scans_width),
            *[day_header(day) for day in days],
        ],
        spacing=0,
        wrap=False,
        vertical_alignment=ft.CrossAxisAlignment.CENTER,
    )

    data_rows: list[ft.Control] = []
    for row in rows:
        day_cells = row.get("day_cells") or {}
        row_cells = [
            ft.Container(
                width=name_width,
                height=row_height,
                padding=6,
                alignment=ft.alignment.Alignment(0, 0),
                bgcolor="#0D1117",
                border=make_border(AppTheme.SURFACE_LIGHT),
                content=ft.Column(
                    [
                        text_cell(str(row.get("display_name") or "Unknown user"), size=10, color=AppTheme.TEXT_PRIMARY, weight=ft.FontWeight.BOLD),
                        text_cell(str(row.get("display_id") or "-"), size=8, color=AppTheme.TEXT_SECONDARY, font_family="Consolas"),
                    ],
                    spacing=0,
                    alignment=ft.MainAxisAlignment.CENTER,
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                ),
            ),
            row_block(str(row.get("display_id") or "-"), id_width, accent=True),
            row_block(str(row.get("scan_count") or 0), scans_width),
            *[day_value_cell(day_cells.get(day)) for day in days],
        ]
        data_rows.append(
            ft.Row(
                row_cells,
                spacing=0,
                wrap=False,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            )
        )

    matrix_body = ft.ListView(
        controls=[header_row, *data_rows],
        spacing=0,
        padding=0,
        expand=True,
        auto_scroll=False,
    )
    matrix_scroll = ft.Row(
        [ft.Container(width=table_width, content=matrix_body)],
        spacing=0,
        scroll=ft.ScrollMode.AUTO,
        expand=True,
        vertical_alignment=ft.CrossAxisAlignment.START,
    )

    return [
        ft.Row(
            [
                ft.Text(f"Attendance calendar - {month_label}", size=11, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_SECONDARY),
                ft.Container(expand=True),
                ft.Text(
                    f"{len(rows)} user(s)  |  {model.get('selected_record_count') or 0} scan(s)",
                    size=11,
                    color=AppTheme.TEXT_SECONDARY,
                ),
            ]
        ),
        *warning_controls,
        ft.Container(
            height=460,
            padding=8,
            border_radius=6,
            bgcolor="#0D1117",
            content=matrix_scroll,
        ),
    ]


def main(page: ft.Page):
    page.title = "ZKTeco Live Monitor"
    page.window_width = 1300
    page.window_height = 900
    page.theme = AppTheme.get_theme()
    page.bgcolor = AppTheme.BACKGROUND
    page.padding = 18

    machines = [m for m in load_machines() if m.is_active]
    machine_status: dict[str, dict] = {}
    output_lines: list[str] = []
    current_detail_machine_code = ""

    output_text = ft.Text("", size=11, font_family="Consolas", selectable=True, color=AppTheme.TEXT_PRIMARY)
    online_count = ft.Text("0", size=28, weight=ft.FontWeight.BOLD, color=StatusColors.ONLINE)
    offline_count = ft.Text("0", size=28, weight=ft.FontWeight.BOLD, color=StatusColors.OFFLINE)
    detail_title = ft.Text("Select a machine", size=18, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY)
    detail_subtitle = ft.Text(
        "Click Monitor, Diagnostic, or Employee Search to use the panel below.",
        size=12,
        color=AppTheme.TEXT_SECONDARY,
    )
    detail_status = ft.Text("", size=12, color=AppTheme.TEXT_SECONDARY)
    detail_info = ft.Column([], spacing=6)
    detail_actions = ft.Row([], spacing=8, wrap=True)
    detail_records_title = ft.Text("Record preview", size=12, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_SECONDARY)
    detail_records = ft.Column(
        [ft.Text("Open Monitor or Diagnostic to use the panel below.", size=12, color=AppTheme.TEXT_SECONDARY)],
        spacing=4,
    )
    action_banner = ft.Text(
        "Ready. Click a machine to inspect live data.",
        size=12,
        color=AppTheme.TEXT_SECONDARY,
    )
    search_input = ft.TextField(
        label="Employee ID or name",
        hint_text="Example: A0044, 10044, 44, or employee name",
        autofocus=True,
        width=420,
    )
    main_layout: ft.Column | None = None
    machine_user_cache: dict[str, list[UserRecord]] = {}

    def log(message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        output_lines.insert(0, f"[{timestamp}] {message}")
        del output_lines[MAX_OUTPUT_LINES:]
        output_text.value = "\n".join(output_lines)
        page.update()

    async def scroll_to_detail_panel():
        await asyncio.sleep(0)
        if main_layout is not None:
            await main_layout.scroll_to(scroll_key="detail-panel", duration=250)
            page.update()

    def run_background(action: Callable[[], None]):
        def wrapped():
            try:
                action()
            except Exception as exc:
                log(f"ERROR: {exc}")

        page.run_thread(wrapped)

    def update_counters():
        online = sum(1 for m in machines if machine_status.get(m.code, {}).get("online", False))
        offline = len(machines) - online
        online_count.value = str(online)
        offline_count.value = str(offline)

    def set_machine_status(machine: Machine, color: str, label: str, online: bool):
        state = machine_status[machine.code]
        state["indicator"].bgcolor = color
        state["status_text"].value = label
        state["status_text"].color = color if online else AppTheme.TEXT_SECONDARY
        state["online"] = online
        update_counters()
        page.update()

    def check_machine(machine: Machine):
        def task():
            set_machine_status(machine, StatusColors.CONNECTING, "Checking", False)
            client = ZKTecoClient(machine.ip, machine.port, machine.password)
            result = client.connect()
            client.disconnect()
            if result.success:
                set_machine_status(machine, StatusColors.ONLINE, "Online", True)
                log(f"{machine.code}: ONLINE - {result.message}")
            else:
                set_machine_status(machine, StatusColors.OFFLINE, "Offline", False)
                log(f"{machine.code}: OFFLINE - {result.message}")

        return task

    def refresh_all(_=None):
        action_banner.value = "Checking all machines..."
        log("Checking all machines...")
        for machine in machines:
            run_background(check_machine(machine))
        page.update()

    def export_output(_=None):
        if not output_lines:
            log("Export skipped: output is empty")
            return
        export_dir = TOOL_ROOT / "exports"
        export_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        export_path = export_dir / f"diagnostic-output-{timestamp}.json"
        payload = {
            "exported_at": datetime.now().isoformat(timespec="seconds"),
            "machine_count": len(machines),
            "lines": list(reversed(output_lines)),
        }
        export_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        log(f"Exported output to {export_path}")

    def with_client(machine: Machine, operation: Callable[[ZKTecoClient], None]):
        client = ZKTecoClient(machine.ip, machine.port, machine.password)
        result = client.connect()
        if not result.success:
            log(f"{machine.code}: {result.message}")
            return
        try:
            operation(client)
        finally:
            client.disconnect()

    def get_users(machine: Machine):
        def task():
            action_banner.value = f"{machine.code}: fetching users..."
            log(f"{machine.code}: fetching enrolled users...")

            def operation(client: ZKTecoClient):
                success, users, message = client.get_users()
                log(f"{machine.code}: {message}")
                if success:
                    machine_user_cache[machine.code] = users
                    if current_detail_machine_code == machine.code:
                        detail_records_title.value = "Sample users"
                        detail_records.controls = build_user_preview(users)
                        page.update()
                    for user in users[:8]:
                        name = f" - {user.name}" if user.name else ""
                        log(f"{machine.code}: user {user.user_id}{name}")
                    if len(users) > 8:
                        log(f"{machine.code}: ... {len(users) - 8} more users")

            with_client(machine, operation)

        return task

    async def load_attendance(machine: Machine, max_records: int = 20):
        action_banner.value = f"{machine.code}: fetching attendance..."
        detail_status.value = "Loading attendance records..."
        page.update()
        log(f"{machine.code}: fetching attendance records...")

        client = ZKTecoClient(machine.ip, machine.port, machine.password)
        try:
            result = await client.connect_async()
            if not result.success:
                log(f"{machine.code}: {result.message}")
                if current_detail_machine_code == machine.code:
                    detail_status.value = result.message
                    action_banner.value = f"{machine.code}: attendance fetch failed"
                    page.update()
                return

            users = machine_user_cache.get(machine.code) or []
            if not users:
                user_success, users, user_message = await client.get_users_async()
                log(f"{machine.code}: {user_message}")
                if user_success:
                    machine_user_cache[machine.code] = users
                else:
                    users = []

            success, records, message = await client.get_attendance_async(max_records=max_records)
            log(f"{machine.code}: {message}")
            if not success:
                if current_detail_machine_code == machine.code:
                    detail_status.value = message
                    action_banner.value = f"{machine.code}: attendance fetch failed"
                    page.update()
                return

            if current_detail_machine_code == machine.code:
                detail_records_title.value = "Attendance matrix"
                detail_records.controls = build_attendance_matrix(records, users)
                detail_status.value = f"Loaded {len(records)} attendance records."
                action_banner.value = f"{machine.code}: attendance matrix loaded ({len(records)} rows)"
                page.update()

            for record in records[-8:]:
                if record.event_type == AttendanceEventType.CHECK_IN:
                    event = "IN"
                elif record.event_type == AttendanceEventType.CHECK_OUT:
                    event = "OUT"
                else:
                    event = "LOG"
                display_id = record.raw_id or (f"#{record.raw_uid}" if record.raw_uid else "Unknown")
                log(f"{machine.code}: {record.timestamp} | {display_id} | {event}")
        finally:
            client.disconnect()

    def get_info(machine: Machine):
        def task():
            action_banner.value = f"{machine.code}: fetching device info..."
            log(f"{machine.code}: fetching device info...")

            def operation(client: ZKTecoClient):
                info = client.get_device_info()
                if not info:
                    log(f"{machine.code}: device info unavailable")
                    return
                if current_detail_machine_code == machine.code:
                    detail_records_title.value = "Device info"
                    detail_records.controls = build_info_preview(info)
                    page.update()
                log(
                    f"{machine.code}: firmware={info.firmware_version}, "
                    f"serial={info.serial_number}, time={info.device_time}"
                )

            with_client(machine, operation)

        return task

    def set_detail_panel(title: str, subtitle: str, info_controls: list[ft.Control], action_controls: list[ft.Control], status: str = ""):
        nonlocal current_detail_machine_code
        detail_title.value = title
        detail_subtitle.value = subtitle
        detail_status.value = status
        action_banner.value = status or f"Opened {title}"
        detail_info.controls = info_controls
        detail_actions.controls = action_controls
        detail_records_title.value = "Record preview"
        detail_records.controls = [
            ft.Text("Open Monitor or Diagnostic to use the panel below.", size=12, color=AppTheme.TEXT_SECONDARY)
        ]
        current_detail_machine_code = ""
        page.update()
        page.run_task(scroll_to_detail_panel)

    def set_machine_detail_panel(
        machine: Machine,
        title: str,
        subtitle: str,
        info_controls: list[ft.Control],
        action_controls: list[ft.Control],
        status: str = "",
        record_title: str = "Record preview",
        record_controls: list[ft.Control] | None = None,
    ):
        nonlocal current_detail_machine_code
        detail_title.value = title
        detail_subtitle.value = subtitle
        detail_status.value = status
        action_banner.value = status or f"Opened {title}"
        detail_info.controls = info_controls
        detail_actions.controls = action_controls
        detail_records_title.value = record_title
        detail_records.controls = record_controls or [
            ft.Text("Open an action above to load live data.", size=12, color=AppTheme.TEXT_SECONDARY)
        ]
        current_detail_machine_code = machine.code
        page.update()
        page.run_task(scroll_to_detail_panel)

    def build_user_preview(users):
        preview: list[ft.Control] = []
        for user in users[:8]:
            preview.append(
                ft.Container(
                    content=ft.Row(
                        [
                            ft.Container(width=100, content=ft.Text(user.user_id or "-", size=11, font_family="Consolas", color=AppTheme.ACCENT)),
                            ft.Container(expand=True, content=ft.Text(user.name or "(no name)", size=11, color=AppTheme.TEXT_PRIMARY)),
                        ],
                        spacing=10,
                    ),
                    padding=8,
                    border_radius=6,
                    bgcolor="#0D1117",
                )
            )

        if not preview:
            preview.append(ft.Text("No users returned.", size=12, color=AppTheme.TEXT_SECONDARY))
        return preview

    def build_info_preview(info):
        return [
            ft.Text(f"Firmware: {info.firmware_version}", size=11, color=AppTheme.TEXT_PRIMARY, font_family="Consolas"),
            ft.Text(f"Serial: {info.serial_number}", size=11, color=AppTheme.TEXT_PRIMARY, font_family="Consolas"),
            ft.Text(f"Device time: {info.device_time}", size=11, color=AppTheme.TEXT_PRIMARY, font_family="Consolas"),
            ft.Text(f"Users count: {info.users_count}", size=11, color=AppTheme.TEXT_PRIMARY, font_family="Consolas"),
            ft.Text(f"Attendance count: {info.attendance_count}", size=11, color=AppTheme.TEXT_PRIMARY, font_family="Consolas"),
        ]

    def show_monitor(machine: Machine):
        def open_panel(_=None):
            action_banner.value = f"Monitor opened: {machine.code}"
            log(f"Monitor opened: {machine.code}")
            set_machine_detail_panel(
                machine,
                f"Monitor - {machine.code}",
                f"{machine.name} ({machine.ip}:{machine.port})",
                [
                    ft.Text("Fetches recent records only. Data remains on the machine.", size=12, color=AppTheme.TEXT_SECONDARY),
                    ft.Text("Use the buttons below to pull data now.", size=12, color=AppTheme.TEXT_SECONDARY),
                ],
                [
                    ft.Button("Get Recent Attendance", icon=flet_icons.Icons.EVENT_NOTE, on_click=lambda e: page.run_task(load_attendance, machine, 50)),
                    ft.Button("Get Users", icon=flet_icons.Icons.PEOPLE, on_click=lambda e: run_background(get_users(machine))),
                    ft.Button("Get Info", icon=flet_icons.Icons.INFO, on_click=lambda e: run_background(get_info(machine))),
                ],
                status="Monitor opened. Ready to fetch attendance.",
                record_title="Attendance matrix",
                record_controls=[ft.Text("Fetching recent attendance...", size=12, color=AppTheme.TEXT_SECONDARY)],
            )
            page.run_task(load_attendance, machine, 50)

        return open_panel

    def show_diagnostic(machine: Machine):
        def open_panel(_=None):
            action_banner.value = f"Diagnostic opened: {machine.code}"
            log(f"Diagnostic opened: {machine.code}")
            set_machine_detail_panel(
                machine,
                f"Diagnostic - {machine.code}",
                f"{machine.name} ({machine.ip}:{machine.port})",
                [
                    ft.Text("Read-only diagnostic actions.", size=12, color=AppTheme.TEXT_SECONDARY),
                ],
                [
                    ft.Button("Test Connection", icon=flet_icons.Icons.POWER, on_click=lambda e: run_background(check_machine(machine))),
                    ft.Button("Get Users", icon=flet_icons.Icons.PEOPLE, on_click=lambda e: run_background(get_users(machine))),
                    ft.Button("Get Attendance", icon=flet_icons.Icons.EVENT_NOTE, on_click=lambda e: page.run_task(load_attendance, machine, 100)),
                    ft.Button("Get Info", icon=flet_icons.Icons.INFO, on_click=lambda e: run_background(get_info(machine))),
                ],
                status="Diagnostic panel ready.",
                record_title="Diagnostic preview",
                record_controls=[ft.Text("Use an action above to load data into this preview.", size=12, color=AppTheme.TEXT_SECONDARY)],
            )

        return open_panel

    def search_employee(query: str):
        normalized = query.strip().lower()
        if not normalized:
            set_detail_panel(
                "Employee Search",
                "Search users directly from reachable machines.",
                [ft.Text("Enter a query before searching.", size=12, color=AppTheme.WARNING)],
                [],
                status="Query required.",
            )
            return

        def task():
            action_banner.value = f"Searching '{query}'..."
            found = 0
            errors = 0
            matches_text: list[str] = []
            log(f"Employee Search: searching '{query}' across {len(machines)} machines")
            for machine in machines:
                client = ZKTecoClient(machine.ip, machine.port, machine.password)
                result = client.connect()
                if not result.success:
                    errors += 1
                    log(f"Search {machine.code}: {result.message}")
                    continue
                try:
                    success, users, message = client.get_users()
                    if not success:
                        errors += 1
                        log(f"Search {machine.code}: {message}")
                        continue
                    matches = [
                        user for user in users
                        if normalized in user.user_id.lower()
                        or normalized in str(user.uid).lower()
                        or normalized in user.name.lower()
                    ]
                    if matches:
                        found += len(matches)
                        for user in matches[:5]:
                            log(f"FOUND {machine.code}: {user.user_id} - {user.name or '(no name)'}")
                            matches_text.append(f"{machine.code}: {user.user_id} - {user.name or '(no name)'}")
                    else:
                        log(f"Search {machine.code}: not found")
                finally:
                    client.disconnect()
            if not matches_text:
                matches_text = ["No matches found."]
            detail_records_title.value = "Search results"
            detail_records.controls = [ft.Text(line, size=12, color=AppTheme.TEXT_PRIMARY) for line in matches_text[:8]]
            detail_status.value = f"Found {found} match(es). Errors: {errors}"
            page.update()
            log(f"Employee Search done: found={found}, errors={errors}")

        run_background(task)

    def show_employee_search(_=None):
        action_banner.value = "Employee Search opened"
        log("Employee Search opened")
        search_input.value = ""
        set_detail_panel(
            "Employee Search",
            "Search users directly from reachable machines.",
            [
                search_input,
                ft.Text("Search accepts raw IDs or names and scans all active machines.", size=12, color=AppTheme.TEXT_SECONDARY),
            ],
            [
                ft.Button("Search", icon=flet_icons.Icons.SEARCH, on_click=lambda e: search_employee(search_input.value)),
                ft.Button(
                    "Clear Results",
                    icon=flet_icons.Icons.DELETE_OUTLINE,
                    on_click=lambda e: set_detail_panel(
                        "Employee Search",
                        "Search users directly from reachable machines.",
                        [search_input, ft.Text("Search accepts raw IDs or names and scans all active machines.", size=12, color=AppTheme.TEXT_SECONDARY)],
                        [],
                        status="Cleared.",
                    ),
                ),
            ],
            status="Enter a query and press Search.",
        )
        page.update()

    def create_machine_card(machine: Machine) -> ft.Container:
        indicator = ft.Container(width=14, height=14, border_radius=7, bgcolor=StatusColors.UNKNOWN)
        status_text = ft.Text("Unknown", size=12, color=AppTheme.TEXT_SECONDARY)
        machine_status[machine.code] = {
            "online": False,
            "indicator": indicator,
            "status_text": status_text,
        }

        return ft.Container(
            content=ft.Column(
                [
                    ft.Row([indicator, ft.Container(expand=True), status_text]),
                    ft.Container(height=8),
                    ft.Text(machine.code, size=20, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                    ft.Text(machine.name, size=11, color=AppTheme.TEXT_SECONDARY),
                    ft.Text(f"{machine.ip}:{machine.port}", size=10, color=AppTheme.ACCENT, font_family="Consolas"),
                    ft.Container(height=12),
                    ft.Row(
                        [
                            ft.Button("Monitor", icon=flet_icons.Icons.MONITOR, on_click=show_monitor(machine), expand=1),
                            ft.Button("Diagnostic", icon=flet_icons.Icons.BUILD, on_click=show_diagnostic(machine), expand=1),
                        ],
                        alignment=ft.MainAxisAlignment.CENTER,
                    ),
                ],
                spacing=0,
            ),
            padding=15,
            bgcolor=AppTheme.SURFACE,
            border_radius=8,
            width=290,
        )

    card_rows = []
    for i in range(0, len(machines), 4):
        cards = [create_machine_card(machine) for machine in machines[i:i + 4]]
        while len(cards) < 4:
            cards.append(ft.Container(width=290))
        card_rows.append(ft.Row(cards, spacing=15, wrap=False))

    main_layout = ft.Column(
        [
            ft.Row(
                [
                    ft.Text("ZKTeco Live Monitor", size=30, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                    ft.Container(expand=True),
                    ft.Button("Refresh All", icon=flet_icons.Icons.REFRESH, on_click=refresh_all),
                    ft.Button("Employee Search", icon=flet_icons.Icons.SEARCH, on_click=show_employee_search),
                ],
            ),
            ft.Container(height=14),
            ft.Container(
                content=ft.Row(
                    [
                        ft.Row([ft.Container(width=16, height=16, border_radius=8, bgcolor=StatusColors.ONLINE), ft.Text("Online:", color=AppTheme.TEXT_SECONDARY), online_count]),
                        ft.Container(width=36),
                        ft.Row([ft.Container(width=16, height=16, border_radius=8, bgcolor=StatusColors.OFFLINE), ft.Text("Offline:", color=AppTheme.TEXT_SECONDARY), offline_count]),
                        ft.Container(width=36),
                        ft.Text(f"Total: {len(machines)} machines", color=AppTheme.TEXT_SECONDARY),
                        ft.Container(expand=True),
                        ft.Text("READ-ONLY", color=AppTheme.SUCCESS, weight=ft.FontWeight.BOLD),
                    ]
                ),
                padding=14,
                bgcolor=AppTheme.SURFACE,
                border_radius=8,
            ),
            ft.Container(height=14),
            ft.Container(
                content=action_banner,
                padding=12,
                bgcolor=AppTheme.SURFACE_LIGHT,
                border_radius=8,
            ),
            ft.Container(height=14),
            ft.Container(
                content=ft.Column(
                    [
                        detail_title,
                        detail_subtitle,
                        ft.Container(height=8),
                        detail_status,
                        ft.Container(height=10),
                        detail_info,
                        ft.Container(height=12),
                        detail_actions,
                        ft.Container(height=12),
                        detail_records_title,
                        ft.Container(height=8),
                        detail_records,
                    ],
                    spacing=0,
                ),
                padding=14,
                bgcolor=AppTheme.SURFACE,
                border_radius=8,
                key="detail-panel",
            ),
            ft.Container(height=14),
            *card_rows,
            ft.Container(height=14),
            ft.Container(
                content=ft.Column(
                    [
                        ft.Row(
                            [
                                ft.Text("Output", weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                                ft.Container(expand=True),
                                ft.TextButton("Export", icon=flet_icons.Icons.DOWNLOAD, on_click=export_output),
                                ft.TextButton("Clear", on_click=lambda e: (output_lines.clear(), setattr(output_text, "value", ""), page.update())),
                            ]
                        ),
                        ft.Container(height=5),
                        ft.Container(content=output_text, bgcolor="#0D1117", padding=10, border_radius=6, height=220),
                    ]
                ),
                padding=10,
                bgcolor=AppTheme.SURFACE,
                border_radius=8,
            ),
        ],
        spacing=0,
        scroll=ft.ScrollMode.AUTO,
    )
    page.add(main_layout)

    update_counters()
    page.update()
    log("Ready. Click Refresh All or open Diagnostic on a machine.")


if __name__ == "__main__":
    ft.run(main)
