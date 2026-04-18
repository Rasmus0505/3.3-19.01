from __future__ import annotations

import sqlite3
from pathlib import Path

from app.services.dictionary_service import classify_tokens


def _build_test_dictionary(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE entries (
            lemma TEXT PRIMARY KEY,
            phonetic TEXT,
            translation TEXT,
            pos TEXT,
            exchange TEXT,
            collins INTEGER,
            oxford INTEGER NOT NULL DEFAULT 0,
            tags TEXT,
            frq_rank INTEGER,
            bnc_rank INTEGER
        );
        CREATE TABLE lookup_keys (
            lookup_key TEXT PRIMARY KEY,
            lemma TEXT NOT NULL
        );
        """
    )
    conn.execute(
        "INSERT INTO entries (lemma, phonetic, translation, pos, exchange, collins, oxford, tags, frq_rank, bnc_rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("perceive", "pəˈsiːv", "察觉", "v", "perceived, perceiving, perceives", 2, 0, "研四六托雅", 2165, 2776),
    )
    conn.execute("INSERT INTO lookup_keys (lookup_key, lemma) VALUES (?, ?)", ("perceive", "perceive"))
    conn.execute("INSERT INTO lookup_keys (lookup_key, lemma) VALUES (?, ?)", ("perceiving", "perceive"))
    conn.commit()
    conn.close()


def test_dictionary_service_classifies_lookup_and_band(tmp_path):
    db_path = tmp_path / "dictionary.sqlite"
    _build_test_dictionary(db_path)

    results = classify_tokens(["perceiving", "unknown"], user_collins_level=3, db_path=str(db_path))

    assert results[0]["lemma"] == "perceive"
    assert results[0]["collins"] == 2
    assert results[0]["band"] == "i_plus_one"
    assert results[1]["matched"] is False
    assert results[1]["band"] == "unrated"
