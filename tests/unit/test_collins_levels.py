from __future__ import annotations

from app.services.collins_levels import classify_collins_band, legacy_learning_level_to_collins


def test_classify_collins_band_uses_dictionary_direction():
    assert classify_collins_band(collins=5, user_collins_level=5) == "default"
    assert classify_collins_band(collins=4, user_collins_level=5) == "i_plus_one"
    assert classify_collins_band(collins=3, user_collins_level=5) == "above_i_plus_one"
    assert classify_collins_band(collins=None, user_collins_level=5) == "unrated"


def test_legacy_level_mapping_for_backfill():
    assert legacy_learning_level_to_collins("B1") == 3
    assert legacy_learning_level_to_collins("A2") == 4
