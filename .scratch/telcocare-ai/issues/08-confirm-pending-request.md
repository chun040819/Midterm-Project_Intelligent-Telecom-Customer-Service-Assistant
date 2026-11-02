# 08: 確認並建立唯一待審申請

**What to build:** 使用者點擊有效卡片確認後取得唯一待審申請；重複點擊不重複建立，也不立即改變訂閱。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 07：評估方案變更與取消 Quote

**Status:** ready-for-agent

- [ ] 僅有效卡片 Action 經同源、Session、Quote 驗證後可建立受信任寫入 Context；模型 Props、工具參數與 confirmed 旗標不能授權。
- [ ] FastAPI 在同一交易內先查同 Quote，再檢查目前訂閱、目標有效性、合約資格及其他 Pending；以唯一索引處理競爭，不依賴前端停用按鈕。
- [ ] T08 新增恰一筆 PENDING、回真實 request_id，C0001 訂閱仍 P499；T09 同 Quote 回同一 request_id 與 already_existed=true。
- [ ] 卡片呈現 READY、SUBMITTING、SUCCESS／ERROR；成功 commit 後才消耗 Quote 並回報待審狀態，Action 結果更新 UI 與必要對話事件。
- [ ] E10 寫入結果不明時先查同一已授權 Quote 的既有紀錄，不自動重送 INSERT；失去 Session／確認關聯後不得僅靠 Quote ID 取資料。
- [ ] 驗證並行確認、其他 Quote Pending 衝突、取消／過期／切換／舊訂閱變動與錯誤回應，不產生未授權或重複寫入。
