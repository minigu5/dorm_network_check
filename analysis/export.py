import csv
import io
import sys

import requests


def fetch_measurements(base_url: str, key: str) -> list[dict]:
    resp = requests.get(f"{base_url}/api/export", params={"key": key}, timeout=30)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python export.py <base_url> <export_key>")
        sys.exit(1)
    rows = fetch_measurements(sys.argv[1], sys.argv[2])
    with open("measurements.csv", "w", newline="", encoding="utf-8") as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
    print(f"saved {len(rows)} rows to measurements.csv")
