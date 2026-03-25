from datetime import datetime

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)


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
    is_admin: bool = False
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
