"""
Configuration Service
Load and manage machine configuration from JSON
"""

import json
import os
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class Machine:
    """Machine configuration model"""
    code: str
    name: str
    ip: str
    port: int
    password: str
    division: str
    location_group: str
    is_active: bool
    # Additional fields from database
    scanner_code: str | None = None
    loc_code: str | None = None
    access_status: str | None = None
    notes: str | None = None


def get_config_path() -> str:
    """Get path to machines.json"""
    # Try current directory first
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up to tools directory
    tools_dir = os.path.dirname(current_dir)
    project_dir = os.path.dirname(tools_dir)

    # Check multiple locations
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "machines.json"),
        os.path.join(current_dir, "machines.json"),
        os.path.join(tools_dir, "machines.json"),
        os.path.join(project_dir, "machines.json"),
    ]

    for path in possible_paths:
        if os.path.exists(path):
            return path

    # Default to current directory
    return os.path.join(os.path.dirname(__file__), "machines.json")


def load_machines() -> List[Machine]:
    """Load machines from JSON configuration file"""
    config_path = get_config_path()

    if not os.path.exists(config_path):
        raise FileNotFoundError(
            f"machines.json not found. Please create it at: {config_path}"
        )

    with open(config_path, "r") as f:
        data = json.load(f)

    machines = []
    for item in data.get("machines", []):
        machines.append(Machine(
            code=item["code"],
            name=item["name"],
            ip=item["ip"],
            port=item.get("port", 4370),
            password=item.get("password", "12345"),
            division=item["division"],
            location_group=item["location_group"],
            is_active=item.get("is_active", True),
            scanner_code=item.get("scanner_code"),
            loc_code=item.get("loc_code"),
            access_status=item.get("access_status"),
            notes=item.get("notes"),
        ))

    return machines


def get_machine_by_code(machines: List[Machine], code: str) -> Optional[Machine]:
    """Find machine by code"""
    for machine in machines:
        if machine.code == code:
            return machine
    return None


def get_active_machines(machines: List[Machine]) -> List[Machine]:
    """Get only active machines"""
    return [m for m in machines if m.is_active]
