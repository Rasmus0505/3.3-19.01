from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
IMMERSIVE_PAGE_FILE = REPO_ROOT / "frontend" / "src" / "features" / "immersive" / "ImmersiveLessonPage.jsx"
IMMERSIVE_MACHINE_FILE = REPO_ROOT / "frontend" / "src" / "features" / "immersive" / "immersiveSessionMachine.js"
LEARNING_SETTINGS_FILE = REPO_ROOT / "frontend" / "src" / "features" / "immersive" / "learningSettings.js"


def test_phase08_immersive_contract_is_present():
    immersive_page_source = IMMERSIVE_PAGE_FILE.read_text(encoding="utf-8")
    immersive_machine_source = IMMERSIVE_MACHINE_FILE.read_text(encoding="utf-8")
    learning_settings_source = LEARNING_SETTINGS_FILE.read_text(encoding="utf-8")

    assert "LESSON_LOADED" in immersive_machine_source
    assert "PLAYBACK_FINISHED" in immersive_machine_source
    assert "ANSWER_COMPLETED" in immersive_machine_source
    assert "singleSentenceLoopEnabled" in learning_settings_source
    assert "单句循环" in immersive_page_source
    assert "0.75x" in immersive_page_source
    assert "0.90x" in immersive_page_source
    assert "1.00x" in immersive_page_source
    assert 'aria-label="播放上一句"' in immersive_page_source
    assert "setShowFullscreenPreviousSentence(false)" not in immersive_page_source
