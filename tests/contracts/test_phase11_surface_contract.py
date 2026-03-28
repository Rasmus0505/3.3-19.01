from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
UPLOAD_PANEL = ROOT / "frontend" / "src" / "features" / "upload" / "UploadPanel.jsx"
INPUT_COMPONENT = ROOT / "frontend" / "src" / "components" / "ui" / "input.jsx"
ADMIN_RATES_TAB = ROOT / "frontend" / "src" / "features" / "admin-rates" / "AdminRatesTab.jsx"


def test_phase11_upload_surface_contract():
    source = UPLOAD_PANEL.read_text(encoding="utf-8")
    assert "选择学习素材质量" in source
    assert "选择字幕生成方式" not in source
    assert "客户端专属" in source
    assert "通用素材生成" in source
    assert "网站/客户端" in source
    assert "更强大的AI模型" in source
    assert "适合复杂视频" in source
    assert "余额不足，充值后即可继续生成当前内容" in source
    assert "充值后生成" in source
    assert "稍后再试" in source
    assert "Bottle 1.0 仅支持在客户端使用，请下载桌面端继续" in source
    assert "我知道了" in source
    assert "链接导入仅支持在客户端使用，请下载桌面端继续" in source
    assert "继续上传本地文件" in source
    assert "当前素材推荐使用客户端生成，效果和稳定性更好" in source
    assert "继续生成素材" in source
    assert "继续当前流程" not in source
