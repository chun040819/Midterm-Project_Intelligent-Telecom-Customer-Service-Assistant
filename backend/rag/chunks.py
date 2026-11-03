"""讀取 knowledge/*.md 並依章節（`## 標題 {#section_id}`）切片（SPEC §8.2）。"""
import re
from dataclasses import dataclass
from pathlib import Path

_SECTION = re.compile(r"^##\s+(?P<title>.+?)\s*\{#(?P<id>[a-z0-9_]+)\}\s*$")


@dataclass(frozen=True)
class Chunk:
    document_id: str
    title: str
    section_id: str
    section_title: str
    content: str
    source_path: str

    @property
    def chunk_id(self) -> str:
        return f"{self.document_id}#{self.section_id}"


def load_chunks(knowledge_dir: Path | str) -> list[Chunk]:
    """每個 `##` 章節一個 Chunk；source_path 固定為 `knowledge/<檔名>` 相對路徑。"""
    chunks: list[Chunk] = []
    for path in sorted(Path(knowledge_dir).glob("*.md")):
        title = None
        current: dict | None = None
        body: list[str] = []

        def flush():
            if current is not None:
                content = "\n".join(body).strip()
                if not content:
                    raise ValueError(f"{path.name}#{current['id']} 沒有內容")
                chunks.append(
                    Chunk(path.stem, title, current["id"], current["title"], content, f"knowledge/{path.name}")
                )

        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
            elif line.startswith("## "):
                flush()
                m = _SECTION.match(line)
                if m is None:
                    raise ValueError(f"{path.name} 的章節缺少 {{#section_id}}: {line}")
                current, body = {"title": m["title"], "id": m["id"]}, []
            elif current is not None:
                body.append(line)
        flush()
    return chunks
