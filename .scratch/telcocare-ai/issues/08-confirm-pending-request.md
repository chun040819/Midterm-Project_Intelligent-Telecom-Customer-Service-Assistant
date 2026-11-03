# 08: 確認並建立唯一待審申請

**What to build:** 使用者點擊有效卡片確認後取得唯一待審申請；重複點擊不重複建立，也不立即改變訂閱。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 07：評估方案變更與取消 Quote

**Status:** resolved

- [x] 僅有效卡片 Action 經同源、Session、Quote 驗證後可建立受信任寫入 Context；模型 Props、工具參數與 confirmed 旗標不能授權。
- [x] FastAPI 在同一交易內先查同 Quote，再檢查目前訂閱、目標有效性、合約資格及其他 Pending；以唯一索引處理競爭，不依賴前端停用按鈕。
- [x] T08 新增恰一筆 PENDING、回真實 request_id，C0001 訂閱仍 P499；T09 同 Quote 回同一 request_id 與 already_existed=true。
- [x] 卡片呈現 READY、SUBMITTING、SUCCESS／ERROR；成功 commit 後才消耗 Quote 並回報待審狀態，Action 結果更新 UI 與必要對話事件。
- [x] E10 寫入結果不明時先查同一已授權 Quote 的既有紀錄，不自動重送 INSERT；失去 Session／確認關聯後不得僅靠 Quote ID 取資料。
- [x] 驗證並行確認、其他 Quote Pending 衝突、取消／過期／切換／舊訂閱變動與錯誤回應，不產生未授權或重複寫入。

## Comments

- 2026-11-03 實作完成：FastAPI 新增受信任 Action 路徑 `/internal/actions/confirm_plan_change`（單一 `BEGIN IMMEDIATE` 交易：先查同 Quote → 重驗訂閱／目標／資格／其他 Pending → INSERT，唯一索引競爭時回查既有紀錄）與只讀 `find_plan_change_request`；通用 `create_plan_change_request` 工具仍一律 CONFIRMATION_REQUIRED。Next.js `confirmPlanChange` 以 Session 內 Quote 綁定資料組請求，commit 後才消耗 Quote（確認期間被取消仍以 DB 事實為準）；E10 先查同 Quote 既有紀錄，不自動重送。PlanChangeCard 新增 SUBMITTING／SUCCESS／錯誤顯示。
- 驗證：pytest、tsc、vitest 93 通過（含並行、T08／T09、E10、取消／過期／切換／跨 Session）。
- 2026-11-03 補驗：真模型＋Chrome 實測。C0001 要求升級 P699 → 出 PlanChangeCard，點「確認送出」顯示送出中，隨後卡片轉為成功（待審核、申請編號 R-E914B3A36148），SQLite 恰一筆 PENDING、C0001 訂閱仍 P499（T08）；接著要求升級 P999，真模型回「目前已有待審核的資費變更申請，無法重複建立。」且不出卡片（T11）。T09 重複確認由 pytest（同 request_id、already_existed=true）與 vitest 涵蓋。測試後已 reset-demo。
- 取捨：成功後不另追加聊天訊息（SPEC §7.5「視需要」，卡片已顯示 request_id／狀態）；CONFLICT 以固定句呈現，不展示原申請內容。所有驗收項完成，Status 改為 resolved。
