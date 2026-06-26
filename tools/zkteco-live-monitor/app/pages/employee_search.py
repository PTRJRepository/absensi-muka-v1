"""
Employee Search View
Search for employee across all machines to see where they're enrolled

Useful for troubleshooting "why can't employee X clock in?"
"""

import flet as ft
from flet import icons as flet_icons
import asyncio
from typing import List, Callable, Dict
from app.services.config import Machine, get_active_machines
from app.services.zkteco_client import ZKTecoClient
from app.theme import AppTheme, StatusColors


class EmployeeSearchView(ft.Container):
    """Employee search across all machines"""

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
        self.show_dashboard = show_dashboard
        self.machines = get_active_machines(machines)
        self.is_searching = False
        self.results: List[Dict] = []

        # Header
        header = ft.Row(
            controls=[
                ft.IconButton(
                    icon=flet_icons.Icons.ARROW_BACK,
                    on_click=lambda e: show_dashboard(),
                    icon_color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Text(
                    "Employee Search",
                    size=22,
                    weight=ft.FontWeight.BOLD,
                    color=AppTheme.TEXT_PRIMARY,
                ),
                ft.Container(expand=True),
                ft.Text(
                    f"Searching {len(self.machines)} machines",
                    size=12,
                    color=AppTheme.TEXT_SECONDARY,
                ),
            ],
        )

        # Search input
        self.search_input = ft.TextField(
            hint_text="Enter Employee ID (e.g., 44, 10044, A0044, 7000234)",
            prefix_icon=flet_icons.Icons.SEARCH,
            autofocus=True,
            on_submit=self._on_search,
            border_color=AppTheme.PRIMARY,
            focused_border_color=AppTheme.ACCENT,
        )

        self.search_button = ft.ElevatedButton(
            "Search All Machines",
            icon=flet_icons.Icons.PLAY_ARROW,
            on_click=self._on_search,
            style=ft.ButtonStyle(
                bgcolor=AppTheme.PRIMARY,
                color=AppTheme.TEXT_PRIMARY,
            ),
        )

        search_row = ft.Row(
            controls=[
                ft.Container(content=self.search_input, expand=True),
                ft.Container(width=10),
                self.search_button,
            ],
        )

        # Progress
        self.progress_bar = ft.ProgressBar(visible=False, color=AppTheme.ACCENT)
        self.progress_text = ft.Text("", size=12, color=AppTheme.TEXT_SECONDARY)

        # Results container
        self.results_list = ft.ListView(expand=True, spacing=5, padding=10)

        self.empty_state = ft.Container(
            content=ft.Column(
                controls=[
                    ft.Icon(flet_icons.Icons.SEARCH, size=64, color=AppTheme.TEXT_SECONDARY),
                    ft.Container(height=10),
                    ft.Text(
                        "Enter an employee ID to search",
                        size=16,
                        color=AppTheme.TEXT_SECONDARY,
                    ),
                    ft.Container(height=5),
                    ft.Text(
                        "We'll check all machines to see where this employee is enrolled",
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

        self.summary_text = ft.Text("", size=14, color=AppTheme.TEXT_SECONDARY)

        # Layout
        content = ft.Column(
            controls=[
                header,
                ft.Container(height=20),
                search_row,
                ft.Container(height=10),
                ft.Row(
                    controls=[
                        self.progress_bar,
                        self.progress_text,
                    ],
                    spacing=10,
                ),
                ft.Container(height=10),
                self.summary_text,
                ft.Container(height=10),
                ft.Container(
                    content=self.empty_state,
                    expand=True,
                    border_radius=8,
                    bgcolor=AppTheme.SURFACE,
                ),
                ft.Container(
                    content=self.results_list,
                    expand=True,
                    visible=False,
                    border_radius=8,
                    bgcolor=AppTheme.SURFACE,
                ),
            ],
            spacing=0,
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

    def _on_search(self, e=None):
        """Start search"""
        query = self.search_input.value.strip()
        if not query:
            return
        if self.is_searching:
            return
        asyncio.create_task(self._search_async(query))

    async def _search_async(self, query: str):
        """Search all machines async"""
        self.is_searching = True
        self.search_button.disabled = True
        self.search_button.text = "Searching..."
        self._flet_page.update()

        # Show progress
        self.progress_bar.visible = True
        self.progress_text.value = f"Searching for '{query}'..."
        self.empty_state.visible = False
        self.results_list.visible = True
        self.results_list.controls.clear()
        self.summary_text.value = ""

        checked = 0
        found = 0
        not_found = 0
        errors = 0

        for machine in self.machines:
            checked += 1
            progress = int((checked / len(self.machines)) * 100)
            self.progress_text.value = f"[{progress}%] Checking {machine.code}..."
            self.progress_bar.value = checked / len(self.machines)
            self._flet_page.update()

            try:
                client = ZKTecoClient(machine.ip, machine.port, machine.password)
                result = client.connect()

                if not result.success:
                    self._add_result(machine, query, "error", result.message)
                    errors += 1
                    client.disconnect()
                    continue

                success, users, msg = client.get_users()

                if not success:
                    self._add_result(machine, query, "error", msg)
                    errors += 1
                    client.disconnect()
                    continue

                # Search for matching user
                user_found = False
                for user in users:
                    if (query.lower() in user.user_id.lower() or
                        query.lower() in str(user.uid).lower()):
                        self._add_result(machine, query, "found", f"{user.user_id} - {user.name}")
                        self.results.append({"machine": machine, "user": user})
                        found += 1
                        user_found = True
                        break

                if not user_found:
                    self._add_result(machine, query, "not_found", "Not enrolled")
                    not_found += 1

                client.disconnect()

            except Exception as e:
                self._add_result(machine, query, "error", str(e))
                errors += 1

        # Done
        self.progress_bar.visible = False
        self.progress_text.value = ""
        self.search_button.disabled = False
        self.search_button.text = "Search All Machines"
        self.is_searching = False

        # Summary
        self.summary_text.value = f"Found: {found} | Not Found: {not_found} | Errors: {errors} | Checked: {checked} machines"
        self._flet_page.update()

    def _add_result(self, machine: Machine, query: str, status: str, message: str):
        """Add a result row"""
        if status == "found":
            icon = flet_icons.Icons.CHECK_CIRCLE
            color = AppTheme.SUCCESS
            label = "Enrolled"
        elif status == "not_found":
            icon = flet_icons.Icons.CANCEL
            color = AppTheme.ERROR
            label = "Not Found"
        else:
            icon = flet_icons.Icons.ERROR
            color = AppTheme.WARNING
            label = "Error"

        row = ft.Container(
            content=ft.Row(
                controls=[
                    ft.Container(content=ft.Icon(icon, size=18, color=color), width=30),
                    ft.Container(
                        content=ft.Text(query, size=14, weight=ft.FontWeight.BOLD, color=AppTheme.ACCENT, font_family="Consolas"),
                        width=100,
                    ),
                    ft.Container(width=10),
                    ft.Container(
                        content=ft.Text(machine.code, size=14, weight=ft.FontWeight.BOLD, color=AppTheme.TEXT_PRIMARY),
                        width=80,
                    ),
                    ft.Container(
                        content=ft.Text(machine.name, size=13, color=AppTheme.TEXT_SECONDARY),
                        expand=True,
                    ),
                    ft.Container(
                        content=ft.Text(label, size=12, color=color),
                        width=80,
                    ),
                ],
            ),
            padding=ft.padding.symmetric(vertical=10, horizontal=12),
            border_radius=8,
            bgcolor=AppTheme.SURFACE,
        )

        self.results_list.controls.append(row)
        self.results_list.scroll_to(offset=-1, duration=100)
        self.results_list.update()
