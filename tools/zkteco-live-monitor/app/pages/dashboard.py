"""
Dashboard View
Overview of all machines with status indicators
"""

import flet as ft
from flet import icons as flet_icons
import asyncio
from datetime import datetime
from typing import List, Callable, Dict
from app.services.config import Machine, get_active_machines
from app.services.zkteco_client import ZKTecoClient
from app.theme import AppTheme, StatusColors, MachineStatus


class DashboardView(ft.Container):
    """Dashboard view showing all machines"""

    def __init__(
        self,
        page: ft.Page,
        machines: List[Machine],
        show_dashboard: Callable,
        show_monitor: Callable,
        show_diagnostic: Callable,
        show_employee_search: Callable,
    ):
        self._flet_page = page
        self.machines = get_active_machines(machines)
        self.show_monitor = show_monitor
        self.show_diagnostic = show_diagnostic
        self.show_employee_search = show_employee_search
        self.machine_cards: Dict[str, ft.Container] = {}
        self.status_indicators: Dict[str, ft.Container] = {}
        self.online_count_text: ft.Text = None
        self.offline_count_text: ft.Text = None

        self._build_ui()

        # Initial refresh
        page.update()
        page.run_task(self._refresh_all)

    def _build_ui(self):
        """Build the UI"""
        # Title
        title = ft.Text(
            "ZKTeco Live Monitor",
            size=32,
            weight=ft.FontWeight.BOLD,
            color=AppTheme.TEXT_PRIMARY,
        )

        # Header buttons
        refresh_btn = ft.ElevatedButton(
            "Refresh All",
            icon=flet_icons.Icons.REFRESH,
            on_click=self._on_refresh_click,
            style=ft.ButtonStyle(
                bgcolor=AppTheme.PRIMARY,
                color=AppTheme.TEXT_PRIMARY,
            ),
        )

        search_btn = ft.ElevatedButton(
            "Employee Search",
            icon=flet_icons.Icons.SEARCH,
            on_click=self._on_search_click,
            style=ft.ButtonStyle(
                bgcolor=AppTheme.ACCENT,
                color=AppTheme.BACKGROUND,
            ),
        )

        # Status counters
        self.online_count_text = ft.Text(
            "0", size=28, weight=ft.FontWeight.BOLD, color=StatusColors.ONLINE
        )
        self.offline_count_text = ft.Text(
            "0", size=28, weight=ft.FontWeight.BOLD, color=StatusColors.OFFLINE
        )

        status_bar = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Container(
                        content=ft.Row(
                            controls=[
                                ft.Container(width=16, height=16, border_radius=8, bgcolor=StatusColors.ONLINE),
                                ft.Text("Online: ", color=AppTheme.TEXT_SECONDARY, size=16),
                                self.online_count_text,
                            ],
                        ),
                        padding=10,
                    ),
                    ft.Container(width=40),
                    ft.Container(
                        content=ft.Row(
                            controls=[
                                ft.Container(width=16, height=16, border_radius=8, bgcolor=StatusColors.OFFLINE),
                                ft.Text("Offline: ", color=AppTheme.TEXT_SECONDARY, size=16),
                                self.offline_count_text,
                            ],
                        ),
                        padding=10,
                    ),
                    ft.Container(width=40),
                    ft.Text(
                        f"Total: {len(self.machines)} machines",
                        color=AppTheme.TEXT_SECONDARY,
                        size=16,
                    ),
                ],
            ),
            padding=15,
            border_radius=10,
            bgcolor=AppTheme.SURFACE,
        )

        # Machine cards grid - use rows of 4 cards each
        cards_rows = []
        row_controls = []
        for i, machine in enumerate(self.machines):
            row_controls.append(self._create_machine_card(machine))
            if len(row_controls) == 4 or i == len(self.machines) - 1:
                # Pad with empty containers if needed
                while len(row_controls) < 4:
                    row_controls.append(ft.Container(width=280))
                cards_rows.append(ft.Row(controls=row_controls, expand=True))
                row_controls = []

        machine_grid = ft.Column(
            controls=cards_rows,
            spacing=15,
        )

        # Content
        content = ft.Column(
            controls=[
                ft.Row(
                    controls=[
                        title,
                        ft.Container(expand=True),
                        refresh_btn,
                        ft.Container(width=10),
                        search_btn,
                    ],
                    alignment=ft.MainAxisAlignment.START,
                ),
                ft.Container(height=20),
                status_bar,
                ft.Container(height=20),
                ft.Container(
                    content=machine_grid,
                    expand=True,
                ),
            ],
            spacing=0,
            scroll=ft.ScrollMode.AUTO,
        )

        super().__init__(
            content=ft.Container(
                content=ft.Container(
                    content=content,
                    padding=25,
                ),
                bgcolor=AppTheme.BACKGROUND,
                expand=True,
            ),
            expand=True,
            bgcolor=AppTheme.BACKGROUND,
        )

    def _create_machine_card(self, machine: Machine) -> ft.Container:
        """Create a machine card"""
        # Status indicator
        status_indicator = ft.Container(
            width=14,
            height=14,
            border_radius=7,
            bgcolor=StatusColors.UNKNOWN,
        )
        self.status_indicators[machine.code] = status_indicator

        status_text = ft.Text(
            "Unknown",
            size=13,
            color=AppTheme.TEXT_SECONDARY,
        )

        last_sync = ft.Text(
            "Not checked",
            size=11,
            color=AppTheme.TEXT_SECONDARY,
        )

        # Card content
        card_content = ft.Column(
            controls=[
                # Header
                ft.Row(
                    controls=[
                        status_indicator,
                        ft.Container(expand=True),
                        status_text,
                    ],
                ),
                ft.Container(height=10),
                # Machine name
                ft.Text(
                    machine.code,
                    size=20,
                    weight=ft.FontWeight.BOLD,
                    color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Text(
                    machine.name,
                    size=13,
                    color=AppTheme.TEXT_SECONDARY,
                ),
                ft.Container(height=5),
                # IP
                ft.Text(
                    f"{machine.ip}:{machine.port}",
                    size=12,
                    color=AppTheme.ACCENT,
                    font_family="Consolas",
                ),
                ft.Container(height=5),
                last_sync,
                ft.Container(height=15),
                # Buttons
                ft.Row(
                    controls=[
                        ft.ElevatedButton(
                            "Monitor",
                            icon=flet_icons.Icons.MONITOR,
                            on_click=lambda e, m=machine: self._on_monitor_click(m),
                            style=ft.ButtonStyle(
                                bgcolor=AppTheme.PRIMARY,
                                color=AppTheme.TEXT_PRIMARY,
                                padding=8,
                            ),
                            expand=1,
                        ),
                        ft.Container(width=5),
                        ft.ElevatedButton(
                            "Diagnostic",
                            icon=flet_icons.Icons.BUILD,
                            on_click=lambda e, m=machine: self._on_diagnostic_click(m),
                            style=ft.ButtonStyle(
                                bgcolor=AppTheme.SURFACE_LIGHT,
                                color=AppTheme.TEXT_PRIMARY,
                                padding=8,
                            ),
                            expand=1,
                        ),
                    ],
                ),
            ],
            spacing=0,
        )

        card = ft.Container(
            content=card_content,
            padding=18,
            border_radius=12,
            bgcolor=AppTheme.SURFACE,
            width=280,
        )

        self.machine_cards[machine.code] = card
        return card

    def _on_refresh_click(self, e):
        """Refresh button clicked"""
        self._flet_page.run_task(self._refresh_all)

    def _on_search_click(self, e):
        """Search button clicked"""
        self.show_employee_search()

    def _on_monitor_click(self, machine: Machine):
        """Monitor button clicked"""
        self.show_monitor(machine)

    def _on_diagnostic_click(self, machine: Machine):
        """Diagnostic button clicked"""
        self.show_diagnostic(machine)

    async def _refresh_all(self):
        """Refresh all machine statuses"""
        online = 0
        offline = 0

        for machine in self.machines:
            indicator = self.status_indicators.get(machine.code)
            if not indicator:
                continue

            # Update to connecting
            indicator.bgcolor = StatusColors.CONNECTING
            self._flet_page.update()

            # Test connection
            client = ZKTecoClient(machine.ip, machine.port, machine.password)
            result = client.connect()

            if result.success:
                indicator.bgcolor = StatusColors.ONLINE
                online += 1
            else:
                indicator.bgcolor = StatusColors.OFFLINE
                offline += 1

            client.disconnect()

        # Update counters
        self.online_count_text.value = str(online)
        self.offline_count_text.value = str(offline)
        self._flet_page.update()
