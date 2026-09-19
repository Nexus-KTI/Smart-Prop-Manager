import os
import threading

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


_client_lock = threading.Lock()
_client_transports: dict[int, httpx.Client] = {}
_service_client: Client | None = None
_anon_client: Client | None = None


def _new_client(key: str) -> Client:
    # supabase-py defaults http2=True; keep-alive GOAWAYs show up as
    # httpx.RemoteProtocolError and the browser reports a bogus CORS failure.
    transport = httpx.Client(
        http2=False,
        timeout=httpx.Timeout(
            connect=5.0,
            read=30.0,
            write=15.0,
            pool=5.0,
        ),
        limits=httpx.Limits(
            max_connections=50,
            max_keepalive_connections=20,
            keepalive_expiry=30.0,
        ),
    )
    client = create_client(
        _supabase_url,
        key,
        options=SyncClientOptions(
            httpx_client=transport,
            auto_refresh_token=False,
            persist_session=False,
        ),
    )
    _client_transports[id(client)] = transport
    return client


def create_anon_client() -> Client:
    """Return the process-wide stateless anonymous client."""
    global _anon_client
    if _anon_client is None:
        with _client_lock:
            if _anon_client is None:
                _anon_client = _new_client(_supabase_anon_key)
    return _anon_client


def create_user_client(access_token: str) -> Client:
    """Client scoped to the caller's JWT so RLS (auth.uid()) works."""
    client = _new_client(_supabase_anon_key)
    client.postgrest.auth(access_token)
    return client


def create_service_client() -> Client:
    """Return the process-wide service-role client for trusted server work."""
    global _service_client
    if not _supabase_service_key:
        raise RuntimeError(
            "Missing SUPABASE_SERVICE_ROLE_KEY (needed for Paystack webhook updates)"
        )
    if _service_client is None:
        with _client_lock:
            if _service_client is None:
                _service_client = _new_client(_supabase_service_key)
    return _service_client


def close_user_client(client: Client) -> None:
    """Close a request-scoped authenticated client's owned transport."""
    transport = _client_transports.pop(id(client), None)
    if transport is not None:
        transport.close()


def close_shared_clients() -> None:
    """Close process-wide HTTP transports during application shutdown."""
    global _anon_client, _service_client
    with _client_lock:
        clients = [client for client in (_anon_client, _service_client) if client]
        for client in clients:
            transport = _client_transports.pop(id(client), None)
            if transport is not None:
                transport.close()
        _anon_client = None
        _service_client = None
