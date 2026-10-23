"""Integration tests for the CareLoop MCP server and chat routing.

These run against a live CareLoop instance (the same endpoints the UI uses):

    npm run build && npm start &
    pytest tests -q

Override the target with CARELOOP_URL if the app is not on port 3000.
"""

from __future__ import annotations

import datetime as dt
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("CARELOOP_URL", "http://127.0.0.1:3000").rstrip("/")
TIMEOUT = 30

EXPECTED_TOOLS = {
    "log_medication",
    "get_care_plan",
    "daily_checkin",
    "get_wellness_summary",
    "detect_anomalies",
    "log_hydration",
    "add_appointment",
    "alert_family",
}


# --------------------------------------------------------------------------- helpers
def rpc(method: str, params: dict | None = None, request_id: int = 1) -> dict:
    """Send one JSON-RPC call to the MCP endpoint and return the payload."""
    body = {"jsonrpc": "2.0", "id": request_id, "method": method}
    if params is not None:
        body["params"] = params
    response = requests.post(f"{BASE_URL}/mcp", json=body, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()


def call_tool(name: str, arguments: dict) -> dict:
    payload = rpc("tools/call", {"name": name, "arguments": arguments})
    assert "error" not in payload, f"{name} returned a JSON-RPC error: {payload.get('error')}"
    result = payload["result"]
    assert result["isError"] is False, f"{name} reported a tool error: {result}"
    return result


def chat(text: str, language: str = "en") -> dict:
    response = requests.post(
        f"{BASE_URL}/api/chat",
        json={"text": text, "language": language},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def tool_names(payload: dict) -> list[str]:
    return [call["name"] for call in payload.get("toolCalls", [])]


def dashboard() -> dict:
    response = requests.get(f"{BASE_URL}/api/dashboard", timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()["data"]


UPCOMING_LIMIT = 10


def assert_visible_or_crowded_out(title: str, date: str, items: list[dict]) -> None:
    """The diary view shows only the soonest few appointments.

    An entry must therefore either be listed, or be genuinely later than a
    full list of earlier ones -- anything else means it was lost.
    """
    if any(item["title"] == title for item in items):
        return
    assert len(items) >= UPCOMING_LIMIT, f"{title!r} is missing from a list with room to spare: {items}"
    assert all(item["date"] <= date for item in items), (
        f"{title!r} is missing even though a later appointment is listed: {items}"
    )


def next_weekday(name: str, today: dt.date | None = None) -> str:
    """The next occurrence of a weekday, matching the agent's own rule."""
    today = today or dt.date.today()
    target = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].index(name.lower())
    delta = (target - today.weekday() + 7) % 7
    delta = 7 if delta == 0 else delta
    return (today + dt.timedelta(days=delta)).isoformat()


@pytest.fixture(scope="session", autouse=True)
def require_running_app() -> None:
    try:
        health = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
    except requests.RequestException as exc:  # pragma: no cover - environment issue
        pytest.fail(f"CareLoop is not reachable at {BASE_URL}: {exc}")
    assert health.status_code == 200, f"/health returned {health.status_code}"
    assert health.json()["ok"] is True


# --------------------------------------------------------------------------- server
def test_health_reports_ok() -> None:
    body = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT).json()
    assert body["ok"] is True
    assert body["database"] == "up"


def test_mcp_lists_eight_tools() -> None:
    body = requests.get(f"{BASE_URL}/mcp", timeout=TIMEOUT).json()
    assert body["toolCount"] == 8
    assert {tool["name"] for tool in body["tools"]} == EXPECTED_TOOLS


def test_tools_list_matches_the_catalogue() -> None:
    tools = rpc("tools/list")["result"]["tools"]
    assert len(tools) == 8
    assert {tool["name"] for tool in tools} == EXPECTED_TOOLS
    for tool in tools:
        assert tool["description"].strip(), f"{tool['name']} is missing a description"
        assert tool["inputSchema"]["type"] == "object"


# ------------------------------------------------------------------- log_hydration
def test_log_hydration_is_registered_with_its_schema() -> None:
    tools = {tool["name"]: tool for tool in rpc("tools/list")["result"]["tools"]}
    schema = tools["log_hydration"]["inputSchema"]
    assert schema["required"] == ["glasses"]
    assert schema["properties"]["glasses"]["type"] == "number"


def test_log_hydration_records_glasses_and_reports_the_day() -> None:
    before = dashboard()["hydration"]["today"]
    result = call_tool("log_hydration", {"glasses": 2})

    structured = result["structuredContent"]
    assert structured["glasses"] == 2
    assert structured["hydration"]["today"] == before + 2
    assert structured["hydration"]["goal"] == 8
    assert "glass" in result["content"][0]["text"].lower()


def test_log_hydration_clamps_silly_values() -> None:
    assert call_tool("log_hydration", {"glasses": 0})["structuredContent"]["glasses"] == 1
    assert call_tool("log_hydration", {"glasses": 999})["structuredContent"]["glasses"] == 20


def test_chat_message_triggers_log_hydration() -> None:
    before = dashboard()["hydration"]["today"]
    payload = chat("I drank two glasses of water")

    assert payload["intent"] == "log_hydration"
    assert tool_names(payload) == ["log_hydration"]
    assert all(call["status"] == "done" for call in payload["toolCalls"])
    assert dashboard()["hydration"]["today"] == before + 2
    # The spoken reply stays warm and free of bare digits.
    assert payload["reply"]
    assert not any(character.isdigit() for character in payload["reply"])


def test_hydration_shows_up_on_the_dashboard() -> None:
    call_tool("log_hydration", {"glasses": 1})
    hydration = dashboard()["hydration"]
    assert hydration["today"] >= 1
    assert hydration["goal"] == 8
    assert isinstance(hydration["points"], list)


# ----------------------------------------------------------------- add_appointment
def test_add_appointment_is_registered_with_its_schema() -> None:
    tools = {tool["name"]: tool for tool in rpc("tools/list")["result"]["tools"]}
    schema = tools["add_appointment"]["inputSchema"]
    assert schema["required"] == ["title", "date"]
    assert schema["properties"]["title"]["type"] == "string"
    assert schema["properties"]["date"]["type"] == "string"


def test_add_appointment_saves_title_and_date() -> None:
    title = f"Hearing test {uuid.uuid4().hex[:6]}"
    date = (dt.date.today() + dt.timedelta(days=5)).isoformat()

    structured = call_tool("add_appointment", {"title": title, "date": date})["structuredContent"]
    assert structured["title"] == title
    assert structured["date"] == date
    assert structured["duplicate"] is False

    # The stored row is the authoritative proof that it saved.
    saved = structured["appointment"]
    assert saved["id"] > 0
    assert saved["title"] == title
    assert saved["date"] == date

    assert_visible_or_crowded_out(title, date, structured["appointments"]["upcoming"])


def test_add_appointment_rejects_a_nonsense_date() -> None:
    structured = call_tool("add_appointment", {"title": "Odd one", "date": "not-a-date"})["structuredContent"]
    assert structured["date"] == dt.date.today().isoformat()


def test_chat_message_triggers_add_appointment() -> None:
    payload = chat("I have a doctor visit on Friday")

    assert payload["intent"] == "add_appointment"
    assert tool_names(payload) == ["add_appointment"]
    assert all(call["status"] == "done" for call in payload["toolCalls"])
    assert "friday" in payload["reply"].lower()

    titles = [item["title"].lower() for item in dashboard()["appointments"]]
    assert "doctor visit" in titles


def test_chat_appointment_lands_on_the_right_calendar_day() -> None:
    chat("I have a doctor visit on Friday")
    appointments = dashboard()["appointments"]
    doctor_visits = [item for item in appointments if item["title"].lower() == "doctor visit"]
    assert doctor_visits, "the doctor visit was not saved"
    assert next_weekday("friday") in {item["date"] for item in doctor_visits}


def test_appointments_show_up_on_the_dashboard_in_date_order() -> None:
    title = f"Physio {uuid.uuid4().hex[:6]}"
    call_tool("add_appointment", {"title": title, "date": (dt.date.today() + dt.timedelta(days=2)).isoformat()})

    appointments = dashboard()["appointments"]
    assert_visible_or_crowded_out(title, (dt.date.today() + dt.timedelta(days=2)).isoformat(), appointments)
    assert len(appointments) <= UPCOMING_LIMIT
    dates = [item["date"] for item in appointments]
    assert dates == sorted(dates), "upcoming appointments should be in date order"
    today = dt.date.today().isoformat()
    assert all(date >= today for date in dates), "past appointments should not be listed"


# ------------------------------------------------------- the new tools in context
def test_wellness_summary_includes_hydration_and_appointments() -> None:
    structured = call_tool("get_wellness_summary", {"days": 7})["structuredContent"]
    assert "hydration" in structured
    assert structured["hydration"]["goal"] == 8
    assert "appointments" in structured
    assert isinstance(structured["appointments"], list)


@pytest.mark.parametrize(
    ("message", "expected_tool"),
    [
        ("I took my Metformin this morning", "log_medication"),
        ("What medicines do I have today?", "get_care_plan"),
        ("I had breakfast but I skipped lunch", "daily_checkin"),
        ("I am feeling a little lonely today", "daily_checkin"),
        ("How was my week?", "get_wellness_summary"),
        ("Is anything wrong with my routine?", "detect_anomalies"),
        ("I forgot my evening tablet", "log_medication"),
        ("I am not feeling well, please tell my family", "alert_family"),
        ("I drank two glasses of water", "log_hydration"),
        ("I have a doctor visit on Friday", "add_appointment"),
    ],
)
def test_chat_routing_is_unbroken(message: str, expected_tool: str) -> None:
    """The two new tools must not steal any of the existing intents."""
    payload = chat(message)
    assert expected_tool in tool_names(payload), f"{message!r} routed to {tool_names(payload)}"
    assert all(call["status"] == "done" for call in payload["toolCalls"])
    assert payload["reply"].strip()


def test_taking_medicine_with_water_is_still_a_medication_log() -> None:
    payload = chat("I took my Metformin with a glass of water")
    assert tool_names(payload) == ["log_medication"]


def test_the_same_appointment_twice_is_not_duplicated() -> None:
    title = f"Blood test {uuid.uuid4().hex[:6]}"
    date = (dt.date.today() + dt.timedelta(days=4)).isoformat()

    first = call_tool("add_appointment", {"title": title, "date": date})["structuredContent"]
    second = call_tool("add_appointment", {"title": title, "date": date})["structuredContent"]

    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert second["appointment"]["id"] == first["appointment"]["id"]
