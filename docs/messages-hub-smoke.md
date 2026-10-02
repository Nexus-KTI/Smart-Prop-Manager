# Messages hub smoke (TenantCloud-style)

Migration: `sql/018_messages_hub.sql` (applied as `018_messages_hub`).

Restart FastAPI so `/messages/*` mounts.

## Channels

| Tab | Landlord (`/messages`) | Tenant (`/tenant/messages`) |
|-----|------------------------|-----------------------------|
| **Chat** | Contacts = claimed tenants → open thread → send | Contact = landlord → open thread → send |
| **Publications** | Create / archive bulletin posts | Read landlord posts + mark read |
| **Maintenance** | Threads auto-created with MR / work order | Same threads after tenant request |

## Checklist

1. Link a tenant (invite + claim + preferably active).
2. Landlord Messages → Chat → contact → Send “Hello”.
3. Tenant Messages → same conversation appears **live (no reload)** → reply; landlord sees reply live.
4. Confirm **Sent → Read** after the other party opens the thread.
5. Record a paid payment on the unit → payment status line + Open receipt appear in chat (if a chat thread already exists).
6. With Messages closed, send from the other account → **bell badge** and **Messages rail badge** (landlord + tenant) update without reload; open thread → badges clear. Unread scan pages past 200 threads; Chat/Maintenance lists show honesty when capped at 100.
7. Tenant submits a repair → Maintenance tab shows a thread for both sides.
8. Landlord Publications tab → New publication → tenant sees it under Publications (and Notices).
9. In a chat, attach a photo, short video, or PDF/Word document (photo and document 8 MB, video 25 MB) and send. The other side sees it without a reload. Record a voice note (up to 3 minutes) and send; the other side can play it. Thread list shows Photo, Video, Document, or Voice note.

## Realtime

Requires `sql/022_messages_realtime.sql` (tables on `supabase_realtime` publication). Shell unread uses the same channel via `useMessageUnreadCount`.

## Empty states

- No contacts until tenancy has `tenant_user_id`.
- No maintenance threads until a request exists.
- Publications empty until landlord posts.
