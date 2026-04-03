from datetime import datetime

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)
    username: str = Field(min_length=1, max_length=255)


class ProfileUpdateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    cefr_level: str | None = Field(default=None, pattern="^(A1|A2|B1|B2|C1|C2)$")


class DesktopTokenLoginRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512, description="Desktop client login token (access_token)")


class DesktopTokenLoginResponse(BaseModel):
    ok: bool = True
    access_token: str
    user_id: int
    email: str
    is_admin: bool = False


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_admin: bool = False
    cefr_level: str | None = "B1"
    created_at: datetime | None = None


class AuthResponse(BaseModel):
    ok: bool = True
    access_token: str
    refresh_token: str
    user: UserResponse


class LogoutResponse(BaseModel):
    ok: bool = True
    message: str = "已退出登录"


class RefreshRequest(BaseModel):
    refresh_token: str
