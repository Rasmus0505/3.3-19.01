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
    assert 'aria-label="播放上一句"' in immersive_page_source
    assert 'aria-label="跳转到指定句子"' in immersive_page_source
    assert 'aria-label="播放倍速"' in immersive_page_source
    assert "精听" in immersive_page_source
    assert "固定" in immersive_page_source
    assert "重置" in immersive_page_source
    assert 'aria-label="播放上一句"' in immersive_page_source
    assert "commitSentenceJumpValue" in immersive_page_source
    assert "handlePlaybackRateInputBlur" in immersive_page_source
    assert "setShowFullscreenPreviousSentence(false)" not in immersive_page_source
    assert "selectedPlaybackRate: state.selectedPlaybackRate" in immersive_machine_source
