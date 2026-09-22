// 다운로드/업로드 측정은 "고정 크기"가 아니라 "고정 시간" 동안 반복 요청한다.
// 회선 속도와 무관하게 총 측정 시간을 비슷하게 유지하기 위함(speedtest.net과 동일한 방식).
const DOWNLOAD_DURATION_MS = 6000;
const UPLOAD_DURATION_MS = 5000;
const DOWNLOAD_CHUNK_BYTES = 4_000_000;
const UPLOAD_CHUNK_BYTES = 2_000_000;

const state = {
  networkOk: false,
  carrier: null, // 서버가 자동 감지한 통신사(SKT/KT/LGU+), 사용자가 직접 선택하지 않음
  lat: null, lng: null, accuracy: null,
  dormLat: null, dormLng: null, // 서버가 알려주는 기숙사 기준 좌표(비교용 표시)
  locationBranch: null, // "indoor" | "outdoor"
  indoorType: null, // "room" | "corridor" | null (실내 폼에서 아직 선택 안 함)
  manualOverride: false, // 사용자가 경고를 보고 직접 실내/외부 폼을 뒤집었는지
  form: {},
  measurement: null, // set once measureDownload/measureUpload/measurePing succeed
  retryAction: null, // "measure" | "submit" -- what btn-measuring-retry should do
};

const el = (id) => document.getElementById(id);
const show = (id) => { el(id).hidden = false; };
const hide = (id) => { el(id).hidden = true; };

// 같은 브라우저에서 진행한 측정 기록을 localStorage에 누적 보관한다.
// localStorage는 브라우저별로 격리되므로(쿠키와 동일 성격) 별도 식별자 없이
// 이 값의 존재 자체가 "이 브라우저의 기록"이 된다. 서버에는 보내지 않는다.
const HISTORY_KEY = "measurement_history";

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.unshift(entry); // 최신 항목이 위로 오도록
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage 사용 불가(사생활 보호 모드 등)여도 측정 자체는 계속 동작해야 한다.
  }
}

function formatLocationLine(entry) {
  if (entry.branch === "indoor") {
    return entry.corridor
      ? `실내 · 복도(${entry.corridor})`
      : `실내 · 호실 ${entry.room ?? "-"}`;
  }
  return `외부${entry.note ? ` · ${entry.note}` : ""}`;
}

function renderHistoryEntry(entry) {
  const div = document.createElement("div");
  div.className = "history-item";
  const time = new Date(entry.timestamp).toLocaleString("ko-KR");
  div.innerHTML = `
    <div class="history-time">${time} · 통신사: ${entry.carrier ?? "-"}</div>
    <div>${formatLocationLine(entry)}</div>
    <div>다운로드 ${entry.download_mbps.toFixed(1)} Mbps · 업로드 ${entry.upload_mbps.toFixed(1)} Mbps</div>
    <div>핑 ${entry.ping_ms.toFixed(0)} ms · 지터 ${entry.jitter_ms.toFixed(0)} ms · 손실률 ${entry.packet_loss_pct.toFixed(1)}%</div>
  `;
  return div;
}

function renderResult(entry) {
  el("result-summary").innerHTML = "";
  el("result-summary").appendChild(renderHistoryEntry(entry));
}

// 어느 단계(네트워크 확인/위치 확인/폼 입력/측정 중/완료)에 있든 화면 하단에
// 항상 보이도록 main 바깥의 고정 영역에 렌더링한다(특정 step section에 속하지 않음).
function renderHistoryList() {
  const listEl = el("history-list");
  listEl.innerHTML = "";
  for (const past of loadHistory()) {
    listEl.appendChild(renderHistoryEntry(past));
  }
}

