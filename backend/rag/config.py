"""RAG 固定設定（SPEC §8.2）。"""
import os

MODEL_NAME = "intfloat/multilingual-e5-small"
# 固定模型版本（Hugging Face commit SHA），避免上游更新改變嵌入而使閾值失效。
MODEL_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
MAX_TOKENS = 512
TOP_K = 3
# 校準後的 Chroma cosine distance 上限（超過即視為無關）。
# 以 scripts/calibrate_policy.py 實測（e5-small@上述 revision）：正向問題（含 SPEC §8.1 範例「為何 10 月是 499？」0.120）預期章節最大距離 0.135，
# 負向問題最近距離最小 0.1595；取 0.14 落在兩者之間。e5 距離分佈本身偏窄，換模型／改文件須重新校準。
MAX_DISTANCE = 0.14

DEFAULT_CHROMA_PATH = "./.local/chroma"
COLLECTION = "policy"


def chroma_path() -> str:
    return os.environ.get("CHROMA_PATH", DEFAULT_CHROMA_PATH)
