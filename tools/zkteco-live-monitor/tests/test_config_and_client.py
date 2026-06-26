import sys
import unittest
from pathlib import Path
from unittest.mock import patch


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_ROOT))

from app.services.config import load_machines  # noqa: E402
from app.services.zkteco_client import AttendanceEventType, ZKTecoClient  # noqa: E402
from main import build_attendance_calendar_model  # noqa: E402


class ConfigTests(unittest.TestCase):
    def test_loads_machine_config(self):
        machines = load_machines()

        self.assertGreaterEqual(len(machines), 16)
        self.assertTrue(any(machine.code == "P1A" for machine in machines))
        self.assertTrue(all(machine.ip for machine in machines))


class ClientNormalizationTests(unittest.TestCase):
    def test_get_users_normalizes_node_zklib_payload(self):
        client = ZKTecoClient("127.0.0.1", 4370)

        def fake_bridge(action, max_records=None):
            if action == "test":
                return {"success": True, "message": "Connected", "data": {"info": {}}}
            if action == "users":
                return {
                    "success": True,
                    "data": {
                        "count": 1,
                        "users": [{"uid": 7, "userId": "A0007", "name": "Test User", "role": 0}],
                    },
                }
            raise AssertionError(action)

        with patch.object(client, "_run_bridge", side_effect=fake_bridge):
            success, users, message = client.get_users()

        self.assertTrue(success, message)
        self.assertEqual(users[0].uid, 7)
        self.assertEqual(users[0].user_id, "A0007")
        self.assertEqual(users[0].name, "Test User")

    def test_get_attendance_normalizes_node_zklib_payload(self):
        client = ZKTecoClient("127.0.0.1", 4370)

        def fake_bridge(action, max_records=None):
            if action == "test":
                return {"success": True, "message": "Connected", "data": {"info": {}}}
            if action == "attendance":
                return {
                    "success": True,
                    "data": {
                        "count": 1,
                        "records": [
                            {
                                "uid": 3,
                                "deviceUserId": "10044",
                                "recordTime": "2026-06-24T07:30:00.000Z",
                                "type": 0,
                            }
                        ],
                    },
                }
            raise AssertionError(action)

        with patch.object(client, "_run_bridge", side_effect=fake_bridge):
            success, records, message = client.get_attendance(max_records=10)

        self.assertTrue(success, message)
        self.assertEqual(records[0].raw_uid, 3)
        self.assertEqual(records[0].raw_id, "10044")
        self.assertEqual(records[0].timestamp, "2026-06-24 07:30:00")
        self.assertEqual(records[0].event_type, AttendanceEventType.CHECK_IN)

    def test_get_attendance_keeps_blank_device_user_id_visible(self):
        client = ZKTecoClient("127.0.0.1", 4370)

        def fake_bridge(action, max_records=None):
            if action == "test":
                return {"success": True, "message": "Connected", "data": {"info": {}}}
            if action == "attendance":
                return {
                    "success": True,
                    "data": {
                        "count": 1,
                        "records": [
                            {
                                "userSn": 55,
                                "deviceUserId": "",
                                "recordTime": "2026-06-24T00:03:51.000Z",
                            }
                        ],
                    },
                }
            raise AssertionError(action)

        with patch.object(client, "_run_bridge", side_effect=fake_bridge):
            success, records, message = client.get_attendance(max_records=1)

        self.assertTrue(success, message)
        self.assertEqual(records[0].raw_uid, 55)
        self.assertEqual(records[0].raw_id, "")
        self.assertEqual(records[0].timestamp, "2026-06-24 00:03:51")

    def test_connection_error_is_reported(self):
        client = ZKTecoClient("127.0.0.1", 9)

        with patch.object(
            client,
            "_run_bridge",
            return_value={
                "success": False,
                "error": {"code": "CONNECTION_REFUSED", "message": "connect ECONNREFUSED"},
            },
        ):
            result = client.connect()

        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "CONNECTION_REFUSED")
        self.assertIn("ECONNREFUSED", result.message)

    def test_attendance_calendar_model_maps_user_names_and_days(self):
        client = ZKTecoClient("127.0.0.1", 4370)

        def fake_bridge(action, max_records=None):
            if action == "test":
                return {"success": True, "message": "Connected", "data": {"info": {}}}
            if action == "users":
                return {
                    "success": True,
                    "data": {
                        "count": 1,
                        "users": [{"uid": 9, "userId": "0010001", "name": "Test User"}],
                    },
                }
            if action == "attendance":
                return {
                    "success": True,
                    "data": {
                        "count": 2,
                        "records": [
                            {"userSn": 9, "deviceUserId": "0010001", "recordTime": "2026-06-24T07:00:00.000Z"},
                            {"userSn": 9, "deviceUserId": "0010001", "recordTime": "2026-06-24T17:00:00.000Z"},
                        ],
                    },
                }
            raise AssertionError(action)

        with patch.object(client, "_run_bridge", side_effect=fake_bridge):
            ok_users, users, _ = client.get_users()
            ok_att, records, _ = client.get_attendance(max_records=10)

        self.assertTrue(ok_users)
        self.assertTrue(ok_att)

        model = build_attendance_calendar_model(records, users)

        self.assertEqual(model["mode"], "calendar")
        self.assertEqual(model["month_label"], "June 2026")
        self.assertEqual(model["selected_record_count"], 2)
        self.assertGreaterEqual(len(model["rows"]), 1)
        self.assertEqual(model["rows"][0]["display_name"], "Test User")
        self.assertEqual(model["rows"][0]["display_id"], "0010001")
        self.assertEqual(model["rows"][0]["present_days"], 1)

    def test_attendance_calendar_model_resolves_name_from_raw_uid_when_device_user_id_is_blank(self):
        client = ZKTecoClient("127.0.0.1", 4370)

        def fake_bridge(action, max_records=None):
            if action == "test":
                return {"success": True, "message": "Connected", "data": {"info": {}}}
            if action == "users":
                return {
                    "success": True,
                    "data": {
                        "count": 1,
                        "users": [{"uid": 55, "userId": "A0055", "name": "Blank ID User"}],
                    },
                }
            if action == "attendance":
                return {
                    "success": True,
                    "data": {
                        "count": 1,
                        "records": [
                            {"userSn": 55, "deviceUserId": "", "recordTime": "2026-06-24T08:15:00.000Z"},
                        ],
                    },
                }
            raise AssertionError(action)

        with patch.object(client, "_run_bridge", side_effect=fake_bridge):
            ok_users, users, _ = client.get_users()
            ok_att, records, _ = client.get_attendance(max_records=10)

        self.assertTrue(ok_users)
        self.assertTrue(ok_att)

        model = build_attendance_calendar_model(records, users)

        self.assertEqual(model["mode"], "calendar")
        self.assertEqual(model["rows"][0]["display_name"], "Blank ID User")
        self.assertEqual(model["rows"][0]["display_id"], "A0055")
        self.assertEqual(model["rows"][0]["present_days"], 1)


if __name__ == "__main__":
    unittest.main()
