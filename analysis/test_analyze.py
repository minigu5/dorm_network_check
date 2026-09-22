import pandas as pd
from analyze import build_report


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
