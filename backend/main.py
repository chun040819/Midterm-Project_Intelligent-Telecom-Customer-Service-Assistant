import hmac
import os
import sqlite3
from typing import Annotated, Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.db.seed import connect
from backend.rag import config as rag_config
from backend.rag.retriever import PolicyRetriever, PolicySearchError


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


Month = Annotated[str, Field(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$", strict=True)]


class BillArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # 預設值不經驗證；明確傳入 null 或無效月份仍會被拒絕，不視為省略。
    billing_month: Month = None  # type: ignore[assignment]


def get_my_bill(conn: sqlite3.Connection, customer_id: str, args: BillArguments):
    if args.billing_month is None:
        query, params = (
            "WHERE customer_id = ? ORDER BY billing_month DESC LIMIT 1", (customer_id,)
        )
    else:
        query, params = "WHERE customer_id = ? AND billing_month = ?", (customer_id, args.billing_month)
    row = conn.execute(
        f"SELECT bill_id, billing_month, amount, due_date, payment_status FROM bills {query}", params
    ).fetchone()
    if row is None:
        return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
    bill_id, month, amount, due, status = row
    return success(
        {"bill_id": bill_id, "billing_month": month, "amount": amount, "due_date": due, "payment_status": status}
    )


# 工具白名單：名稱 -> (輸入模型, handler)
TOOLS = {
    "get_my_subscription": (NoArguments, get_my_subscription),
    "get_my_bill": (BillArguments, get_my_bill),
}


class PolicyArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: Annotated[str, Field(min_length=1, max_length=500, strict=True)]


def make_search_policy(get_retriever):
    def search_policy(_conn: sqlite3.Connection, _customer_id: str, args: PolicyArguments):
        try:
            matches = get_retriever().search(args.query)
        except PolicySearchError:
            return error_response(500, "INTERNAL_ERROR", "政策檢索服務暫時無法使用，無法確認政策內容。")
        if not matches:
            return error_response(422, "INSUFFICIENT_EVIDENCE", "知識庫沒有足夠的政策依據，無法確認。")
        return success({"matches": matches})

    return search_policy


class ToolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    arguments: dict[str, Any] = {}


def create_app(
    db_path: str | None = None, internal_token: str | None = None, policy_retriever=None
) -> FastAPI:
    db_path = db_path or os.environ.get("SQLITE_PATH", "./.local/telcocare.sqlite3")
    token = internal_token if internal_token is not None else os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    lazy: dict = {}

    def get_retriever():
        if policy_retriever is not None:
            return policy_retriever
        if "r" not in lazy:  # 延遲載入，避免未使用 RAG 時啟動就載入模型
            try:
                from backend.rag.embedder import E5Embedder

                lazy["r"] = PolicyRetriever(rag_config.chroma_path(), E5Embedder())
            except Exception as e:
                raise PolicySearchError(f"嵌入模型載入失敗：{e}") from e
        return lazy["r"]

    tools = {**TOOLS, "search_policy": (PolicyArguments, make_search_policy(get_retriever))}

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
        if tool_name not in tools:
            return error_response(404, "NOT_FOUND", "不存在的工具。")
        customer_id = request.headers.get("X-Demo-Customer-Id", "")
        conn = connect(db_path)
        try:
            if conn.execute("SELECT 1 FROM customers WHERE customer_id = ?", (customer_id,)).fetchone() is None:
                return error_response(403, "FORBIDDEN", "為保護客戶資料，我只能查詢目前 Demo 帳戶的資訊。")
            try:
                body = ToolRequest.model_validate(await request.json())
                model, handler = tools[tool_name]
                args = model.model_validate(body.arguments)
            except (ValidationError, ValueError):
                return error_response(422, "VALIDATION_ERROR", "工具參數無效。")
            return handler(conn, customer_id, args)
        finally:
            conn.close()

    return app


def app_factory() -> FastAPI:
    return create_app()
