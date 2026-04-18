from shared.services.callback_service import CallbackService


class _FakeResponse:
    def raise_for_status(self) -> None:
        return None


def test_send_results_adds_required_headers(monkeypatch):
    captured = {}

    def fake_post(url: str, json: dict, timeout: int, headers: dict):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        captured["headers"] = headers
        return _FakeResponse()

    monkeypatch.setattr("shared.services.callback_service.requests.post", fake_post)

    service = CallbackService(timeout_seconds=10, max_retries=1, signature_secret="unit-test-secret")
    payload = {"job_id": "abc", "status": "completed"}
    service.send_results("https://server-a/callback", payload)

    assert captured["url"] == "https://server-a/callback"
    assert captured["timeout"] == 10
    assert captured["json"] == payload
    assert "X-Signature" in captured["headers"]
    assert "X-Timestamp" in captured["headers"]
    assert "X-Request-Id" in captured["headers"]
    assert captured["headers"]["X-Signature"]


def test_send_results_honors_timeout_override(monkeypatch):
    captured = {}

    def fake_post(url: str, json: dict, timeout: int, headers: dict):
        captured["timeout"] = timeout
        return _FakeResponse()

    monkeypatch.setattr("shared.services.callback_service.requests.post", fake_post)

    service = CallbackService(timeout_seconds=10, max_retries=1, signature_secret="unit-test-secret")
    service.send_results("https://server-a/callback", {"ok": True}, timeout_seconds=3)

    assert captured["timeout"] == 3
