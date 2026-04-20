from types import SimpleNamespace

from app.models.lesson import LessonSentence
from app.models.user import User
from app.services.dictation_service import generate_dictation_lesson


def test_generate_dictation_lesson_persists_vocabulary_analysis(db_session, monkeypatch):
    user = User(
        email="dictation@test.dev",
        username="dictation",
        username_normalized="dictation",
        password_hash="hashed",
        collins_level=3,
    )
    db_session.add(user)
    db_session.flush()

    monkeypatch.setattr(
        "app.services.dictation_service._translate_sentence",
        lambda text: f"ZH:{text}",
    )
    monkeypatch.setattr(
        "app.services.dictation_service.synthesize_speech",
        lambda **kwargs: SimpleNamespace(audio_url=f"https://audio.test/{kwargs['text'][:8]}.mp3"),
    )
    monkeypatch.setattr(
        "app.services.dictation_service.extract_vocabulary_analysis_from_sentences",
        lambda sentences, target_level: [
            {
                "words_above": [{"token": "planet", "band": "i_plus_one"}],
                "word_levels": {
                    "planet": {"band": "i_plus_one", "collins": "B1", "lemma": "planet"},
                },
            }
            for _ in sentences
        ],
    )

    lesson = generate_dictation_lesson(
        db_session,
        user_id=user.id,
        sentences=["Planet habits change quickly."],
        target_level=3,
        article_title="Climate habits",
        voice="TestVoice",
    )

    stored_sentence = (
        db_session.query(LessonSentence)
        .filter(LessonSentence.lesson_id == lesson.id)
        .order_by(LessonSentence.idx.asc())
        .one()
    )

    assert stored_sentence.vocabulary_analysis_json == {
        "words": [{"token": "planet", "band": "i_plus_one"}],
        "word_levels": {
            "planet": {"band": "i_plus_one", "collins": "B1", "lemma": "planet"},
        },
        "user_collins_level": 3,
    }
    assert stored_sentence.text_zh == "ZH:Planet habits change quickly."
