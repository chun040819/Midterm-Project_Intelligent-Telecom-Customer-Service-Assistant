import os

# 單機教學 Demo：關閉 ChromaDB 匿名遙測（離線時會造成卡頓）。須在匯入 chromadb 前設定。
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
