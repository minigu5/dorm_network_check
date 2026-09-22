import pandas as pd

import export as export_module
from analyze import build_report
from export import export_to_csv

# Matches the real HEADERS list in src/handlers/export.ts (migration 0001
# measurements schema) — this is exactly what the server returns for a
# fresh/empty deployment: a header row and zero data rows.
HEADER_ONLY_CSV = (
    "id,created_at,lat,lng,accuracy_m,raw_location_tag,is_curfew_window,"
    "location_tag,dong,floor,room,corridor,note,carrier,network_org,os,"
    "download_mbps,upload_mbps,ping_ms,jitter_ms,packet_loss_pct,raw_samples"
)


class _FakeResponse:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        pass


def sample_df():
    return pd.DataFrame([
        {
            "created_at": "2026-09-22T14:30:00.000Z",
            "location_tag": "실내", "dong": "3동", "floor": "5", "corridor": "A",
            "carrier": "SKT", "download_mbps": 50.0, "upload_mbps": 10.0,
            "ping_ms": 25.0, "jitter_ms": 3.0, "packet_loss_pct": 0.0,
        },
        {
            "created_at": "2026-09-22T05:00:00.000Z",
            "location_tag": "외부", "dong": None, "floor": None, "corridor": None,
            "carrier": "KT", "download_mbps": 80.0, "upload_mbps": 20.0,
            "ping_ms": 15.0, "jitter_ms": 1.0, "packet_loss_pct": 0.0,
        },
    ])


def test_build_report_contains_key_sections():
    html = build_report(sample_df())
    assert "<html" in html.lower()
    assert "SKT" in html
    assert "KT" in html


def test_build_report_handles_empty_dataframe():
    empty = sample_df().iloc[0:0]
    html = build_report(empty)
    assert "<html" in html.lower()


def test_export_then_analyze_survives_header_only_csv(tmp_path, monkeypatch):
    """Full export.py -> analyze.py pipeline for a fresh/empty deployment.

    /api/export returns a header-only CSV (0 data rows) after Task 14's
    fix. export.py must write that header through untouched so pandas can
    read it back without raising EmptyDataError, and build_report must
    then handle the resulting empty DataFrame without crashing.
    """

    def fake_get(url, params=None, timeout=None):
        return _FakeResponse(HEADER_ONLY_CSV)

    monkeypatch.setattr(export_module.requests, "get", fake_get)

    out_path = tmp_path / "measurements.csv"
    row_count = export_to_csv("https://example.com", "secret", out_path=str(out_path))
    assert row_count == 0

    df = pd.read_csv(out_path)
    assert df.empty

    html = build_report(df)
    assert "<html" in html.lower()


def test_report_loads_plotlyjs_even_with_zero_indoor_rows():
    df = sample_df()
    df["location_tag"] = "외부"  # no indoor rows -> heatmap chart is skipped

    html = build_report(df)

    assert "plot.ly" in html.lower() or "plotly.js" in html.lower()


def test_hourly_bucket_uses_kst_not_utc():
    df = pd.DataFrame([
        {
            # 15:00 UTC = 00:00 (next day) KST
            "created_at": "2026-09-22T15:00:00.000Z",
            "location_tag": "외부", "dong": None, "floor": None, "corridor": None,
            "carrier": "SKT", "download_mbps": 50.0, "upload_mbps": 10.0,
            "ping_ms": 25.0, "jitter_ms": 3.0, "packet_loss_pct": 0.0,
        },
    ])

    build_report(df)

    assert df["hour"].iloc[0] == 0
