// /stats 페이지와 홈 요약이 같이 쓰는 통신사 단계 막대. 홈의 app.js가 전역에 el 등을
// 선언하므로 이름이 부딪치지 않게 IIFE로 감싸 window.DormStats 하나만 내보낸다.
(() => {
  const TIER_LABEL = { good: "거의 그대로", slow: "꽤 느려짐", bad: "매우 느림" };

  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "style") node.style.cssText = v;
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) node.append(c);
    return node;
  }

  function renderCarrier(c, minBaseline) {
    let bar;
    if (!c.baselineReady) {
      bar = h("div", { class: "stack pending", text: `밖 측정 ${c.outdoorCount} / ${minBaseline}건 · 모이면 표시` });
    } else if (c.indoorCount === 0) {
      bar = h("div", { class: "stack empty", text: "아직 기숙사 안 측정 없음" });
    } else {
      bar = h(
        "div",
        { class: "stack", role: "img", "aria-label": Object.entries(c.tiers).map(([t, n]) => `${TIER_LABEL[t]} ${n}건`).join(", ") },
        ["good", "slow", "bad"]
          .filter((t) => c.tiers[t] > 0)
          .map((t) => h("div", { class: t, style: `flex: ${c.tiers[t]}`, title: `${TIER_LABEL[t]} ${c.tiers[t]}건`, text: String(c.tiers[t]) }))
      );
    }
    return h("div", { class: "carrier" }, [
      h("div", { class: "carrier-head" }, [
        h("b", { text: c.carrier }),
        h("span", { class: "carrier-count", text: `안 ${c.indoorCount}건 · 밖 ${c.outdoorCount}건` }),
      ]),
      bar,
    ]);
  }

  window.DormStats = { TIER_LABEL, h, renderCarrier };
})();
