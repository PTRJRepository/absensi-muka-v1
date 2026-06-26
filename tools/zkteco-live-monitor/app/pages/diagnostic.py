"""
Diagnostic View
Machine diagnostic panel - get users, logs, info, and dangerous operations

READ-ONLY by default with explicit confirmation for dangerous operations
"""

import flet as ft
from flet import icons as flet_icons
import asyncio
from typing import List, Callable
from app.services.config import Machine
from app.services.zkteco_client import (
    ZKTecoClient,
    UserRecord,
    AttendanceRecord,
    DeviceInfo,
    AttendanceEventType
)
from app.theme import AppTheme, StatusColors


class DiagnosticView(ft.Container):
    """Diagnostic panel for machine operations"""

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
        self.client = None
        self.is_connected = False
        self.users: List[UserRecord] = []

        # Header
        header = ft.Row(
            controls=[
                ft.IconButton(
                    icon=flet_icons.Icons.ARROW_BACK,
                    on_click=lambda e: show_dashboard(),
                    icon_color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Text(
                    f"Diagnostic: {self.machine.code}",
                    size=22,
                    weight=ft.FontWeight.BOLD,
                    color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Container(expand=True),
                self._build_connection_status(),
            ],
        )

        # Machine info panel
        self.machine_info = ft.Column(
            controls=[
                ft.Text("Machine Information", size=16, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                ft.Container(height=10),
                ft.Row(
                    controls=[
                        ft.Column(
                            controls=[
                                ft.Text("IP Address:", size=12, color=AppTheme.TEXT_SECONDARY),
                                ft.Text("Port:", size=12, color=AppTheme.TEXT_SECONDARY),
                                ft.Text("Firmware:", size=12, color=AppTheme.TEXT_SECONDARY),
                                ft.Text("Serial:", size=12, color=AppTheme.TEXT_SECONDARY),
                                ft.Text("Users:", size=12, color=AppTheme.TEXT_SECONDARY),
                                ft.Text("Machine Time:", size=12, color=AppTheme.TEXT_SECONDARY),
                            ],
                            horizontal_alignment=ft.CrossAxisAlignment.START,
                            spacing=5,
                        ),
                        ft.Container(width=20),
                        ft.Column(
                            controls=[
                                ft.Text(f"{self.machine.ip}:{self.machine.port}", size=12, color=AppTheme.ACCENT, font_family="Consolas"),
                                ft.Text(str(self.machine.port), size=12, color=AppTheme.TEXT_PRIMARY),
                                ft.Text("Not checked", size=12, color=AppTheme.TEXT_SECONDARY, key="firmware"),
                                ft.Text("Not checked", size=12, color=AppTheme.TEXT_SECONDARY, key="serial"),
                                ft.Text("Not checked", size=12, color=AppTheme.TEXT_SECONDARY, key="users_count"),
                                ft.Text("Not checked", size=12, color=AppTheme.TEXT_SECONDARY, key="machine_time"),
                            ],
                            horizontal_alignment=ft.CrossAxisAlignment.START,
                            spacing=5,
                        ),
                    ],
                ),
            ],
        )

        info_panel = ft.Container(
            content=self.machine_info,
            padding=15,
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        # Action buttons
        actions_row1 = ft.Row(
            controls=[
                ft.ElevatedButton(
                    "Get Users",
                    icon=flet_icons.Icons.PEOPLE,
                    on_click=self._on_get_users,
                    style=ft.ButtonStyle(bgcolor=AppTheme.PRIMARY, color=AppTheme.TEXT_PRIMARY),
                ),
                ft.ElevatedButton(
                    "Get Attendance",
                    icon=flet_icons.Icons.EVENT_NOTE,
                    on_click=self._on_get_attendance,
                    style=ft.ButtonStyle(bgcolor=AppTheme.PRIMARY, color=AppTheme.TEXT_PRIMARY),
                ),
                ft.ElevatedButton(
                    "Get Info",
                    icon=flet_icons.Icons.INFO,
                    on_click=self._on_get_info,
                    style=ft.ButtonStyle(bgcolor=AppTheme.PRIMARY, color=AppTheme.TEXT_PRIMARY),
                ),
                ft.ElevatedButton(
                    "Sync Time",
                    icon=flet_icons.Icons.ACCESS_TIME,
                    on_click=self._on_sync_time,
                    style=ft.ButtonStyle(bgcolor=AppTheme.PRIMARY, color=AppTheme.TEXT_PRIMARY),
                ),
            ],
            wrap=True,
            spacing=10,
        )

        actions_panel = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Text("Actions (READ-ONLY)", size=14, weight=ft.FontWeight.BOLD, color=AppTheme.SUCCESS),
                    ft.Container(height=10),
                    actions_row1,
                ],
            ),
            padding=15,
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        # Danger zone
        danger_row = ft.Row(
            controls=[
                ft.ElevatedButton(
                    "Clear Attendance",
                    icon=flet_icons.Icons.DELETE,
                    on_click=self._on_clear_attendance,
                    style=ft.ButtonStyle(bgcolor=AppTheme.ERROR, color=AppTheme.TEXT_PRIMARY),
                ),
                ft.ElevatedButton(
                    "Clear Users",
                    icon=flet_icons.Icons.PERSON_REMOVE,
                    on_click=self._on_clear_users,
                    style=ft.ButtonStyle(bgcolor=AppTheme.ERROR, color=AppTheme.TEXT_PRIMARY),
                ),
                ft.ElevatedButton(
                    "Reboot",
                    icon=flet_icons.Icons.RESTART_ALT,
                    on_click=self._on_reboot,
                    style=ft.ButtonStyle(bgcolor=AppTheme.ERROR, color=AppTheme.TEXT_PRIMARY),
                ),
            ],
            wrap=True,
            spacing=10,
        )

        danger_panel = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Icon(flet_icons.Icons.WARNING, color=AppTheme.ERROR),
                            ft.Text("DANGER ZONE", size=14, weight=ft.FontWeight.BOLD, color=AppTheme.ERROR),
                        ],
                    ),
                    ft.Container(height=5),
                    ft.Text("These operations WILL delete data from the machine!", size=11, color=AppTheme.ERROR),
                    ft.Container(height=10),
                    danger_row,
                ],
            ),
            padding=15,
            border_radius=8,
            border=ft.border.all(1, AppTheme.ERROR),
            bgcolor="#2D1A1A",
        )

        # Output console
        self.output_list = ft.ListView(expand=True, spacing=2)

        output_panel = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row(
                        controls=[
                            ft.Text("Output:", size=14, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                            ft.Container(expand=True),
                            ft.TextButton(
                                "Clear",
                                on_click=self._on_clear_output,
                                icon=flet_icons.Icons.DELETE_OUTLINE,
                            ),
                        ],
                    ),
                    ft.Container(height=5),
                    ft.Container(
                        content=self.output_list,
                        expand=True,
                        bgcolor="#0D1117",
                        border_radius=6,
                        padding=10,
                    ),
                ],
            ),
            padding=15,
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        # Layout
        content = ft.Column(
            controls=[
                header,
                ft.Container(height=15),
                info_panel,
                ft.Container(height=15),
                actions_panel,
                ft.Container(height=15),
                danger_panel,
                ft.Container(height=15),
                ft.Container(content=output_panel, expand=True),
            ],
            spacing=0,
            scroll=ft.ScrollMode.AUTO,
        )

        super().__init__(
            content=ft.Container(
                content=ft.Container(
                    content=content,
                    padding=20,
                ),
                bgcolor=AppTheme.BACKGROUND,
                expand=True,
            ),
            expand=True,
            bgcolor=AppTheme.BACKGROUND,
        )

        # Auto-connect on load
        asyncio.create_task(self._auto_connect())

    def _build_connection_status(self) -> ft.Container:
        """Build connection status"""
        self.conn_indicator = ft.Container(
            width=12,
            height=12,
            border_radius=6,
            bgcolor=StatusColors.OFFLINE,
        )
        self.conn_text = ft.Text(
            "Disconnected",
            size=12,
            color=AppTheme.TEXT_SECONDARY,
        )
        return ft.Container(
            content=ft.Row(
                controls=[
                    self.conn_indicator,
                    ft.Container(width=8),
                    self.conn_text,
                ],
            ),
        )

    def _output_add(self, message: str, color: str = None):
        """Add message to output console"""
        if color is None:
            color = AppTheme.TEXT_PRIMARY

        timestamp = ft.Text(">", size=12, font_family="Consolas", color=AppTheme.ACCENT)
        msg = ft.Text(f" {message}", size=12, font_family="Consolas", color=color)
        row = ft.Row(controls=[timestamp, msg])
        self.output_list.controls.append(row)
        self.output_list.scroll_to(offset=-1, duration=100)
        self.output_list.update()

    def _output_clear(self):
        """Clear output console"""
        self.output_list.controls.clear()
        self.output_list.update()

    def _on_clear_output(self, e=None):
        """Clear button handler"""
        self._output_clear()

    async def _auto_connect(self):
        """Auto-connect when page loads"""
        self._output_add(f"Connecting to {self.machine.ip}:{self.machine.port}...")
        self._update_status(False, "Connecting...")

        self.client = ZKTecoClient(self.machine.ip, self.machine.port, self.machine.password)
        result = self.client.connect()

        if result.success:
            self._output_add("Connected successfully", AppTheme.SUCCESS)
            self._update_status(True)
        else:
            self._output_add(f"Connection failed: {result.message}", AppTheme.ERROR)
            self._update_status(False, result.message)

    def _update_status(self, connected: bool, message: str = ""):
        """Update connection status"""
        self.is_connected = connected
        if connected:
            self.conn_indicator.bgcolor = StatusColors.ONLINE
            self.conn_text.value = "Connected"
            self.conn_text.color = StatusColors.ONLINE
        else:
            self.conn_indicator.bgcolor = StatusColors.OFFLINE
            self.conn_text.value = message or "Disconnected"
            self.conn_text.color = AppTheme.TEXT_SECONDARY
        self._flet_page.update()

    # === READ-ONLY OPERATIONS ===

    def _on_get_info(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        asyncio.create_task(self._get_info_async())

    async def _get_info_async(self):
        self._output_add("Fetching device information...")
        info = await self.client.get_device_info_async()
        if info:
            self._output_add(f"Firmware: {info.firmware_version}", AppTheme.SUCCESS)
            self._output_add(f"Serial: {info.serial_number}", AppTheme.SUCCESS)
            self._output_add(f"Capacity: {info.capacity}", AppTheme.SUCCESS)
        else:
            self._output_add("Failed to get device info", AppTheme.ERROR)

    def _on_get_users(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        asyncio.create_task(self._get_users_async())

    async def _get_users_async(self):
        self._output_add("Fetching enrolled users...")
        success, users, msg = await self.client.get_users_async()
        if success:
            self.users = users
            self._output_add(f"Found {len(users)} users", AppTheme.SUCCESS)
            for i, user in enumerate(users[:10]):
                self._output_add(f"  {user.user_id} - {user.name}")
            if len(users) > 10:
                self._output_add(f"  ... and {len(users) - 10} more")
        else:
            self._output_add(f"Error: {msg}", AppTheme.ERROR)

    def _on_get_attendance(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        asyncio.create_task(self._get_attendance_async())

    async def _get_attendance_async(self):
        self._output_add("Fetching attendance logs...")
        success, records, msg = await self.client.get_attendance_async(max_records=100)
        if success:
            self._output_add(f"Retrieved {len(records)} records", AppTheme.SUCCESS)
            for record in records[:10]:
                event = "IN" if record.event_type == AttendanceEventType.CHECK_IN else "OUT"
                self._output_add(f"  {record.timestamp} | {record.raw_id} | {event}")
            if len(records) > 10:
                self._output_add(f"  ... and {len(records) - 10} more")
        else:
            self._output_add(f"Error: {msg}", AppTheme.ERROR)

    def _on_sync_time(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        asyncio.create_task(self._sync_time_async())

    async def _sync_time_async(self):
        self._output_add("Syncing machine time...")
        success, msg = self.client.sync_time()
        if success:
            self._output_add("Time synced successfully", AppTheme.SUCCESS)
        else:
            self._output_add(f"Error: {msg}", AppTheme.ERROR)

    # === DANGEROUS OPERATIONS ===

    def _on_clear_attendance(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        self._show_confirm("Clear Attendance", "This will DELETE all attendance logs from the machine!", self._clear_attendance_exec)

    def _on_clear_users(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        self._show_confirm("Clear All Users", "This will DELETE all enrolled users from the machine!", self._clear_users_exec)

    def _on_reboot(self, e=None):
        if not self.is_connected:
            self._output_add("Not connected", AppTheme.WARNING)
            return
        self._show_confirm("Reboot Machine", "This will restart the machine! It will be unavailable for 1-2 minutes.", self._reboot_exec)

    def _show_confirm(self, title: str, message: str, on_confirm):
        """Show confirmation dialog"""
        confirm_input = ft.TextField(hint_text='Type "CONFIRM" to proceed', autofocus=True, border_color=AppTheme.ERROR)

        def close(e):
            dialog.open = False
            self._flet_page.update()

        def confirm(e):
            if confirm_input.value == "CONFIRM":
                close()
                on_confirm()

        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Row(
                controls=[
                    ft.Icon(flet_icons.Icons.WARNING, color=AppTheme.ERROR),
                    ft.Text(title, color=AppTheme.ERROR),
                ],
            ),
            content=ft.Column(
                controls=[
                    ft.Text(message, color=AppTheme.TEXT_PRIMARY),
                    ft.Container(height=15),
                    ft.Text('Type "CONFIRM" to proceed:', size=14, color=AppTheme.TEXT_SECONDARY),
                    confirm_input,
                ],
            ),
            actions=[
                ft.TextButton("Cancel", on_click=close),
                ft.ElevatedButton("Confirm", on_click=confirm, style=ft.ButtonStyle(bgcolor=AppTheme.ERROR, color=AppTheme.TEXT_PRIMARY)),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        self.page.dialog = dialog
        dialog.open = True
        self._flet_page.update()

    def _clear_attendance_exec(self):
        asyncio.create_task(self._clear_attendance_async())

    async def _clear_attendance_async(self):
        self._output_add("Clearing attendance logs...", AppTheme.ERROR)
        success, msg = self.client.clear_attendance_logs()
        if success:
            self._output_add("Done", AppTheme.SUCCESS)
        else:
            self._output_add(f"Error: {msg}", AppTheme.ERROR)

    def _clear_users_exec(self):
        asyncio.create_task(self._clear_users_async())

    async def _clear_users_async(self):
        self._output_add("Clearing all users...", AppTheme.ERROR)
        success, msg = self.client.clear_all_users()
        if success:
            self._output_add("Done", AppTheme.SUCCESS)
        else:
            self._output_add(f"Error: {msg}", AppTheme.ERROR)

    def _reboot_exec(self):
        asyncio.create_task(self._reboot_async())

    async def _reboot_async(self):
        self._output_add("Sending reboot command...", AppTheme.ERROR)
        success, msg = self.client.reboot()
        if success:
            self._output_add("Reboot command sent", AppTheme.SUCCESS)
            self._update_status(False, "Rebooting...")
        else:
            self._output_add(f"Error: {msg}", AppTheme.ERROR)
