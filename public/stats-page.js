const REFRESH_MS = 60_000;

const { TIER_LABEL, h, renderCarrier } = window.DormStats;
// 조사까지 붙여 둔다(다운로드"가", 핑"이").
const METRIC_SUBJECT = { download: "다운로드가", upload: "업로드가", ping: "응답 속도(핑)이" };

const el = (id) => document.getElementById(id);


function timeAgo(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (60 * 24))}일 전`;
}

// 새로고침해도 고른 방을 유지하려고 전역에 둔다.
let selectedRoom = null;
let latest = null;

function roomDetailText(room, stat) {
  if (!stat) return `${room}호 · 아직 측정 없음`;
  const base = `${room}호 · 측정 ${stat.count}건`;
  if (!stat.tier) return `${base} · 같은 통신사의 밖 측정이 부족해 아직 비교 못 함`;
  return `${base} · ${TIER_LABEL[stat.tier]} (${METRIC_SUBJECT[stat.worstMetric]} 가장 많이 떨어짐)`;
}

function renderCell(slot, stats, detail) {
  if (typeof slot !== "number") {
    const kind = slot.label === "계단" ? " stairs" : slot.label === "E/V" ? " ev" : "";
    return h("div", {
      class: `cell facility${kind}`,
      style: slot.span ? `grid-column: span ${slot.span}` : "",
      text: kind ? "" : slot.label,
      "aria-hidden": "true",
    });
  }
  const stat = stats.rooms[String(slot)];
  const state = !stat ? "none" : stat.tier ?? "measured";
  const btn = h("button", {
    type: "button",
    class: "cell room",
    "data-state": state,
    "aria-pressed": String(selectedRoom === slot),
    "aria-label": roomDetailText(slot, stat),
    text: String(slot),
  });
  btn.addEventListener("click", () => {
    selectedRoom = selectedRoom === slot ? null : slot;
    render(latest);
  });
  if (selectedRoom === slot) {
    detail.textContent = roomDetailText(slot, stat);
    detail.hidden = false;
  }
  return btn;
}

function renderFloor(floor, stats) {
  const detail = h("div", { class: "room-detail", hidden: "" });
  const row = (slots) => h("div", { class: "row" }, slots.map((s) => renderCell(s, stats, detail)));
  const corridor = floor.corridorCount ? ` · 복도 ${floor.corridorCount}건` : "";
  return h("div", { class: "floor" }, [
    h("div", { class: "floor-head" }, [
      h("b", { text: `${floor.floor}층` }),
      h("span", { class: "subtle", text: `${floor.roomsMeasured} / ${floor.roomsTotal}실${corridor}` }),
    ]),
    h("div", { class: "wing", text: "신관" }),
    row(floor.annex[0]),
    h("div", { class: "hall annex" }),
    row(floor.annex[1]),
    h("div", { class: "wing", text: "본관" }),
    row(floor.main[0]),
    h("div", { class: "hall" }),
    row(floor.main[1]),
    detail,
  ]);
}


function render(stats) {
  if (!stats) return;
  el("hero").replaceChildren(String(stats.roomsMeasured), h("small", { text: ` / ${stats.roomsTotal}실 측정` }));
  el("meta").textContent = stats.lastMeasuredAt
    ? `전체 측정 ${stats.totalMeasurements}건 · 마지막 측정 ${timeAgo(stats.lastMeasuredAt)}`
    : "아직 측정이 없어요.";
  el("floors").replaceChildren(...stats.floors.map((f) => renderFloor(f, stats)));
  el("carriers").replaceChildren(...stats.carriers.map((c) => renderCarrier(c, stats.minOutdoorBaseline)));
  const pct = (x) => Math.round(x * 100);
  el("rule-thresholds").textContent =
    `밖의 ${pct(stats.thresholds.good)}% 이상이면 거의 그대로, ${pct(stats.thresholds.slow)}~${pct(stats.thresholds.good)}%면 꽤 느려짐, ${pct(stats.thresholds.slow)}% 미만이면 매우 느림이에요.`;
  el("rule-baseline").textContent =
    `그 통신사의 밖 측정이 ${stats.minOutdoorBaseline}건 미만이면 비교 기준이 부족해서 파란색(측정함)으로만 보여 줘요.`;
}

async function load() {
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    latest = await res.json();
    el("error").hidden = true;
    render(latest);
  } catch {
    el("error").hidden = false;
  }
}

// 화면을 보고 있을 때만 주기적으로 갱신(백그라운드 탭이 계속 요청을 쌓지 않게).
load();
setInterval(() => {
  if (document.visibilityState === "visible") load();
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") load();
});
