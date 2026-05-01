"""Voice cloning service — creates and manages user voice profiles."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import TTS_MAX_VOICES_PER_USER, TTS_VC_TARGET_MODEL
from app.core.timezone import now_shanghai_naive
from app.infra.tts import TTSError
from app.models.voice_profile import VoiceProfile
from app.services.ai_platform import create_voice_profile_runtime, delete_voice_profile_runtime


class VoiceCloningError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _get_db_session() -> Session:
    from app.db import SessionLocal
    return SessionLocal()


def create_user_voice_profile(
    user_id: int,
    audio_file_path: str,
    preferred_name: str,
    target_model: str = TTS_VC_TARGET_MODEL,
    language: Optional[str] = None,
    db: Optional[Session] = None,
) -> VoiceProfile:
    """Create a voice profile for a user.

    Args:
        user_id: The user ID
        audio_file_path: Path to the audio file for cloning
        preferred_name: User-friendly name for the voice
        target_model: Target TTS model
        language: Audio language (optional)
        db: Database session (optional, will create if not provided)

    Returns:
        The created VoiceProfile object

    Raises:
        VoiceCloningError: If creation fails or user limit exceeded
    """
    close_session = False
    if db is None:
        db = _get_db_session()
        close_session = True

    try:
        existing_count = db.query(VoiceProfile).filter(
            VoiceProfile.user_id == user_id
        ).count()

        if existing_count >= TTS_MAX_VOICES_PER_USER:
            raise VoiceCloningError(
                "VOICE_LIMIT_EXCEEDED",
                f"用户音色数量已达上限 ({TTS_MAX_VOICES_PER_USER})"
            )

        result = create_voice_profile_runtime(
            audio_file_path=audio_file_path,
            preferred_name=preferred_name,
            model_key=target_model,
            language=language,
        )

        voice_profile = VoiceProfile(
            user_id=user_id,
            voice_name=result.voice,
            preferred_name=preferred_name,
            target_model=result.target_model,
            language=language,
            gmt_create=now_shanghai_naive(),
        )
        db.add(voice_profile)
        db.commit()
        db.refresh(voice_profile)

        return voice_profile

    except TTSError as e:
        db.rollback()
        raise VoiceCloningError("CLONE_API_ERROR", str(e))
    except Exception as e:
        db.rollback()
        raise VoiceCloningError("DATABASE_ERROR", str(e))
    finally:
        if close_session:
            db.close()


def list_user_voices(
    user_id: int,
    db: Optional[Session] = None,
) -> list[VoiceProfile]:
    """List all voice profiles for a user.

    Args:
        user_id: The user ID
        db: Database session (optional)

    Returns:
        List of VoiceProfile objects
    """
    close_session = False
    if db is None:
        db = _get_db_session()
        close_session = True

    try:
        profiles = db.query(VoiceProfile).filter(
            VoiceProfile.user_id == user_id
        ).order_by(VoiceProfile.gmt_create.desc()).all()
        return profiles
    finally:
        if close_session:
            db.close()


def get_voice_profile(
    user_id: int,
    voice_name: str,
    db: Optional[Session] = None,
) -> Optional[VoiceProfile]:
    """Get a specific voice profile for a user.

    Args:
        user_id: The user ID
        voice_name: The voice name
        db: Database session (optional)

    Returns:
        VoiceProfile object or None
    """
    close_session = False
    if db is None:
        db = _get_db_session()
        close_session = True

    try:
        return db.query(VoiceProfile).filter(
            VoiceProfile.user_id == user_id,
            VoiceProfile.voice_name == voice_name,
        ).first()
    finally:
        if close_session:
            db.close()


def update_voice_used_time(
    voice_profile: VoiceProfile,
    db: Optional[Session] = None,
) -> None:
    """Update the last used timestamp of a voice profile.

    Args:
        voice_profile: The VoiceProfile to update
        db: Database session (optional)
    """
    close_session = False
    if db is None:
        db = _get_db_session()
        close_session = True

    try:
        voice_profile.gmt_used = now_shanghai_naive()
        db.commit()
    finally:
        if close_session:
            db.close()


def delete_user_voice_profile(
    user_id: int,
    voice_name: str,
    db: Optional[Session] = None,
) -> bool:
    """Delete a user's voice profile.

    Args:
        user_id: The user ID
        voice_name: The voice name to delete
        db: Database session (optional)

    Returns:
        True if deleted successfully

    Raises:
        VoiceCloningError: If deletion fails
    """
    close_session = False
    if db is None:
        db = _get_db_session()
        close_session = True

    try:
        voice_profile = db.query(VoiceProfile).filter(
            VoiceProfile.user_id == user_id,
            VoiceProfile.voice_name == voice_name,
        ).first()

        if voice_profile is None:
            raise VoiceCloningError("VOICE_NOT_FOUND", f"未找到音色: {voice_name}")

        delete_voice_profile_runtime(voice_name=voice_name)

        db.delete(voice_profile)
        db.commit()

        return True

    except TTSError as e:
        db.rollback()
        raise VoiceCloningError("CLONE_API_ERROR", str(e))
    except VoiceCloningError:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise VoiceCloningError("DATABASE_ERROR", str(e))
    finally:
        if close_session:
            db.close()


__all__ = [
    "VoiceCloningError",
    "create_user_voice_profile",
    "list_user_voices",
    "get_voice_profile",
    "update_voice_used_time",
    "delete_user_voice_profile",
]
