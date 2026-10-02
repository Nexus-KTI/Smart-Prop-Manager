"""Chat photo, video, and voice-note rules."""

from lib.message_media import (
    assert_document_bytes,
    assert_image_bytes,
    classify_message_media,
    clamp_duration_ms,
    document_display_name,
    present_message,
    preview_for,
)


JPEG = b"\xff\xd8\xff" + b"\x00" * 16


def test_voice_note_mime_strips_codec_and_photo_uses_name():
    kind, mime, ext = classify_message_media("audio/webm;codecs=opus", 1200, "note.webm")
    assert (kind, mime, ext) == ("audio", "audio/webm", "webm")
    kind, mime, ext = classify_message_media("application/octet-stream", 80, "leak.JPG")
    assert (kind, mime, ext) == ("image", "image/jpeg", "jpg")


def test_pdf_and_word_are_documents_and_oversize_files_are_refused():
    kind, mime, ext = classify_message_media("application/pdf", 1200, "lease.pdf")
    assert (kind, mime, ext) == ("document", "application/pdf", "pdf")
    kind, mime, ext = classify_message_media("application/octet-stream", 80, "notes.DOCX")
    assert kind == "document" and ext == "docx"
    assert document_display_name(r"C:\scans\lease.pdf", "pdf") == "lease.pdf"
    assert preview_for("", "document") == "Document"
    try:
        classify_message_media("application/pdf", 9 * 1024 * 1024, "big.pdf")
        raise AssertionError("oversize document should be refused")
    except ValueError as exc:
        assert "8 MB" in str(exc)
    try:
        classify_message_media("application/x-msdownload", 100, "app.exe")
        raise AssertionError("executable should be refused")
    except ValueError as exc:
        assert "document" in str(exc)
    try:
        classify_message_media("video/mp4", 26 * 1024 * 1024, "clip.mp4")
        raise AssertionError("oversize video should be refused")
    except ValueError as exc:
        assert "25 MB" in str(exc)


def test_document_bytes_must_match_the_declared_type():
    assert_document_bytes(b"%PDF-1.4", "application/pdf")
    try:
        assert_document_bytes(b"not a pdf", "application/pdf")
        raise AssertionError("fake pdf should be refused")
    except ValueError as exc:
        assert "could not be read" in str(exc)
    try:
        assert_document_bytes(b"MZ" + b"%PDF", "application/pdf")
        raise AssertionError("executable header should be refused")
    except ValueError as exc:
        assert "could not be read" in str(exc)


def test_image_bytes_must_match_the_declared_type():
    assert_image_bytes(JPEG, "image/jpeg")
    try:
        assert_image_bytes(b"not a photo", "image/jpeg")
        raise AssertionError("fake jpeg should be refused")
    except ValueError as exc:
        assert "could not be read" in str(exc)


def test_voice_duration_cap_and_preview_labels():
    assert clamp_duration_ms("90000", kind="audio") == 90000
    assert clamp_duration_ms(None, kind="image") is None
    try:
        clamp_duration_ms(181_000, kind="audio")
        raise AssertionError("long voice note should be refused")
    except ValueError as exc:
        assert "3 minutes" in str(exc)
    assert preview_for("", "audio") == "Voice note"
    assert preview_for("The leak", "image") == "Photo: The leak"
    assert preview_for("Hello", None) == "Hello"


def test_present_message_hides_the_storage_path(monkeypatch):
    monkeypatch.setattr(
        "lib.message_media.signed_message_media_url",
        lambda path, **_kwargs: f"https://signed.example/{path}",
    )
    shown = present_message(
        {
            "id": "m1",
            "body": "",
            "media_kind": "audio",
            "media_path": "thread/abc.webm",
        }
    )
    assert "media_path" not in shown
    assert shown["media_url"] == "https://signed.example/thread/abc.webm"
    assert present_message({"id": "m2", "body": "Hi"})["body"] == "Hi"
