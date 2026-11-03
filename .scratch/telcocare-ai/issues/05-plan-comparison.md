# 05: 比較有效資費方案

**What to build:** 使用者可按預算查詢有效方案，透過比較表與圖表理解價格、流量差異並多輪追問。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** resolved

- [x] list_plans 只回有效方案，max_monthly_fee 限非負整數；無符合方案回成功空清單。
- [x] PlanComparison 與 PlanChart 解析同一可信資料引用，支援月租或流量圖表；模型選定方案只能是已返回的子集。
- [x] T05 的 P499/P699/P999 為 499/699/999 元與 25/60/100 GB，表圖一致；無效引用或模型新增方案不得顯示假資料。
- [x] 多輪問題可承接前一輪目標方案並用可信訂閱數值計算差額；具篩選、圖表、引用驗證及真模型證據。

## Comments

- 2026-11-03 實作完成：FastAPI `list_plans`（只回 is_active=1、max_monthly_fee 為 strict 非負整數、null/負數/小數/字串/額外欄位 422、無符合回 success 空清單）、Next.js zod 輸入與 route 註冊、`lib/plan-view.ts`（selectPlans 只取可信子集、chartRows、parsePlansEnvelope）、PlanComparison／PlanChart（同一 data_ref，monthly_fee／data_limit_gb）、toolkit 註冊、System Prompt 補充（多輪承接目標方案、以 get_my_subscription 的可信月租計算差額）。pytest 44、vitest 43、tsc 通過。
- 2026-11-03 驗證限制（如實）：此 worktree 沒有 LLM 環境設定（無 .env／LLM_BASE_URL／LLM_API_KEY），未執行真模型往返驗證；T05 的 499/699/999 與 25/60/100 僅以 pytest（對 seed DB）與 vitest（表圖共用同一可信資料）證明。真模型驗證（T05 與多輪差額追問）待有金鑰環境補做。
- 2026-11-03 補充真模型瀏覽器驗證：C0001 詢問「比較 P499、P699、P999 的價格和高速流量」，`list_plans` 回傳正確數值，但模型將 GenUI 節點輸出為文字，未呼叫 `present`，因此未顯示受控比較表與圖表，T05 畫面驗收未通過。接著詢問「我想了解 P699」及「那跟我現在方案差多少？」時，模型呼叫 `get_my_subscription`，正確承接 P699，回答 P499 499 元、P699 699 元、每月差額 200 元。完整自動測試：後端 99 passed、11 skipped；前端 83 passed；typecheck 通過。工單維持未完成，須修正並重驗比較表與圖表。
- 2026-11-03 修正執行提示後，以同一真模型與瀏覽器重新執行 T05：模型呼叫 `list_plans` 並呈現受控 PlanComparison，以及月租和流量的 PlanChart；表與圖均為 P499 499 元／25 GB、P699 699 元／60 GB、P999 999 元／100 GB。這是一次真模型觀察，不能保證每次模型輸出一致。預算篩選、無效引用與方案子集由既有受控自動測試驗證。
- 2026-11-03 審查後限縮提示範圍並保留空結果與純文字降級，再次真模型執行 T05：顯示三方案受控比較表與月租圖，數值正確；此次未自動顯示流量圖。降級路徑未以真模型故障注入驗證。

## Answer

已完成有效資費查詢、比較表與圖表及多輪差額查詢。真模型瀏覽器驗證與受控自動測試的證據分別記錄於上方。
