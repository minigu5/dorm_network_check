// 홈 화면 맨 위의 현황 요약(통신사 단계 막대 + 측정한 방 수). 페이지를 열 때 한 번만
// 불러온다 -- 측정 흐름 중에 막대가 바뀌며 화면이 들썩이지 않게. 실패하면 조용히 숨긴 채 둔다.
(() => {
  const { renderCarrier } = window.DormStats;
  const box = document.getElementById("stats-summary");

  fetch("/api/stats")
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((stats) => {
      document
        .getElementById("summary-carriers")
        .replaceChildren(...stats.carriers.map((c) => renderCarrier(c)));
      document.getElementById("summary-rooms").textContent =
        `${stats.roomsMeasured} / ${stats.roomsTotal}실 측정 완료`;
      box.hidden = false;
    })
    .catch(() => {});
})();
