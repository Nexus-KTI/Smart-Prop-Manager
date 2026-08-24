"""Authentication helpers (JWT / session verification)."""

from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client
from supabase_auth.errors import AuthApiError

from lib.admin import is_admin_email
from lib.db import create_anon_client, create_user_client, supabase

_bearer = HTTPBearer()


@dataclass
class AuthedUser:
    id: str
    email: str | None
    access_token: str
    db: Client


def verify_access_token(token: str):
    """Verify JWT via GoTrue, with one retry on flaky HTTP transport."""
    clients = (supabase, create_anon_client())
    last_transport: Exception | None = None
    for client in clients:
        try:
            return client.auth.get_user(token)
        except AuthApiError:
            raise
        except httpx.TransportError as exc:
            last_transport = exc
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Auth service temporarily unavailable",
    ) from last_transport


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> AuthedUser:
    """Verify the Supabase JWT and return a user-scoped DB client."""
    token = credentials.credentials
    try:
        response = verify_access_token(token)
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    user = response.user
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return AuthedUser(
        id=user.id,
        email=user.email,
        access_token=token,
        db=create_user_client(token),
    )


def require_admin(user: AuthedUser = Depends(get_current_user)) -> AuthedUser:
    """Require the caller to be on ADMIN_EMAILS."""
    if not is_admin_email(user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
