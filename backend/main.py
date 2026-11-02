import hmac
import os
import sqlite3
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, ValidationError

from backend.db.seed import connect


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"status": "error", "data": None, "error": {"code": code, "message": message}},
    )


def success(data: Any) -> dict:
    return {"status": "success", "data": data, "error": None}


class NoArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


def get_my_subscription(conn: sqlite3.Connection, customer_id: str, _args: NoArguments):
    row = conn.execute(
        """SELECT s.subscription_id, s.contract_end_date,
                  p.plan_id, p.name, p.monthly_fee, p.data_limit_gb, p.voice_minutes, p.is_active
           FROM subscriptions s JOIN plans p ON p.plan_id = s.plan_id
           WHERE s.customer_id = ?""",
        (customer_id,),
    ).fetchone()
    if row is None:
        return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
    sub_id, end, plan_id, name, fee, limit, minutes, active = row
    return success(
        {
            "subscription_id": sub_id,
            "plan": {
                "plan_id": plan_id, "name": name, "monthly_fee": fee,
                "data_limit_gb": limit, "voice_minutes": minutes, "is_active": bool(active),
            },
            "contract_end_date": end,
        }
    )


# 工具白名單：名稱 -> (輸入模型, handler)
TOOLS = {"get_my_subscription": (NoArguments, get_my_subscription)}


class ToolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    arguments: dict[str, Any] = {}


def create_app(db_path: str | None = None, internal_token: str | None = None) -> FastAPI:
    db_path = db_path or os.environ.get("SQLITE_PATH", "./.local/telcocare.sqlite3")
    token = internal_token if internal_token is not None else os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return error_response(422, "VALIDATION_ERROR", "請求格式或參數無效。")

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/internal/tools/{tool_name}")
    async def run_tool(tool_name: str, request: Request):
        supplied = request.headers.get("X-Internal-Token", "")
        if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
            return error_response(403, "FORBIDDEN", "無權存取。")
        if tool_name not in TOOLS:
            return error_response(404, "NOT_FOUND", "不存在的工具。")
        customer_id = request.headers.get("X-Demo-Customer-Id", "")
        conn = connect(db_path)
        try:
            if conn.execute("SELECT 1 FROM customers WHERE customer_id = ?", (customer_id,)).fetchone() is None:
                return error_response(403, "FORBIDDEN", "為保護客戶資料，我只能查詢目前 Demo 帳戶的資訊。")
            try:
                body = ToolRequest.model_validate(await request.json())
                model, handler = TOOLS[tool_name]
                args = model.model_validate(body.arguments)
            except (ValidationError, ValueError):
                return error_response(422, "VALIDATION_ERROR", "工具參數無效。")
            return handler(conn, customer_id, args)
        finally:
            conn.close()

    return app


def app_factory() -> FastAPI:
    return create_app()
