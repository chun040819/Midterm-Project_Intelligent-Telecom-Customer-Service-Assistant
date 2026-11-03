# Issue tracker: Local Markdown

- 主要設計來源為 `docs/SPEC.md`，不複製或搬移既有規格。
- 每項功能的工單存於 `.scratch/<feature-slug>/issues/`。
- 每張工單一個檔案：`<NN>-<slug>.md`，從 01 開始，依阻擋關係排序。
- 工單開頭記錄 `Status` 與 `Blocked by`。
- `Blocked by` 列出前置工單的編號與標題；沒有則註明無。
- 只有所有前置工單均為 `resolved` 時，工單才可開始。
- 評論與討論追加於工單底部的 `## Comments`。
- 發布工單即建立上述本機檔案，不建立遠端 Issue。
- 狀態用語依 `triage-labels.md`。
