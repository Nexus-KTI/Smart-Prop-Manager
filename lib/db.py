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


class _SharedPool(httpx.BaseTransport):
    """One socket pool behind every Supabase client; closing a client must not close it.

    Headers (apikey, user JWT) live on each client, so sharing sockets cannot mix callers.
    """

    def __init__(self) -> None:
        self._inner = self._open()

    @staticmethod
    def _open() -> httpx.HTTPTransport:
        # supabase-py defaults http2=True; keep-alive GOAWAYs show up as
        # httpx.RemoteProtocolError and the browser reports a bogus CORS failure.
        # Lossy links drop the odd SYN and Windows then stalls ~20s; a short connect
        # timeout plus retries (nothing has been sent yet, so always safe) recovers fast.
        return httpx.HTTPTransport(
            http2=False,
            retries=3,
            limits=httpx.Limits(
                max_connections=50,
                max_keepalive_connections=20,
                keepalive_expiry=30.0,
            ),
        )

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return self._inner.handle_request(request)

    def close(self) -> None:
        pass

    def shutdown(self) -> None:
        self._inner.close()
        self._inner = self._open()


_pool = _SharedPool()


def _new_client(key: str) -> Client:
    transport = httpx.Client(
        transport=_pool,
        timeout=httpx.Timeout(
            connect=4.0,
            read=30.0,
            write=15.0,
            pool=15.0,
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
        _pool.shutdown()
