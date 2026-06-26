"""
Live Monitor View
Real-time attendance stream from a single machine
"""

import flet as ft
from flet import icons as flet_icons
import asyncio
from datetime import datetime
from typing import List, Callable
from app.services.config import Machine
from app.services.zkteco_client import ZKTecoClient, AttendanceRecord, AttendanceEventType
from app.theme import AppTheme, StatusColors


class MonitorView(ft.Container):
    """Live attendance monitor view"""

    def __init__(
        self,
        page: ft.Page,
        machines: List[Machine],
        show_dashboard: Callable,
        show_monitor: Callable,
        show_diagnostic: Callable,
        show_employee_search: Callable,
        machine: Machine,
    ):
        self._flet_page = page
        self.machine = machine
        self.show_dashboard = show_dashboard
        self.is_connected = False
        self.is_monitoring = False
        self.client = None
        self.records: List[AttendanceRecord] = []
        self.auto_scroll = True

        # Connection status
        self.status_indicator = ft.Container(
            width=12,
            height=12,
            border_radius=6,
            bgcolor=StatusColors.OFFLINE,
        )
        self.status_text = ft.Text(
            "Disconnected",
            size=12,
            color=AppTheme.TEXT_SECONDARY,
        )

        # Header
        header = ft.Row(
            controls=[
                ft.IconButton(
                    icon=flet_icons.Icons.ARROW_BACK,
                    on_click=lambda e: show_dashboard(),
                    icon_color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Text(
                    f"Live Monitor: {self.machine.code}",
                    size=22,
                    weight=ft.FontWeight.BOLD,
                    color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Container(expand=True),
                ft.Container(
                    content=ft.Row(
                        controls=[
                            self.status_indicator,
                            ft.Container(width=8),
                            self.status_text,
                        ],
                    ),
                ),
            ],
        )

        # Info bar
        info_bar = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Column(
                        controls=[
                            ft.Text("IP Address", size=10, color=AppTheme.TEXT_SECONDARY),
                            ft.Text(f"{self.machine.ip}:{self.machine.port}", size=14, color=AppTheme.ACCENT, font_family="Consolas"),
                        ],
                        spacing=0,
                    ),
                    ft.Container(width=30),
                    ft.Column(
                        controls=[
                            ft.Text("Division", size=10, color=AppTheme.TEXT_SECONDARY),
                            ft.Text(self.machine.division, size=14, color=AppTheme.TEXT_PRIMARY),
                        ],
                        spacing=0,
                    ),
                    ft.Container(width=30),
                    ft.Column(
                        controls=[
                            ft.Text("Scanner Code", size=10, color=AppTheme.TEXT_SECONDARY),
                            ft.Text(self.machine.scanner_code or "-", size=14, color=AppTheme.TEXT_PRIMARY),
                        ],
                        spacing=0,
                    ),
                ],
            ),
            padding=15,
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        # Controls
        self.start_button = ft.ElevatedButton(
            "Start Monitoring",
            icon=flet_icons.Icons.PLAY_ARROW,
            on_click=self._on_start_stop,
            style=ft.ButtonStyle(
                bgcolor=AppTheme.SUCCESS,
                color=AppTheme.TEXT_PRIMARY,
            ),
        )

        self.connect_button = ft.ElevatedButton(
            "Connect",
            icon=flet_icons.Icons.POWER,
            on_click=self._on_connect,
            style=ft.ButtonStyle(
                bgcolor=AppTheme.PRIMARY,
                color=AppTheme.TEXT_PRIMARY,
            ),
        )

        self.clear_button = ft.ElevatedButton(
            "Clear",
            icon=flet_icons.Icons.DELETE_OUTLINE,
            on_click=self._on_clear,
            style=ft.ButtonStyle(
                bgcolor=AppTheme.SURFACE_LIGHT,
                color=AppTheme.TEXT_PRIMARY,
            ),
        )

        self.auto_scroll_switch = ft.Switch(
            label="Auto-scroll",
            value=True,
            on_change=self._on_auto_scroll_change,
        )

        self.record_count = ft.Text(
            "0 records",
            size=14,
            color=AppTheme.TEXT_SECONDARY,
        )

        controls_bar = ft.Container(
            content=ft.Row(
                controls=[
                    self.connect_button,
                    self.start_button,
                    self.clear_button,
                    ft.Container(width=20),
                    self.auto_scroll_switch,
                    ft.Container(expand=True),
                    self.record_count,
                ],
            ),
            padding=15,
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        # Attendance list
        self.attendance_list = ft.ListView(
            expand=True,
            spacing=5,
            padding=10,
        )

        self.empty_state = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Icon(flet_icons.Icons.MONITOR_HEART, size=64, color=AppTheme.TEXT_SECONDARY),
                    ft.Container(height=10),
                    ft.Text(
                        "Not monitoring",
                        size=18,
                        color=AppTheme.TEXT_SECONDARY,
                    ),
                    ft.Text(
                        "Click 'Connect' then 'Start Monitoring' to begin",
                        size=14,
                        color=AppTheme.TEXT_SECONDARY,
                    ),
                ],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                alignment=ft.MainAxisAlignment.CENTER,
            ),
            expand=True,
            alignment=ft.alignment.center,
        )

        list_container = ft.Container(
            content=self.empty_state,
            expand=True,
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        # Safety warning
        safety_note = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Icon(flet_icons.Icons.INFO_OUTLINE, size=16, color=AppTheme.ACCENT),
                    ft.Text(
                        "READ-ONLY MODE: Attendance data is fetched only, never deleted from machine",
                        size=12,
                        color=AppTheme.ACCENT,
                    ),
                ],
            ),
            padding=10,
            border_radius=6,
            bgcolor=AppTheme.SURFACE_LIGHT,
        )

        # Layout
        content = ft.Column(
            controls=[
                header,
                ft.Container(height=15),
                info_bar,
                ft.Container(height=15),
                controls_bar,
                ft.Container(height=10),
                safety_note,
                ft.Container(height=10),
                list_container,
            ],
            spacing=0,
        )

        super().__init__(
            content=ft.Container(
                content=content,
                padding=20,
                bgcolor=AppTheme.BACKGROUND,
                expand=True,
            ),
            expand=True,
            bgcolor=AppTheme.BACKGROUND,
        )

    def _update_connection_status(self, connected: bool, message: str = ""):
        """Update connection status display"""
        self.is_connected = connected
        if connected:
            self.status_indicator.bgcolor = StatusColors.ONLINE
            self.status_text.value = "Connected"
            self.status_text.color = StatusColors.ONLINE
            self.connect_button.text = "Disconnect"
            self.connect_button.style.bgcolor = AppTheme.ERROR
        else:
            self.status_indicator.bgcolor = StatusColors.OFFLINE
            self.status_text.value = message or "Disconnected"
            self.status_text.color = AppTheme.TEXT_SECONDARY
            self.connect_button.text = "Connect"
            self.connect_button.style.bgcolor = AppTheme.PRIMARY
        self._flet_page.update()

    def _on_connect(self, e=None):
        """Connect/disconnect from machine"""
        if self.is_connected:
            if self.client:
                self.client.disconnect()
            self._update_connection_status(False, "Disconnected")
        else:
            self._update_connection_status(False, "Connecting...")
            asyncio.create_task(self._connect_async())

    async def _connect_async(self):
        """Async connect to machine"""
        self.client = ZKTecoClient(
            self.machine.ip,
            self.machine.port,
            self.machine.password
        )
        result = self.client.connect()
        if result.success:
            self._update_connection_status(True)
        else:
            self._update_connection_status(False, result.message)

    def _on_start_stop(self, e=None):
        """Start or stop monitoring"""
        if self.is_monitoring:
            self._stop_monitoring()
        else:
            self._start_monitoring()

    def _start_monitoring(self):
        """Start monitoring attendance"""
        if not self.is_connected or not self.client:
            self._on_connect(None)  # Auto-connect first
            return

        self.is_monitoring = True
        self.start_button.text = "Stop Monitoring"
        self.start_button.icon = flet_icons.Icons.STOP
        self.start_button.style.bgcolor = AppTheme.ERROR
        self._flet_page.update()

        self.monitor_task = asyncio.create_task(self._monitor_loop())

    async def _monitor_loop(self):
        """Main monitoring loop - poll for new attendance"""
        while self.is_monitoring:
            if self.client and self.client.is_connected():
                try:
                    # Try to get attendance - might fail, that's ok
                    success, records, msg = await self.client.get_attendance_async(max_records=10)

                    if success and records:
                        for record in records:
                            exists = any(
                                r.timestamp == record.timestamp and r.raw_id == record.raw_id
                                for r in self.records
                            )
                            if not exists:
                                self.records.insert(0, record)
                                self._add_record_row(record)

                        if self.records:
                            self.record_count.value = f"{len(self.records)} records"
                            self.empty_state.visible = False

                except Exception as e:
                    # Just log, don't crash
                    pass

            await asyncio.sleep(2)

    def _add_record_row(self, record: AttendanceRecord):
        """Add a record row to the list"""
        # Event type styling
        if record.event_type == AttendanceEventType.CHECK_IN:
            icon = flet_icons.Icons.ARROW_UPWARD
            color = AppTheme.SUCCESS
            label = "IN"
        elif record.event_type == AttendanceEventType.CHECK_OUT:
            icon = flet_icons.Icons.ARROW_DOWNWARD
            color = AppTheme.WARNING
            label = "OUT"
        else:
            icon = flet_icons.Icons.HELP
            color = AppTheme.TEXT_SECONDARY
            label = "?"

        # Format timestamp
        try:
            dt = datetime.strptime(record.timestamp, "%Y-%m-%d %H:%M:%S")
            time_str = dt.strftime("%H:%M:%S")
        except Exception:
            time_str = record.timestamp

        row = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Container(
                        content=ft.Text(
                            time_str,
                            size=14,
                            font_family="Consolas",
                            color=AppTheme.TEXT_PRIMARY,
                        ),
                        width=80,
                    ),
                    ft.Container(width=10),
                    ft.Container(
                        content=ft.Text(
                            record.raw_id,
                            size=14,
                            weight=ft.FontWeight.BOLD,
                            color=AppTheme.ACCENT,
                            font_family="Consolas",
                        ),
                        width=100,
                    ),
                    ft.Container(width=10),
                    ft.Container(
                        content=ft.Row(
                            controls=[
                                ft.Icon(icon, size=14, color=color),
                                ft.Text(label, size=12, color=color),
                            ],
                        ),
                        width=60,
                    ),
                ],
            ),
            padding=ft.padding.symmetric(vertical=8, horizontal=10),
            border_radius=6,
            bgcolor=AppTheme.SURFACE,
        )

        self.attendance_list.controls.insert(0, row)

        # Limit to 500 records
        if len(self.attendance_list.controls) > 500:
            self.attendance_list.controls.pop()

        if self.auto_scroll:
            self.attendance_list.scroll_to(offset=0, duration=200)

        self.attendance_list.update()
        self._flet_page.update()

    def _stop_monitoring(self):
        """Stop monitoring"""
        self.is_monitoring = False
        self.start_button.text = "Start Monitoring"
        self.start_button.icon = flet_icons.Icons.PLAY_ARROW
        self.start_button.style.bgcolor = AppTheme.SUCCESS
        self._flet_page.update()

    def _on_clear(self, e=None):
        """Clear all records"""
        self.records.clear()
        self.attendance_list.controls.clear()
        self.empty_state.visible = True
        self.record_count.value = "0 records"
        self.attendance_list.update()
        self.record_count.update()

    def _on_auto_scroll_change(self, e=None):
        """Toggle auto-scroll"""
        self.auto_scroll = self.auto_scroll_switch.value
