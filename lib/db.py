import os

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

_supabase_url = os.getenv("SUPABASE_URL")
# Prefer classic anon JWT; fall back to SUPABASE_KEY for older .env files
_supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
_supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not _supabase_url or not _supabase_anon_key:
    raise RuntimeError(
        "Missing SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_KEY. "
        "Set them in the environment or a .env file."
    )


def _client_options() -> SyncClientOptions:
    # supabase-py defaults http2=True; keep-alive GOAWAYs show up as
    # httpx.RemoteProtocolError and the browser reports a bogus CORS failure.
    return SyncClientOptions(
        httpx_client=httpx.Client(
            http2=False,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )
    )


def create_anon_client() -> Client:
    return create_client(_supabase_url, _supabase_anon_key, options=_client_options())


def create_user_client(access_token: str) -> Client:
    """Client scoped to the caller's JWT so RLS (auth.uid()) works."""
    client = create_client(
        _supabase_url, _supabase_anon_key, options=_client_options()
    )
    client.postgrest.auth(access_token)
    return client


def create_service_client() -> Client:
    """Bypasses RLS. Required for webhooks / trusted server jobs."""
    if not _supabase_service_key:
        raise RuntimeError(
            "Missing SUPABASE_SERVICE_ROLE_KEY (needed for Paystack webhook updates)"
        )
    return create_client(
        _supabase_url, _supabase_service_key, options=_client_options()
    )


# Used for auth.get_user(jwt) verification only
supabase: Client = create_anon_client()
