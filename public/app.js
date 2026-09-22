const state = {
  networkOk: false,
  lat: null, lng: null, accuracy: null,
  locationBranch: null, // "indoor" | "outdoor"
  form: {},
};

const el = (id) => document.getElementById(id);
const show = (id) => { el(id).hidden = false; };
const hide = (id) => { el(id).hidden = true; };

async function step1CheckNetwork() {
  const res = await fetch("/api/network-check");
  const body = await res.json();
  if (body.status !== "mobile") {
    el("network-status").textContent =
      "모바일 데이터로 연결한 뒤 다시 시도하세요. (현재 WiFi 또는 다른 네트워크로 감지됨)";
    return;
  }
  state.networkOk = true;
  el("network-status").textContent = "모바일 데이터 연결 확인됨.";
  await step2CheckLocation();
}

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
          `/api/location-check?lat=${state.lat}&lng=${state.lng}`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        const { tag } = await res.json();
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

function goToIndoorForm() {
  hide("step-location");
  state.locationBranch = "indoor";
  show("step-form-indoor");
}

function goToOutdoorForm() {
  hide("step-location");
  state.locationBranch = "outdoor";
  el("outdoor-coords").textContent = state.lat
    ? `GPS: ${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}`
    : "GPS: 확인 안 됨";
  show("step-form-outdoor");
}

function buildSummary() {
  if (state.locationBranch === "indoor") {
    return {
      carrier: el("input-carrier-indoor").value,
      dong: el("input-dong").value,
      floor: el("input-floor").value,
      room: el("input-room").value,
      corridor: el("input-corridor").value,
    };
  }
  return {
    carrier: el("input-carrier-outdoor").value,
    note: el("input-note").value,
  };
}

function goToConfirm() {
  state.form = buildSummary();
  hide("step-form-indoor");
  hide("step-form-outdoor");
  el("confirm-summary").textContent = JSON.stringify(
    { branch: state.locationBranch, lat: state.lat, lng: state.lng, ...state.form },
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
el("btn-confirm-start").addEventListener("click", runMeasurementAndSubmit);

async function measureDownload() {
  const sizes = [1_000_000, 5_000_000, 20_000_000];
  let lastMbps = 0;
  for (const size of sizes) {
    const start = performance.now();
    const res = await fetch(`/api/download?size=${size}`, { cache: "no-store" });
    await res.arrayBuffer();
    const elapsed = performance.now() - start;
    lastMbps = computeThroughputMbps(size, elapsed);
  }
  return lastMbps;
}

async function measureUpload() {
  const size = 5_000_000;
  const data = new Uint8Array(size);
  const start = performance.now();
  await fetch("/api/upload", { method: "POST", body: data });
  const elapsed = performance.now() - start;
  return computeThroughputMbps(size, elapsed);
}

async function measurePing() {
  const samples = [];
  for (let i = 0; i < 20; i++) {
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
  }
  return { samples, stats: computePingStats(samples) };
}

async function runMeasurementAndSubmit() {
  hide("step-confirm");
  hide("btn-measuring-retry");
  show("step-measuring");

  try {
    el("measuring-status").textContent = "다운로드 측정 중...";
    const download_mbps = await measureDownload();

    el("measuring-status").textContent = "업로드 측정 중...";
    const upload_mbps = await measureUpload();

    el("measuring-status").textContent = "핑/지터 측정 중...";
    const { samples, stats } = await measurePing();

    const body = {
      lat: state.lat, lng: state.lng, accuracy_m: state.accuracy,
      carrier: state.form.carrier,
      dong: state.form.dong, floor: state.form.floor,
      room: state.form.room, corridor: state.form.corridor,
      note: state.form.note,
      download_mbps, upload_mbps,
      ping_ms: stats.ping_ms, jitter_ms: stats.jitter_ms,
      packet_loss_pct: stats.packet_loss_pct,
      raw_samples: { ping: samples },
    };

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    hide("step-measuring");
    show("step-done");
    el("result-summary").textContent = res.ok
      ? JSON.stringify(body, null, 2)
      : `제출 실패: ${res.status}`;
  } catch (err) {
    // 측정/제출 도중 네트워크 오류가 나도 사용자가 영구히 멈추지 않도록
    // 재시도 버튼을 보여준다(측정 중 화면에 그대로 머무름).
    el("measuring-status").textContent =
      "측정 중 오류 발생: 다시 시도해 주세요.";
    show("btn-measuring-retry");
  }
}

el("btn-measuring-retry").addEventListener("click", runMeasurementAndSubmit);

step1CheckNetwork();
