import sys

import pandas as pd
import plotly.express as px
import plotly.io as pio


def build_report(df: pd.DataFrame) -> str:
    sections = []

    if df.empty:
        sections.append("<p>데이터가 없습니다.</p>")
    else:
        indoor = df[df["location_tag"] == "실내"].copy()

        # Whichever chart ends up first in `sections` must load Plotly.js
        # from the CDN; every later chart can rely on it already being
        # loaded on the page. Only the heatmap is conditional, so track
        # whether it was actually emitted.
        heatmap_included = not indoor.empty

        if heatmap_included:
            heatmap_df = (
                indoor.groupby(["dong", "floor", "corridor"], dropna=False)["download_mbps"]
                .mean()
                .reset_index()
            )
            fig1 = px.density_heatmap(
                heatmap_df, x="floor", y="corridor", z="download_mbps",
                facet_col="dong", title="동/층/복도별 평균 다운로드 속도(Mbps)",
            )
            sections.append(pio.to_html(fig1, full_html=False, include_plotlyjs="cdn"))

        fig2 = px.box(
            df, x="carrier", y="download_mbps", color="carrier",
            title="통신사별 다운로드 속도 비교(Mbps)",
        )
        sections.append(
            pio.to_html(fig2, full_html=False, include_plotlyjs=False if heatmap_included else "cdn")
        )

        # created_at is UTC ISO-8601 ("...Z"); this project's day/night
        # logic (see src/lib/curfew.ts) is defined in KST (UTC+9), so the
        # hourly chart must bucket by KST hour-of-day, not raw UTC hour.
        df["hour"] = (pd.to_datetime(df["created_at"], utc=True) + pd.Timedelta(hours=9)).dt.hour
        hourly = df.groupby("hour")["download_mbps"].mean().reset_index()
        fig3 = px.line(hourly, x="hour", y="download_mbps", title="시간대별 평균 다운로드 속도(Mbps)")
        sections.append(pio.to_html(fig3, full_html=False, include_plotlyjs=False))

        fig4 = px.box(
            df, x="location_tag", y="download_mbps", color="location_tag",
            title="실내 vs 외부 다운로드 속도 비교(Mbps)",
        )
        sections.append(pio.to_html(fig4, full_html=False, include_plotlyjs=False))

    body = "\n".join(sections)
    return f"<html><head><meta charset='utf-8'><title>기숙사 속도 리포트</title></head><body>{body}</body></html>"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python analyze.py <measurements.csv>")
        sys.exit(1)
    df = pd.read_csv(sys.argv[1])
    html = build_report(df)
    with open("report.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("wrote report.html")
