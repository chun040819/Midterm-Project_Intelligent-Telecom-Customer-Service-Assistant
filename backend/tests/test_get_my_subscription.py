from backend.tests.conftest import call


def test_returns_current_subscription_for_session_customer(client):
    r = call(client, "get_my_subscription")
    assert r.status_code == 200
    assert r.json() == {
        "status": "success",
        "data": {
            "subscription_id": "S0001",
            "plan": {
                "plan_id": "P499", "name": "標準型", "monthly_fee": 499,
                "data_limit_gb": 25, "voice_minutes": 80, "is_active": True,
            },
            "contract_end_date": "2027-06-30",
        },
        "error": None,
    }


def test_other_customer_gets_own_subscription(client):
    r = call(client, "get_my_subscription", customer="C0003")
    assert r.json()["data"]["plan"]["plan_id"] == "P999"


def test_extra_arguments_such_as_customer_id_are_rejected(client):
    r = call(client, "get_my_subscription", {"customer_id": "C0002"})
    assert r.status_code == 422
    assert r.json() == {
        "status": "error", "data": None,
        "error": {"code": "VALIDATION_ERROR", "message": r.json()["error"]["message"]},
    }


def test_missing_internal_token_is_forbidden(client):
    r = call(client, "get_my_subscription", token=None)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_wrong_internal_token_is_forbidden(client):
    assert call(client, "get_my_subscription", token="nope").status_code == 403


def test_unknown_customer_is_forbidden(client):
    r = call(client, "get_my_subscription", customer="C9999")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_missing_customer_header_is_forbidden(client):
    assert call(client, "get_my_subscription", customer=None).status_code == 403


def test_tool_outside_whitelist_is_not_found(client):
    r = call(client, "run_sql", {"query": "select 1"})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_health_is_open_and_exposes_nothing_else(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