async function step1CheckNetwork() {
  try {
    const res = await fetch("/api/network-check");
    const body = await res.json();
    if (body.status !== "mobile") {
      el("network-status").textContent =
        "모바일 데이터로 연결한 뒤 다시 시도하세요. (현재 WiFi 또는 다른 네트워크로 감지됨)";
      show("btn-network-retry");
      return;
    }
    hide("btn-network-retry");
    state.networkOk = true;
    state.carrier = body.carrier;
    el("network-status").textContent = `모바일 데이터 연결 확인됨 (통신사: ${state.carrier}).`;
    el("carrier-badge").textContent = `통신사: ${state.carrier}`;
    show("carrier-badge");
    await step2CheckLocation();
  } catch (err) {
    // 첫 화면부터 오류 처리가 없으면 사용자가 "네트워크 확인 중..."에 영구히
    // 머무르게 된다. 재시도 버튼으로 복구 경로를 제공한다.
    el("network-status").textContent = "네트워크 확인 중 오류 발생";
    show("btn-network-retry");
  }
}

el("btn-network-retry").addEventListener("click", step1CheckNetwork);

async function step2CheckLocation() {
  hide("step-network");
  show("step-location");
  el("location-status").textContent = "위치 확인 중...";

  if (!("geolocation" in navigator)) {
    return goToOutdoorForm();
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      state.accuracy = pos.coords.accuracy;
      try {
        // 최종 판정은 항상 /api/submit 시점에 서버가 다시 계산하지만(§3 6단계),
        // 여기서는 어떤 입력 폼(3-a/3-b)을 보여줄지 결정하기 위해
        // 같은 geofence+시간대 로직을 쓰는 /api/location-check에 힌트를 물어본다.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          `/api/location-check?lat=${state.lat}&lng=${state.lng}&accuracy=${state.accuracy}`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        const { tag, dormLat, dormLng } = await res.json();
        state.dormLat = dormLat;
        state.dormLng = dormLng;
        if (tag === "실내") {
          goToIndoorForm();
        } else {
          goToOutdoorForm();
        }
      } catch (err) {
        // 네트워크 오류/타임아웃 시에도 사용자가 멈추지 않도록 외부 폼으로 진행한다.
        el("location-status").textContent =
          "위치 확인 중 오류 발생, 외부로 진행합니다.";
        goToOutdoorForm();
      }
    },
    () => {
      goToOutdoorForm();
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// 선택 전에는 층/호실 둘 다 숨겨둔다. "방 안"/"복도" 버튼을 눌러야만
// 해당하는 입력 필드가 나타난다(대충 아무 값이나 채우고 넘어가는 것을 막기 위함).
function selectIndoorType(type) {
  state.indoorType = type;
  el("btn-select-room").classList.toggle("selected", type === "room");
  el("btn-select-corridor").classList.toggle("selected", type === "corridor");
  if (type === "corridor") {
    show("label-floor");
    hide("label-room");
  } else {
    hide("label-floor");
    show("label-room");
  }
  hide("indoor-validation-error");
  show("btn-indoor-next");
}
el("btn-select-room").addEventListener("click", () => selectIndoorType("room"));
el("btn-select-corridor").addEventListener("click", () => selectIndoorType("corridor"));

function resetIndoorSelection() {
  state.indoorType = null;
  el("btn-select-room").classList.remove("selected");
  el("btn-select-corridor").classList.remove("selected");
  hide("label-floor");
  hide("label-room");
  hide("btn-indoor-next");
}

// 실내/외부 폼 양쪽에서 내 GPS와 기숙사 기준 좌표를 2줄로 나란히 보여준다.
// 실내에서도 판정 근거(왜 실내로 잡혔는지)를 사용자가 직접 확인할 수 있게 하기 위함.
function renderGpsInfo(elId) {
  const mine = state.lat
    ? `내 GPS: ${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}`
    : "내 GPS: 확인 안 됨";
  const dorm = state.dormLat != null && state.dormLng != null
    ? `기숙사 GPS: ${state.dormLat.toFixed(5)}, ${state.dormLng.toFixed(5)}`
    : "기숙사 GPS: 확인 안 됨";
  el(elId).innerHTML = `${mine}<br>${dorm}`;
}

function goToIndoorForm() {
  hide("step-location");
  hide("step-measuring");
  hide("step-form-outdoor");
  state.locationBranch = "indoor";
  resetIndoorSelection();
  renderGpsInfo("indoor-coords");
  show("step-form-indoor");
}

function goToOutdoorForm() {
  hide("step-location");
  hide("step-form-indoor");
  state.locationBranch = "outdoor";
  renderGpsInfo("outdoor-coords");
  show("step-form-outdoor");
}

// GPS/geofence 자동 판정이 틀렸을 때 사용자가 직접 폼을 뒤집을 수 있게 한다.
// 서버가 제출 시점에 GPS로 최종 판정을 독립적으로 다시 계산하므로(§3 6단계),
// 이 전환은 어떤 입력 폼을 보여줄지만 바꾸고 실제 실내/외부 기록에는 영향이
// 없다. 다만 실제 위치와 다르게 자가진단하면 측정 데이터 품질이 떨어질 수
// 있어 경고 후 manual_override 플래그로 서버에 함께 기록한다.
function switchBranchManually(targetBranch) {
  const label = targetBranch === "indoor" ? "기숙사 안" : "기숙사 밖";
  const ok = window.confirm(
    `실제 위치와 다르게 표시하면 측정 기록이 부정확하게 남을 수 있습니다.\n정말 ${label}(으)로 직접 변경하시겠습니까?`
  );
  if (!ok) return;
  state.manualOverride = true;
  if (targetBranch === "indoor") {
    goToIndoorForm();
  } else {
    goToOutdoorForm();
  }
}

el("btn-indoor-to-outdoor").addEventListener("click", () => switchBranchManually("outdoor"));
el("btn-outdoor-to-indoor").addEventListener("click", () => switchBranchManually("indoor"));

function buildSummary() {
  if (state.locationBranch === "indoor") {
    return state.indoorType === "corridor"
      ? { room: "", corridor: el("input-floor").value }
      : { room: el("input-room").value, corridor: "" };
  }
  return {
    note: el("input-note").value,
  };
}

function validateIndoorForm() {
  if (!state.indoorType) return false;
  const id = state.indoorType === "corridor" ? "input-floor" : "input-room";
  return el(id).value.trim() !== "";
}

function goToConfirm() {
  if (state.locationBranch === "indoor") {
    if (!validateIndoorForm()) {
      show("indoor-validation-error");
      return;
    }
    hide("indoor-validation-error");
  }

  state.form = buildSummary();
  hide("step-form-indoor");
  hide("step-form-outdoor");
  el("confirm-summary").textContent = JSON.stringify(
    { branch: state.locationBranch, carrier: state.carrier, lat: state.lat, lng: state.lng, ...state.form },
    null,
    2
  );
  show("step-confirm");
}

el("btn-indoor-next").addEventListener("click", goToConfirm);
el("btn-outdoor-next").addEventListener("click", goToConfirm);
el("btn-confirm-back").addEventListener("click", () => {
  hide("step-confirm");
  if (state.locationBranch === "indoor") show("step-form-indoor");
  else show("step-form-outdoor");
});
el("btn-confirm-start").addEventListener("click", () => {
  // 통금/geofence 경계가 GPS 확인 시점과 제출 시점 사이에 바뀌어 서버가
  // 실내 폼으로 되돌려 보낸 경우(runMeasurementAndSubmit의 400 처리 참고),
  // 이미 측정한 값이 남아 있으므로 재측정 없이 제출만 다시 시도한다.
  if (state.measurement) {
    submitMeasurement();
  } else {
    runMeasurementAndSubmit();
  }
});

function makeRandomChunk(size) {
  const data = new Uint8Array(size);
  // src/handlers/download.ts의 handleDownload와 동일한 패턴: 압축으로 인한
  // 처리량 왜곡을 막기 위해 앞부분만 실제 난수로 채우고 나머지는 반복한다.
  crypto.getRandomValues(data.subarray(0, Math.min(size, 65536)));
  for (let offset = 65536; offset < size; offset += 65536) {
    data.set(data.subarray(0, Math.min(65536, size - offset)), offset);
  }
  return data;
}

// 고정 크기 대신 고정 시간(durationMs) 동안 반복 요청해서, 회선 속도와 무관하게
// 총 측정 시간을 비슷하게 유지한다(speedtest.net과 같은 방식). onProgress로
// 경과시간/전체시간/현재까지의 처리량을 알려줘 진행 상황을 표시할 수 있게 한다.
async function measureDownload(durationMs, onProgress) {
  const startTime = performance.now();
  let totalBytes = 0;

  while (performance.now() - startTime < durationMs) {
    const res = await fetch(`/api/download?size=${DOWNLOAD_CHUNK_BYTES}`, { cache: "no-store" });
    const reader = res.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      const elapsedMs = performance.now() - startTime;
      onProgress({ elapsedMs, totalMs: durationMs, mbps: computeThroughputMbps(totalBytes, elapsedMs) });
      if (elapsedMs >= durationMs) {
        // 시간 다 됐으면 현재 청크는 중단한다. 이미 받은 바이트는 totalBytes에
        // 그대로 남아있으므로 부분 청크도 정확히 집계된다.
        reader.cancel().catch(() => {});
        break;
      }
    }
  }

  const elapsedMs = performance.now() - startTime;
  return { mbps: computeThroughputMbps(totalBytes, elapsedMs), totalBytes, elapsedMs };
}

async function measureUpload(durationMs, onProgress) {
  const chunk = makeRandomChunk(UPLOAD_CHUNK_BYTES);
  const startTime = performance.now();
  let totalBytes = 0;

  // 업로드는 fetch만으로는 전송 도중 진행률을 알 수 없어(브라우저 호환성 문제),
  // 청크 단위로만 진행률을 갱신한다. 마지막 청크가 끝날 때까지는 목표 시간을
  // 살짝 넘길 수 있다(다운로드처럼 중간에 끊지 않음).
  while (performance.now() - startTime < durationMs) {
    await fetch("/api/upload", { method: "POST", body: chunk });
    totalBytes += chunk.byteLength;
    const elapsedMs = performance.now() - startTime;
    onProgress({ elapsedMs, totalMs: durationMs, mbps: computeThroughputMbps(totalBytes, elapsedMs) });
  }

  const elapsedMs = performance.now() - startTime;
  return { mbps: computeThroughputMbps(totalBytes, elapsedMs), totalBytes, elapsedMs };
}

async function measurePing(onProgress) {
  const total = 20;
  const samples = [];
  for (let i = 0; i < total; i++) {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch("/api/ping", { cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      samples.push(performance.now() - start);
    } catch {
      samples.push(null);
    }
    onProgress({ done: i + 1, total });
  }
  return { samples, stats: computePingStats(samples) };
}

async function runMeasurementAndSubmit() {
  hide("step-confirm");
  hide("btn-measuring-retry");
  show("step-measuring");

  el("measuring-progress").value = 0;

  function showTimedProgress(label, p) {
    const pct = Math.min(100, Math.round((p.elapsedMs / p.totalMs) * 100));
    const remainingSec = Math.max(0, Math.ceil((p.totalMs - p.elapsedMs) / 1000));
    el("measuring-status").textContent =
      `${label} 측정 중... 약 ${remainingSec}초 남음 (현재 ${p.mbps.toFixed(1)} Mbps)`;
    el("measuring-progress").value = pct;
  }

  try {
    const download = await measureDownload(DOWNLOAD_DURATION_MS, (p) => showTimedProgress("다운로드", p));

    const upload = await measureUpload(UPLOAD_DURATION_MS, (p) => showTimedProgress("업로드", p));

    const { samples: pingSamples, stats } = await measurePing((p) => {
      el("measuring-status").textContent = `핑/지터 측정 중... (${p.done}/${p.total})`;
      el("measuring-progress").value = Math.round((p.done / p.total) * 100);
    });

    // 측정 결과를 state에 보관해두면, 이후 제출이 실패(예: 통금 경계 전환으로
    // 인한 400)해도 다시 측정할 필요 없이 제출만 재시도할 수 있다.
    state.measurement = {
      download_mbps: download.mbps,
      upload_mbps: upload.mbps,
      ping_ms: stats.ping_ms,
      jitter_ms: stats.jitter_ms,
      packet_loss_pct: stats.packet_loss_pct,
      raw_samples: {
        ping: pingSamples,
        download_bytes: download.totalBytes, download_ms: download.elapsedMs,
        upload_bytes: upload.totalBytes, upload_ms: upload.elapsedMs,
      },
    };

    await submitMeasurement();
  } catch (err) {
    // 측정 도중 네트워크 오류가 나도 사용자가 영구히 멈추지 않도록
    // 재시도 버튼을 보여준다(측정 중 화면에 그대로 머무름). 이 경우는
    // 측정 자체가 끝나지 않았으므로 처음부터 다시 측정해야 한다.
    el("measuring-status").textContent =
      "측정 중 오류 발생: 다시 시도해 주세요.";
    state.retryAction = "measure";
    show("btn-measuring-retry");
  }
}

async function submitMeasurement() {
  hide("step-confirm");
  show("step-measuring");
  hide("btn-measuring-retry");
  el("measuring-status").textContent = "제출 중...";

  const body = {
    lat: state.lat, lng: state.lng, accuracy_m: state.accuracy,
    carrier: state.carrier,
    room: state.form.room, corridor: state.form.corridor,
    note: state.form.note,
    manual_override: state.manualOverride,
    ...state.measurement,
  };

  let res;
  let resBody = null;
  try {
    res = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    resBody = await res.json().catch(() => null);
  } catch (err) {
    // 제출 요청 자체가 실패(네트워크 오류)한 경우 -- 이미 측정한 값은
    // state.measurement에 남아있으므로 재측정 없이 제출만 재시도한다.
    el("measuring-status").textContent =
      "제출 중 오류 발생: 다시 시도해 주세요.";
    state.retryAction = "submit";
    show("btn-measuring-retry");
    return;
  }

  if (res.ok) {
    const entry = {
      timestamp: Date.now(),
      branch: state.locationBranch,
      carrier: state.carrier,
      room: state.form.room ?? null,
      corridor: state.form.corridor ?? null,
      note: state.form.note ?? null,
      download_mbps: state.measurement.download_mbps,
      upload_mbps: state.measurement.upload_mbps,
      ping_ms: state.measurement.ping_ms,
      jitter_ms: state.measurement.jitter_ms,
      packet_loss_pct: state.measurement.packet_loss_pct,
    };
    saveHistoryEntry(entry);
    renderHistoryList();

    state.measurement = null;
    state.retryAction = null;
    hide("step-measuring");
    show("step-done");
    renderResult(entry);
    return;
  }

  const errorMessage = (resBody && typeof resBody.error === "string")
    ? resBody.error
    : `제출 실패 (status ${res.status})`;

  if (errorMessage.includes("room or corridor is required when indoors")) {
    // GPS 확인 시점(T0)과 제출 시점(T1) 사이에 통금 경계를 넘어가 서버가
    // 실내로 재판정한 경우. 이미 측정한 값은 유지한 채 실내 폼으로 보내
    // 호실/복도만 추가로 받는다(측정은 다시 하지 않는다).
    goToIndoorForm();
    return;
  }

  // 그 외의 서버 거부(예: 제출 시점에 WiFi로 전환됨) -- 측정 결과는 유지한 채
  // 제출만 재시도할 수 있는 경로를 제공한다.
  el("measuring-status").textContent = `제출 실패: ${errorMessage}`;
  state.retryAction = "submit";
  show("btn-measuring-retry");
}

el("btn-measuring-retry").addEventListener("click", () => {
  if (state.retryAction === "submit" && state.measurement) {
    submitMeasurement();
  } else {
    runMeasurementAndSubmit();
  }
});

renderHistoryList();
step1CheckNetwork();
