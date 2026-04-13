from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORDBOOK_PANEL = ROOT / "frontend" / "src" / "features" / "wordbook" / "WordbookPanel.jsx"
UPLOAD_PANEL = ROOT / "frontend" / "src" / "features" / "upload" / "UploadPanel.jsx"


def test_wordbook_panel_exposes_review_entry_contract():
    source = WORDBOOK_PANEL.read_text(encoding="utf-8")
    assert "开始复习" in source
    assert "重来" in source
    assert "很吃力" in source
    assert "想起来了" in source
    assert "很轻松" in source
    assert "next_review_at" in source
    assert "单词" not in source
    assert "短语" not in source


def test_upload_panel_uses_bottle_names_only():
    source = UPLOAD_PANEL.read_text(encoding="utf-8")
    assert "Bottle 1.0" in source
    assert "Bottle 2.0" in source
    assert "下载桌面端" in source
    assert "网页端直接开始 Bottle 1.0" not in source
    assert "本机识别" not in source
    assert "云端识别" not in source
