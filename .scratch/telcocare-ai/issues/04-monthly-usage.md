# 04: 查詢流量與超額狀態

**What to build:** 使用者可查歷史月份用量，清楚看見已用、剩餘與超額。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** ready-for-agent

- [x] get_my_usage 與 UsageCard 顯示月份、額度、用量、語音分鐘及進度；剩餘與超額依規格計算且不為負值。
- [x] 省略月份使用該客戶最新資料並說明；無效月份拒絕，無資料回 NOT_FOUND，不捏造降速 Mbps 或額外費用。
- [x] T03 為 17.8/25 GB、剩餘 7.2、超額 0、語音 42；T04 無 11 月資料；T12 為 105/100 GB、剩餘 0、超額 5，另驗證接近上限客戶。
- [ ] 具計算與參數測試、資料庫對照及真模型卡片流程證據。

## Comments

- 2026-11-03 實作完成：FastAPI `get_my_usage`（沿用 strict 月份 pattern、extra=forbid、null 不視為省略、省略取該客戶最新月份；額度取自目前訂閱方案，remaining／exceeded 以 max(0, …) 計算，不含降速 Mbps 或額外費用）、Next.js zod 輸入與 UsageResultSchema、UsageCard（進度條、已用／剩餘／超額／語音）、toolkit 註冊、System Prompt 補充。驗證：pytest 53 passed（含 T03 C0001 17.8/25、T04 2026-11 NOT_FOUND、T12 C0003 105/100 剩餘 0 超額 5、C0002 接近上限 58/60、剛好達上限不為負值、與 DB 對照、無效參數）；vitest 40 passed；tsc --noEmit 通過。
- 真模型卡片流程驗證：本次 worktree 環境未執行（無 .env／模型金鑰與瀏覽器串流驗證），尚未取得真模型工具與卡片往返證據。此項待於主環境以 /api/chat 實測補驗（「10 月用了多少流量？」「11 月流量？」C0003「這個月流量？」）。
- 狀態說明：因真模型證據尚缺，最後一項驗收未勾選，Status 暫維持 ready-for-agent，補驗後再改 resolved。
