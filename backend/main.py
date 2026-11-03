import hmac
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.concurrency import run_in_threadpool
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


class PlansArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # 預設值不經驗證；明確傳入 null、負數、小數、字串或布林仍會被拒絕。
    max_monthly_fee: Annotated[int, Field(ge=0, strict=True)] = None  # type: ignore[assignment]


def list_plans(conn: sqlite3.Connection, _customer_id: str, args: PlansArguments):
    ceiling = args.max_monthly_fee
    rows = conn.execute(
        """SELECT plan_id, name, monthly_fee, data_limit_gb, voice_minutes, is_active
           FROM plans WHERE is_active = 1 AND (? IS NULL OR monthly_fee <= ?)
           ORDER BY monthly_fee, plan_id""",
        (ceiling, ceiling),
    ).fetchall()
    return success(
        {
            "plans": [
                {
                    "plan_id": pid, "name": name, "monthly_fee": fee,
                    "data_limit_gb": gb, "voice_minutes": mins, "is_active": bool(active),
                }
                for pid, name, fee, gb, mins, active in rows
            ]
        }
    )


class UsageArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # 預設值不經驗證；明確傳入 null 或無效月份仍會被拒絕，不視為省略。
    month: Month = None  # type: ignore[assignment]


def get_my_usage(conn: sqlite3.Connection, customer_id: str, args: UsageArguments):
    # 月份額度取自目前訂閱方案（SPEC §4.2）；剩餘／超額由已用量與額度計算，不為負值。
    if args.month is None:
        where, params = "u.customer_id = ? ORDER BY u.month DESC LIMIT 1", (customer_id,)
    else:
        where, params = "u.customer_id = ? AND u.month = ?", (customer_id, args.month)
    row = conn.execute(
        "SELECT u.month, p.data_limit_gb, u.data_used_gb, u.voice_used_minutes "
        "FROM usage_records u JOIN subscriptions s ON s.customer_id = u.customer_id "
        f"JOIN plans p ON p.plan_id = s.plan_id WHERE {where}",
        params,
    ).fetchone()
    if row is None:
        return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
    month, limit, used, minutes = row
    return success(
        {
            "month": month, "data_limit_gb": limit, "data_used_gb": used,
            "remaining_data_gb": round(max(0.0, limit - used), 6),
            "exceeded_data_gb": round(max(0.0, used - limit), 6),
            "voice_used_minutes": minutes,
        }
    )


DEFAULT_BUSINESS_DATE = "2026-11-03"


def business_date() -> str:
    """固定業務判定日（SPEC §4），單一來源為 .env 的 DEMO_BUSINESS_DATE；Quote 期限不使用它。"""
    return os.environ.get("DEMO_BUSINESS_DATE") or DEFAULT_BUSINESS_DATE


def ineligible_reason(new_plan_id: str, cur_plan_id: str, delta: int, contract_end: str) -> str | None:
    if new_plan_id == cur_plan_id:
        return "SAME_PLAN"
    if delta < 0 and business_date() < contract_end:  # 到期當天起可降級
        return "DOWNGRADE_BEFORE_CONTRACT_END"
    return None


class EstimateArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_plan_id: Annotated[str, Field(pattern=r"^P[0-9]{3}$", strict=True)]


def estimate_plan_change(conn: sqlite3.Connection, customer_id: str, args: EstimateArguments):
    """只計算資格、新舊方案、價差與政策 refs；Quote 由 Next.js 建立（GAP-01），此處不寫入。"""
    target = conn.execute(
        "SELECT monthly_fee FROM plans WHERE plan_id = ? AND is_active = 1", (args.new_plan_id,)
    ).fetchone()
    current = conn.execute(
        "SELECT p.plan_id, p.monthly_fee, s.contract_end_date, s.subscription_id FROM subscriptions s "
        "JOIN plans p ON p.plan_id = s.plan_id WHERE s.customer_id = ?",
        (customer_id,),
    ).fetchone()
    if target is None or current is None:
        return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
    if conn.execute(
        "SELECT 1 FROM plan_change_requests WHERE customer_id = ? AND status = 'PENDING'", (customer_id,)
    ).fetchone():
        return error_response(409, "CONFLICT", "目前已有待審核的資費變更申請，無法重複建立。")
    cur_id, cur_fee, contract_end, subscription_id = current
    new_fee = target[0]
    delta = new_fee - cur_fee
    reason = ineligible_reason(args.new_plan_id, cur_id, delta, contract_end)
    refs = ["plan_change_policy#upgrade_rules" if delta > 0 else "plan_change_policy#downgrade_rules"]
    if reason == "SAME_PLAN":
        refs = []
    elif reason is None:
        refs.append("plan_change_policy#review_rule")
    return success(
        {
            "eligible": reason is None, "reason_code": reason,
            "current_plan_id": cur_id, "new_plan_id": args.new_plan_id,
            "current_monthly_fee": cur_fee, "new_monthly_fee": new_fee, "monthly_delta": delta,
            "quote_id": None, "expires_at": None, "policy_refs": refs,
            # 內部欄位：供 Next.js 綁定 Quote 與訂閱，不屬模型可見契約，Next.js 會移除。
            "subscription_id": subscription_id,
        }
    )


class CreateRequestArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quote_id: Annotated[str, Field(min_length=1, max_length=100, strict=True)]


def create_plan_change_request(_conn: sqlite3.Connection, _customer_id: str, _args: CreateRequestArguments):
    # SPEC §5.5／§7：此通用工具入口沒有受信任的寫入授權 Context，一律拒絕且不寫入。
    # 授權寫入只走 /internal/actions/confirm_plan_change（由 Next.js confirm Action 驗證後呼叫）。
    return error_response(
        409, "CONFIRMATION_REQUIRED", "請先查看方案變更確認卡片，並點擊『確認送出』才會建立待審申請。"
    )


class ConfirmArguments(BaseModel):
    """Next.js 依 Session 內 Quote 組成；不含任何 confirmed 旗標，授權來自受信任的 Action 路徑本身。"""

    model_config = ConfigDict(extra="forbid")
    quote_id: Annotated[str, Field(min_length=1, max_length=100, strict=True)]
    subscription_id: Annotated[str, Field(min_length=1, max_length=50, strict=True)]
    old_plan_id: Annotated[str, Field(pattern=r"^P[0-9]{3}$", strict=True)]
    new_plan_id: Annotated[str, Field(pattern=r"^P[0-9]{3}$", strict=True)]


class LookupArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quote_id: Annotated[str, Field(min_length=1, max_length=100, strict=True)]


_REQUEST_COLUMNS = "request_id, quote_id, old_plan_id, new_plan_id, status, created_at"


def _created(row: tuple, already_existed: bool) -> dict:
    request_id, quote_id, old_plan, new_plan, status, created_at = row
    return {
        "request_id": request_id, "quote_id": quote_id, "old_plan_id": old_plan,
        "new_plan_id": new_plan, "status": status, "created_at": created_at,
        "already_existed": already_existed,
    }


def _existing_for_quote(conn: sqlite3.Connection, customer_id: str, quote_id: str):
    """同一已授權 Quote 的既有申請；只查目前客戶自己的紀錄，不因 quote_id 外洩他人資料。"""
    return conn.execute(
        f"SELECT {_REQUEST_COLUMNS} FROM plan_change_requests WHERE quote_id = ? AND customer_id = ?",
        (quote_id, customer_id),
    ).fetchone()


CONFLICT_MESSAGE = "目前已有待審核的資費變更申請，無法重複建立。"


def confirm_plan_change(conn: sqlite3.Connection, customer_id: str, args: ConfirmArguments):
    """受信任 Action 的原子寫入：先查同 Quote（冪等），再重驗訂閱、目標、資格與 Pending，最後依賴唯一索引。"""
    conn.isolation_level = None  # 手動交易
    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = _existing_for_quote(conn, customer_id, args.quote_id)
        if existing:
            conn.execute("ROLLBACK")
            return JSONResponse(status_code=200, content=success(_created(existing, True)))
        current = conn.execute(
            "SELECT s.subscription_id, p.plan_id, p.monthly_fee, s.contract_end_date FROM subscriptions s "
            "JOIN plans p ON p.plan_id = s.plan_id WHERE s.customer_id = ?",
            (customer_id,),
        ).fetchone()
        target = conn.execute(
            "SELECT monthly_fee FROM plans WHERE plan_id = ? AND is_active = 1", (args.new_plan_id,)
        ).fetchone()
        if current is None or target is None:
            conn.execute("ROLLBACK")
            return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
        sub_id, cur_plan, cur_fee, contract_end = current
        if sub_id != args.subscription_id or cur_plan != args.old_plan_id:
            conn.execute("ROLLBACK")
            return error_response(409, "CONFLICT", "您的訂閱已有變動，請重新評估方案變更。")
        if ineligible_reason(args.new_plan_id, cur_plan, target[0] - cur_fee, contract_end):
            conn.execute("ROLLBACK")
            return error_response(409, "CONFLICT", "目前條件不符合此方案變更，請重新評估。")
        if conn.execute(
            "SELECT 1 FROM plan_change_requests WHERE customer_id = ? AND status = 'PENDING'", (customer_id,)
        ).fetchone():
            conn.execute("ROLLBACK")
            return error_response(409, "CONFLICT", CONFLICT_MESSAGE)
        request_id = f"R-{uuid.uuid4().hex[:12].upper()}"
        created_at = datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds")
        try:
            conn.execute(
                "INSERT INTO plan_change_requests VALUES (?,?,?,?,?,'PENDING',?)",
                (request_id, args.quote_id, customer_id, cur_plan, args.new_plan_id, created_at),
            )
        except sqlite3.IntegrityError:  # 唯一索引：競爭下的 Pending／Quote 重複
            conn.execute("ROLLBACK")
            raced = _existing_for_quote(conn, customer_id, args.quote_id)
            if raced:
                return JSONResponse(status_code=200, content=success(_created(raced, True)))
            return error_response(409, "CONFLICT", CONFLICT_MESSAGE)
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    return JSONResponse(
        status_code=201,
        content=success(_created((request_id, args.quote_id, cur_plan, args.new_plan_id, "PENDING", created_at), False)),
    )


