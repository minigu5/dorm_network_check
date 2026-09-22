import sys

import pandas as pd
import plotly.express as px
import plotly.io as pio

WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _prepare_filtered(df: pd.DataFrame) -> pd.DataFrame:
    """Rows used by every comparison/time-series chart.

    Per spec §5-1 / plan Global Constraints, `미확인`(unknown-location) rows
    must be excluded from analysis entirely -- they have no reliable
    indoor/outdoor classification, so pooling them into the carrier or
    indoor-vs-outdoor comparisons would be misleading. This also attaches the
    KST hour-of-day and weekday columns (reusing the same UTC->KST shift for
    both, rather than recomputing it separately for each chart).
    """
    filtered = df[df["location_tag"] != "미확인"].copy()

    # created_at is UTC ISO-8601 ("...Z"); this project's day/night logic
    # (see src/lib/curfew.ts) is defined in KST (UTC+9), so both the hourly
    # and weekday charts must bucket by KST, not raw UTC.
    kst = pd.to_datetime(filtered["created_at"], utc=True) + pd.Timedelta(hours=9)
    filtered["hour"] = kst.dt.hour
    filtered["weekday"] = kst.dt.day_name()

    return filtered


def build_report(df: pd.DataFrame) -> str:
    sections = []

    if df.empty:
        sections.append("<p>데이터가 없습니다.</p>")
    else:
        filtered = _prepare_filtered(df)

        # Whichever chart ends up first in `sections` must load Plotly.js
        # from the CDN; every later chart can rely on it already being
        # loaded on the page.
        first_chart = True

        def render(fig) -> str:
            nonlocal first_chart
            html = pio.to_html(fig, full_html=False, include_plotlyjs="cdn" if first_chart else False)
            first_chart = False
            return html

        indoor = filtered[filtered["location_tag"] == "실내"]

        if not indoor.empty:
            heatmap_df = (
                indoor.groupby(["dong", "floor", "corridor"], dropna=False)["download_mbps"]
                .mean()
                .reset_index()
            )
            fig1 = px.density_heatmap(
                heatmap_df, x="floor", y="corridor", z="download_mbps",
                facet_col="dong", title="동/층/복도별 평균 다운로드 속도(Mbps)",
            )
            sections.append(render(fig1))

        fig2 = px.box(
            filtered, x="carrier", y="download_mbps", color="carrier",
            title="통신사별 다운로드 속도 비교(Mbps)",
        )
        sections.append(render(fig2))

        fig2b = px.box(
            filtered, x="carrier", y="upload_mbps", color="carrier",
            title="통신사별 업로드 속도 비교(Mbps)",
        )
        sections.append(render(fig2b))

        fig2c = px.box(
            filtered, x="carrier", y="ping_ms", color="carrier",
            title="통신사별 핑 비교(ms)",
        )
        sections.append(render(fig2c))

        hourly = filtered.groupby("hour")["download_mbps"].mean().reset_index()
        fig3 = px.line(hourly, x="hour", y="download_mbps", title="시간대별 평균 다운로드 속도(Mbps)")
        sections.append(render(fig3))

        weekday_avg = (
            filtered.groupby("weekday")["download_mbps"]
            .mean()
            .reindex(WEEKDAY_ORDER)
            .reset_index()
        )
        fig3b = px.bar(weekday_avg, x="weekday", y="download_mbps", title="요일별 평균 다운로드 속도(Mbps)")
        sections.append(render(fig3b))

        fig4 = px.box(
            filtered, x="location_tag", y="download_mbps", color="location_tag",
            title="실내 vs 외부 다운로드 속도 비교(Mbps)",
        )
        sections.append(render(fig4))

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
