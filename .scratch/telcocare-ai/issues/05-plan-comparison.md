# 05: 比較有效資費方案

**What to build:** 使用者可按預算查詢有效方案，透過比較表與圖表理解價格、流量差異並多輪追問。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** ready-for-agent

- [x] list_plans 只回有效方案，max_monthly_fee 限非負整數；無符合方案回成功空清單。
- [x] PlanComparison 與 PlanChart 解析同一可信資料引用，支援月租或流量圖表；模型選定方案只能是已返回的子集。
- [x] T05 的 P499/P699/P999 為 499/699/999 元與 25/60/100 GB，表圖一致；無效引用或模型新增方案不得顯示假資料。
- [ ] 多輪問題可承接前一輪目標方案並用可信訂閱數值計算差額；具篩選、圖表、引用驗證及真模型證據。

## Comments

- 2026-11-03 實作完成：FastAPI `list_plans`（只回 is_active=1、max_monthly_fee 為 strict 非負整數、null/負數/小數/字串/額外欄位 422、無符合回 success 空清單）、Next.js zod 輸入與 route 註冊、`lib/plan-view.ts`（selectPlans 只取可信子集、chartRows、parsePlansEnvelope）、PlanComparison／PlanChart（同一 data_ref，monthly_fee／data_limit_gb）、toolkit 註冊、System Prompt 補充（多輪承接目標方案、以 get_my_subscription 的可信月租計算差額）。pytest 44、vitest 43、tsc 通過。
- 2026-11-03 驗證限制（如實）：此 worktree 沒有 LLM 環境設定（無 .env／LLM_BASE_URL／LLM_API_KEY），未執行真模型往返驗證；T05 的 499/699/999 與 25/60/100 僅以 pytest（對 seed DB）與 vitest（表圖共用同一可信資料）證明。真模型驗證（T05 與多輪差額追問）待有金鑰環境補做。
