"""
App Theme Configuration
Custom styling untuk ZKTeco Live Monitor
"""

import flet as ft


class AppTheme:
    """Theme configuration for consistent styling"""

    # Colors
    PRIMARY = "#2196F3"  # Blue
    PRIMARY_DARK = "#1976D2"
    SUCCESS = "#4CAF50"  # Green - Online
    ERROR = "#F44336"  # Red - Offline/Error
    WARNING = "#FF9800"  # Orange - Warning
    BACKGROUND = "#1A1A2E"  # Dark background
    SURFACE = "#16213E"  # Card background
    SURFACE_LIGHT = "#1F3460"  # Lighter surface
    TEXT_PRIMARY = "#FFFFFF"
    TEXT_SECONDARY = "#B0BEC5"
    ACCENT = "#00D9FF"  # Cyan accent

    @classmethod
    def get_theme(cls) -> ft.Theme:
        """Get Flet theme configuration"""
        return ft.Theme(
            color_scheme=ft.ColorScheme(
                primary=cls.PRIMARY,
                on_primary=cls.TEXT_PRIMARY,
                secondary=cls.ACCENT,
                on_secondary=cls.BACKGROUND,
                surface=cls.SURFACE,
                on_surface=cls.TEXT_PRIMARY,
                error=cls.ERROR,
                on_error=cls.TEXT_PRIMARY,
            ),
            font_family="Segoe UI",
        )

    @classmethod
    def get_page_padding(cls):
        """Standard page padding"""
        return 20

    @classmethod
    def get_card_style(cls):
        """Standard card styling"""
        return ft.Container(
            padding=15,
            border_radius=12,
            bgcolor=cls.SURFACE,
        )

    @classmethod
    def get_button_primary_style(cls):
        """Primary button style"""
        return ft.ButtonStyle(
            bgcolor=cls.PRIMARY,
            color=cls.TEXT_PRIMARY,
            padding=ft.padding.symmetric(horizontal=20, vertical=12),
            shape=ft.RoundedRectangleBorder(radius=8),
        )

    @classmethod
    def get_button_danger_style(cls):
        """Danger button style"""
        return ft.ButtonStyle(
            bgcolor=cls.ERROR,
            color=cls.TEXT_PRIMARY,
            padding=ft.padding.symmetric(horizontal=20, vertical=12),
            shape=ft.RoundedRectangleBorder(radius=8),
        )

    @classmethod
    def get_button_success_style(cls):
        """Success button style"""
        return ft.ButtonStyle(
            bgcolor=cls.SUCCESS,
            color=cls.TEXT_PRIMARY,
            padding=ft.padding.symmetric(horizontal=20, vertical=12),
            shape=ft.RoundedRectangleBorder(radius=8),
        )


class StatusColors:
    """Status indicator colors"""

    ONLINE = AppTheme.SUCCESS
    OFFLINE = AppTheme.ERROR
    CONNECTING = AppTheme.WARNING
    UNKNOWN = "#9E9E9E"


class MachineStatus:
    """Machine status enum"""

    ONLINE = "online"
    OFFLINE = "offline"
    CONNECTING = "connecting"
    UNKNOWN = "unknown"