def find_plan_change_request(conn: sqlite3.Connection, customer_id: str, args: LookupArguments):
    """E10：結果不明時只讀查詢同一 Quote 的既有申請（呼叫端須已確認 Session／Quote 關聯）。"""
    existing = _existing_for_quote(conn, customer_id, args.quote_id)
    if existing is None:
        return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
    return success(_created(existing, True))


class StatusArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # 預設值不經驗證；明確傳入 null、空字串或過長字串仍會被拒絕。
    request_id: Annotated[str, Field(min_length=1, max_length=100, strict=True)] = None  # type: ignore[assignment]


def get_plan_change_status(conn: sqlite3.Connection, customer_id: str, args: StatusArguments):
    """只讀；永遠限定目前客戶。他人或不存在的 request_id 回同一個 NOT_FOUND，不區分。"""
    if args.request_id is None:
        where, params = "customer_id = ?", (customer_id,)
    else:
        where, params = "customer_id = ? AND request_id = ?", (customer_id, args.request_id)
    row = conn.execute(
        "SELECT request_id, old_plan_id, new_plan_id, status, created_at FROM plan_change_requests "
        f"WHERE {where} ORDER BY created_at DESC, request_id DESC LIMIT 1",
        params,
    ).fetchone()
    if row is None:
        return error_response(404, "NOT_FOUND", "目前查詢不到符合條件的資料，請確認查詢條件。")
    request_id, old_plan, new_plan, status, created_at = row
    return success(
        {"request_id": request_id, "old_plan_id": old_plan, "new_plan_id": new_plan,
         "status": status, "created_at": created_at}
    )


# 工具白名單：名稱 -> (輸入模型, handler)
TOOLS = {
    "get_plan_change_status": (StatusArguments, get_plan_change_status),
    "create_plan_change_request": (CreateRequestArguments, create_plan_change_request),
    "estimate_plan_change": (EstimateArguments, estimate_plan_change),
    "list_plans": (PlansArguments, list_plans),
    "get_my_subscription": (NoArguments, get_my_subscription),
    "get_my_bill": (BillArguments, get_my_bill),
    "get_my_usage": (UsageArguments, get_my_usage),
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
                from backend.rag.embedder import CloudEmbedder

                lazy["r"] = PolicyRetriever(rag_config.chroma_path(), CloudEmbedder())
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

    def authorized_conn(request: Request):
        """驗證內部 Token 與客戶；回傳 (conn, customer_id) 或錯誤 Response。"""
        supplied = request.headers.get("X-Internal-Token", "")
        if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
            return error_response(403, "FORBIDDEN", "無權存取。")
        customer_id = request.headers.get("X-Demo-Customer-Id", "")
        conn = connect(db_path, cross_thread=True)
        if conn.execute("SELECT 1 FROM customers WHERE customer_id = ?", (customer_id,)).fetchone() is None:
            conn.close()
            return error_response(403, "FORBIDDEN", "為保護客戶資料，我只能查詢目前 Demo 帳戶的資訊。")
        return conn, customer_id

    async def run_handler(request: Request, model, handler, *, wrap_body: bool):
        auth = authorized_conn(request)
        if isinstance(auth, JSONResponse):
            return auth
        conn, customer_id = auth
        try:
            try:
                payload = await request.json()
                if wrap_body:
                    payload = ToolRequest.model_validate(payload).arguments
                args = model.model_validate(payload)
            except (ValidationError, ValueError):
                return error_response(422, "VALIDATION_ERROR", "工具參數無效。")
            return await run_in_threadpool(handler, conn, customer_id, args)
        finally:
            conn.close()

    @app.post("/internal/tools/{tool_name}")
    async def run_tool(tool_name: str, request: Request):
        supplied = request.headers.get("X-Internal-Token", "")
        if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
            return error_response(403, "FORBIDDEN", "無權存取。")
        if tool_name not in tools:
            return error_response(404, "NOT_FOUND", "不存在的工具。")
        model, handler = tools[tool_name]
        return await run_handler(request, model, handler, wrap_body=True)

    # 受信任 Action 路徑（SPEC §5.5／§6.2）：不屬模型可見工具，只有 Next.js confirm Route 驗證後才會呼叫。
    @app.post("/internal/actions/confirm_plan_change")
    async def confirm_action(request: Request):
        return await run_handler(request, ConfirmArguments, confirm_plan_change, wrap_body=False)

    @app.post("/internal/actions/find_plan_change_request")
    async def find_action(request: Request):
        return await run_handler(request, LookupArguments, find_plan_change_request, wrap_body=False)

    return app


def app_factory() -> FastAPI:
    return create_app()
