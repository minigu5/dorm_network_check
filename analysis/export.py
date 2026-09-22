import csv
import io
import sys

import requests


def _fetch_csv_text(base_url: str, key: str) -> str:
    resp = requests.get(f"{base_url}/api/export", params={"key": key}, timeout=30)
    resp.raise_for_status()
    return resp.text


def fetch_measurements(base_url: str, key: str) -> list[dict]:
    text = _fetch_csv_text(base_url, key)
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def export_to_csv(base_url: str, key: str, out_path: str = "measurements.csv") -> int:
    """Fetch the export CSV and write it verbatim to out_path.

    Writing the server's response text as-is (rather than round-tripping
    through csv.DictReader/DictWriter) preserves the header row even when
    there are zero data rows, so pandas can still read the file later.
    Returns the number of data rows written.
    """
    text = _fetch_csv_text(base_url, key)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        f.write(text)
    rows = list(csv.DictReader(io.StringIO(text)))
    return len(rows)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python export.py <base_url> <export_key>")
        sys.exit(1)
    count = export_to_csv(sys.argv[1], sys.argv[2])
    print(f"saved {count} rows to measurements.csv")
