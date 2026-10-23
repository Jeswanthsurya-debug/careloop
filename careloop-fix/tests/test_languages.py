"""Multi-language tests: reply text, tool chips and /tts voice selection.

The voice tests run a *mock Polly* (a small local HTTP server that answers
DescribeVoices and SynthesizeSpeech) and start a second CareLoop instance
pointed at it with dummy credentials, so the real voice-selection code is
exercised without touching AWS.

    npm run build && npm start &
    pytest tests -q
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
import requests

BASE_URL = os.environ.get("CARELOOP_URL", "http://127.0.0.1:3000").rstrip("/")
TIMEOUT = 30
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ALL_LANGS = [
    "en-IN",
    "en-US",
    "hi-IN",
    "ta-IN",
    "te-IN",
    "es-ES",
    "fr-FR",
    "de-DE",
    "ar-AE",
    "ja-JP",
]

# Polly has no Tamil or Telugu voice.
NO_POLLY = {"ta-IN", "te-IN"}
POLLY_LANGS = [code for code in ALL_LANGS if code not in NO_POLLY]

# What a realistic DescribeVoices response looks like for the languages we use.
MOCK_VOICES = [
    {"Id": "Joanna", "Name": "Joanna", "LanguageCode": "en-US", "LanguageName": "US English",
     "Gender": "Female", "SupportedEngines": ["neural", "standard"]},
    {"Id": "Matthew", "Name": "Matthew", "LanguageCode": "en-US", "LanguageName": "US English",
     "Gender": "Male", "SupportedEngines": ["neural"]},
    {"Id": "Kajal", "Name": "Kajal", "LanguageCode": "en-IN", "LanguageName": "Indian English",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Aditi", "Name": "Aditi", "LanguageCode": "hi-IN", "LanguageName": "Hindi",
     "Gender": "Female", "SupportedEngines": ["standard"]},
    {"Id": "Kajal", "Name": "Kajal", "LanguageCode": "hi-IN", "LanguageName": "Hindi",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Lucia", "Name": "Lucia", "LanguageCode": "es-ES", "LanguageName": "Castilian Spanish",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Lea", "Name": "Lea", "LanguageCode": "fr-FR", "LanguageName": "French",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Vicki", "Name": "Vicki", "LanguageCode": "de-DE", "LanguageName": "German",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Hala", "Name": "Hala", "LanguageCode": "ar-AE", "LanguageName": "Gulf Arabic",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Tomoko", "Name": "Tomoko", "LanguageCode": "ja-JP", "LanguageName": "Japanese",
     "Gender": "Female", "SupportedEngines": ["neural"]},
    {"Id": "Mizuki", "Name": "Mizuki", "LanguageCode": "ja-JP", "LanguageName": "Japanese",
     "Gender": "Female", "SupportedEngines": ["standard"]},
]

# The voice we expect the selector to choose for each language.
EXPECTED_VOICE = {
    "en-IN": "Kajal",
    "en-US": "Joanna",
    "hi-IN": "Kajal",
    "es-ES": "Lucia",
    "fr-FR": "Lea",
    "de-DE": "Vicki",
    "ar-AE": "Hala",
    "ja-JP": "Tomoko",
}

FAKE_MP3 = b"ID3\x04\x00\x00\x00\x00\x00\x00fake-audio-for-tests"


# --------------------------------------------------------------- mock Polly
class MockPollyHandler(BaseHTTPRequestHandler):
    """Answers the two Polly calls CareLoop makes."""

    def log_message(self, *_args):  # keep pytest output clean
        pass

    def do_GET(self):  # noqa: N802 - name fixed by BaseHTTPRequestHandler
        if self.path.startswith("/v1/voices"):
            body = json.dumps({"Voices": MOCK_VOICES}).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):  # noqa: N802
        if not self.path.startswith("/v1/speech"):
            self.send_error(404)
            return
        length = int(self.headers.get("content-length", 0))
        request = json.loads(self.rfile.read(length) or b"{}")
        self.server.last_request = request  # type: ignore[attr-defined]

        self.send_response(200)
        self.send_header("content-type", "audio/mpeg")
        self.send_header("content-length", str(len(FAKE_MP3)))
        self.end_headers()
        self.wfile.write(FAKE_MP3)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def mock_polly():
    server = HTTPServer(("127.0.0.1", free_port()), MockPollyHandler)
    server.last_request = None  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()


@pytest.fixture(scope="session")
def polly_app(mock_polly):
    """A CareLoop instance wired to the mock Polly instead of AWS."""
    port = free_port()
    env = {
        **os.environ,
        "PORT": str(port),
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_REGION": "us-east-1",
        "AWS_ENDPOINT_URL_POLLY": f"http://127.0.0.1:{mock_polly.server_port}",
    }
    env.pop("BEDROCK_MODEL_ID", None)

    process = subprocess.Popen(
        ["npx", "next", "start", "-p", str(port)],
        cwd=PROJECT_ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 60
    while time.time() < deadline:
        if process.poll() is not None:
            pytest.fail("the mock-Polly CareLoop instance exited early")
        try:
            if requests.get(f"{base}/api/health", timeout=2).status_code == 200:
                break
        except requests.RequestException:
            time.sleep(0.5)
    else:  # pragma: no cover - only on a very slow machine
        process.terminate()
        pytest.fail("the mock-Polly CareLoop instance did not start in time")

    yield base

    process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:  # pragma: no cover
        process.kill()


def speak(base: str, lang: str, text: str = "Hello there. I am here with you."):
    return requests.post(f"{base}/tts", json={"text": text, "lang": lang}, timeout=TIMEOUT)


def chat(text: str, lang: str, base: str | None = None) -> dict:
    response = requests.post(
        f"{(base or BASE_URL)}/api/chat", json={"text": text, "lang": lang}, timeout=TIMEOUT
    )
    response.raise_for_status()
    return response.json()


@pytest.fixture(scope="session", autouse=True)
def require_running_app() -> None:
    try:
        health = requests.get(f"{BASE_URL}/health", timeout=TIMEOUT)
    except requests.RequestException as exc:  # pragma: no cover
        pytest.fail(f"CareLoop is not reachable at {BASE_URL}: {exc}")
    assert health.json()["ok"] is True


# ------------------------------------------------- /tts voice per language
@pytest.mark.parametrize("lang", POLLY_LANGS)
def test_tts_picks_a_verified_voice_for_each_language(polly_app, lang):
    """Every Polly language gets real audio and the expected voice."""
    response = speak(polly_app, lang)

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg", response.text[:200]
    assert response.headers["x-careloop-lang"] == lang
    assert response.headers["x-careloop-voice"] == EXPECTED_VOICE[lang]
    # Neural is preferred wherever Polly offers it.
    assert response.headers["x-careloop-engine"] == "neural"


def test_tts_sends_the_right_language_code_and_ssml(polly_app, mock_polly):
    speak(polly_app, "hi-IN")
    sent = mock_polly.last_request

    assert sent["VoiceId"] == "Kajal"
    assert sent["LanguageCode"] == "hi-IN"
    assert sent["Engine"] == "neural"
    assert sent["TextType"] == "ssml"
    assert '<prosody rate="90%" volume="+6dB">' in sent["Text"]
    assert sent["Text"].startswith("<speak>")


def test_hindi_and_english_india_are_not_the_same_language(polly_app, mock_polly):
    """The old bug: both collapsed to "en"/"hi" and shared one voice."""
    speak(polly_app, "hi-IN")
    hindi = mock_polly.last_request
    speak(polly_app, "en-IN")
    english_india = mock_polly.last_request
    speak(polly_app, "en-US")
    english_us = mock_polly.last_request

    assert hindi["LanguageCode"] == "hi-IN"
    assert english_india["LanguageCode"] == "en-IN"
    assert english_us["LanguageCode"] == "en-US"
    assert english_us["VoiceId"] == "Joanna"
    assert english_india["VoiceId"] == "Kajal"


@pytest.mark.parametrize("lang", sorted(NO_POLLY))
def test_tamil_and_telugu_return_the_browser_fallback_flag(polly_app, lang):
    """Polly cannot speak these, so the browser must take over."""
    response = speak(polly_app, lang)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert body["fallback"] == "browser"
    assert body["lang"] == lang
    assert body["pollySupported"] is False
    assert body["reason"] == "language-unsupported"


def test_voices_endpoint_lists_only_that_language(polly_app):
    hindi = requests.get(f"{polly_app}/tts/voices", params={"lang": "hi-IN"}, timeout=TIMEOUT).json()
    assert hindi["lang"] == "hi-IN"
    assert [voice["id"] for voice in hindi["voices"]][0] == "Kajal"
    assert all(voice["languageCode"] == "hi-IN" for voice in hindi["voices"])

    tamil = requests.get(f"{polly_app}/tts/voices", params={"lang": "ta-IN"}, timeout=TIMEOUT).json()
    assert tamil["voices"] == []
    assert tamil["pollySupported"] is False


def test_without_credentials_no_voice_is_claimed():
    """The main instance has no AWS keys, so it must not invent a voice."""
    response = speak(BASE_URL, "fr-FR")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["fallback"] == "browser"


# --------------------------------------------------- replies in every language
@pytest.mark.parametrize("lang", ALL_LANGS)
def test_mock_replies_exist_for_every_language(lang):
    payload = chat("I took my medicine", lang)

    assert payload["lang"] == lang
    assert payload["reply"].strip(), f"{lang} produced an empty reply"
    assert payload["toolCalls"], f"{lang} ran no tool"
    assert payload["toolCalls"][0]["name"] == "log_medication"


@pytest.mark.parametrize("lang", [code for code in ALL_LANGS if not code.startswith("en")])
def test_non_english_replies_are_not_english(lang):
    english = chat("I took my medicine", "en-US")["reply"]
    translated = chat("I took my medicine", lang)["reply"]
    assert translated != english, f"{lang} replied in English"


@pytest.mark.parametrize(
    ("lang", "script"),
    [
        ("hi-IN", range(0x0900, 0x097F)),   # Devanagari
        ("ta-IN", range(0x0B80, 0x0BFF)),   # Tamil
        ("te-IN", range(0x0C00, 0x0C7F)),   # Telugu
        ("ar-AE", range(0x0600, 0x06FF)),   # Arabic
        ("ja-JP", range(0x3040, 0x30FF)),   # Kana
    ],
)
def test_replies_use_the_right_script(lang, script):
    reply = chat("I took my medicine", lang)["reply"]
    assert any(ord(character) in script for character in reply), f"{lang} reply is not in its own script: {reply}"


def test_tool_chips_are_translated_but_tool_names_stay_english():
    payload = chat("I took my medicine", "hi-IN")
    chip = payload["toolCalls"][0]

    assert chip["name"] == "log_medication"  # tool names stay English
    assert chip["status"] == "done"
    assert chip["title"] and chip["title"] != "Medication logged"
    assert chip["label"] and chip["label"] != "done"


def test_tool_result_sentences_are_translated():
    hindi = chat("I drank two glasses of water", "hi-IN")["toolCalls"][0]
    french = chat("I drank two glasses of water", "fr-FR")["toolCalls"][0]

    assert hindi["detail"], "no translated detail for Hindi"
    assert french["detail"], "no translated detail for French"
    assert hindi["detail"] != french["detail"]
    # The English summary is still there for the MCP/tool layer.
    assert "glass" in hindi["summary"].lower()


@pytest.mark.parametrize("lang", ALL_LANGS)
def test_the_whole_pipeline_agrees_on_one_language(lang):
    """Chat echoes back the same tag it was given — no truncation anywhere."""
    payload = chat("How was my week?", lang)
    assert payload["lang"] == lang


# -------------------------------------------- language changes mid-session
def test_two_languages_in_one_session_each_reply_in_their_own():
    """The backend must not latch onto the first language of a session."""
    session = requests.Session()

    first = session.post(
        f"{BASE_URL}/api/chat", json={"text": "I took my medicine", "lang": "hi-IN"}, timeout=TIMEOUT
    ).json()
    second = session.post(
        f"{BASE_URL}/api/chat", json={"text": "I took my medicine", "lang": "es-ES"}, timeout=TIMEOUT
    ).json()
    third = session.post(
        f"{BASE_URL}/api/chat", json={"text": "I took my medicine", "lang": "hi-IN"}, timeout=TIMEOUT
    ).json()

    assert first["lang"] == "hi-IN"
    assert second["lang"] == "es-ES"
    assert third["lang"] == "hi-IN"

    # Hindi in Devanagari, Spanish in Latin script — never the other way round.
    assert any(0x0900 <= ord(ch) <= 0x097F for ch in first["reply"]), first["reply"]
    assert not any(0x0900 <= ord(ch) <= 0x097F for ch in second["reply"]), second["reply"]
    assert first["reply"] != second["reply"]
    # Switching back gives Hindi again, not a language that stuck from before.
    assert any(0x0900 <= ord(ch) <= 0x097F for ch in third["reply"]), third["reply"]


def test_rapid_language_switching_in_one_session_never_leaks():
    """Walk the exact order from the bug report, twice, on one connection."""
    session = requests.Session()
    order = ["en-US", "hi-IN", "ta-IN", "es-ES", "en-US"]
    scripts = {
        "hi-IN": range(0x0900, 0x0980),
        "ta-IN": range(0x0B80, 0x0C00),
    }

    seen: list[tuple[str, str]] = []
    for lang in order * 2:
        payload = session.post(
            f"{BASE_URL}/api/chat", json={"text": "I took my medicine", "lang": lang}, timeout=TIMEOUT
        ).json()
        assert payload["lang"] == lang
        if lang in scripts:
            assert any(ord(ch) in scripts[lang] for ch in payload["reply"]), f"{lang}: {payload['reply']}"
        seen.append((lang, payload["reply"]))

    # Wording may vary with the data (adherence changes the tone); the
    # *language* must not. Latin-script languages are told apart by keyword.
    markers = {
        "en-US": "Thank you",
        "es-ES": "Gracias",
    }
    for lang, reply in seen:
        if lang in markers:
            assert reply.startswith(markers[lang]), f"{lang} replied in another language: {reply}"

    english = {reply for lang, reply in seen if lang == "en-US"}
    spanish = {reply for lang, reply in seen if lang == "es-ES"}
    assert english.isdisjoint(spanish)


@pytest.mark.parametrize("lang", ALL_LANGS)
def test_greeting_exists_for_every_language(lang):
    """applyLanguage() speaks this string, so every language needs one."""
    ui_module = subprocess.run(
        ["npx", "tsx", "-e", f'import {{ ui }} from "./src/lib/i18n"; process.stdout.write(ui("{lang}").greeting);'],
        cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=120,
    )
    greeting = ui_module.stdout.strip()
    assert greeting, f"{lang} has no greeting"
    if lang != "en-US" and lang != "en-IN":
        english = subprocess.run(
            ["npx", "tsx", "-e", 'import { ui } from "./src/lib/i18n"; process.stdout.write(ui("en-US").greeting);'],
            cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=120,
        ).stdout.strip()
        assert greeting != english, f"{lang} greeting is still English"
