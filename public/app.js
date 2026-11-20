const GQL_ENDPOINT = "/graphql";

async function gql(query, variables = {}) {
  const start = performance.now();
  try {
    const res = await fetch(GQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const dur = Math.round(performance.now() - start);

    const rem = res.headers.get("x-ratelimit-remaining");
    const rst = res.headers.get("x-ratelimit-reset");
    const cache = res.headers.get("x-cache") || "MISS";

    const remEl = document.getElementById("rate-rem");
    const rstEl = document.getElementById("rate-rst");
    if (remEl && rem !== null) remEl.textContent = rem;
    if (rstEl && rst !== null) rstEl.textContent = `${rst}s`;

    const json = await res.json();
    return {
      ok: res.ok,
      status: res.status,
      duration: dur,
      cache,
      data: json.data,
      errors: json.errors,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      duration: Math.round(performance.now() - start),
      cache: "ERR",
      data: null,
      errors: [{ message: err.message }],
    };
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => {
    t.style.display = "none";
  }, 3000);
}

const state = {
  tab: "data-tab",
  page: 1,
  pageSize: 25,
  search: "",
  source: "ALL",
  sortField: "CREATED_AT",
  sortOrder: "DESC",
};

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-tab");
      document.getElementById(target)?.classList.add("active");
      state.tab = target;
      if (target === "data-tab") loadData();
      if (target === "monitoring-tab") loadMonitoring();
    });
  });
}

async function loadData() {
  const tbody = document.getElementById("records-tbody");
  if (!tbody) return;

  const query = `
    query GetData($search: String, $source: DataSource, $sortField: SortField, $sortOrder: SortOrder, $page: Int, $pageSize: Int) {
      stats { total weather finance infra alerts }
      records(search: $search, source: $source, sortField: $sortField, sortOrder: $sortOrder, page: $page, pageSize: $pageSize) {
        items {
          id
          source
          title
          value
          unit
          status
          location { city country coordinates { lat lon } }
          comments(limit: 2) {
            content
            author { username badge { title level } }
          }
        }
        totalCount
        pageInfo { currentPage totalPages hasNextPage hasPrevPage }
      }
    }
  `;

  const vars = {
    search: state.search || undefined,
    source: state.source !== "ALL" ? state.source : undefined,
    sortField: state.sortField,
    sortOrder: state.sortOrder,
    page: state.page,
    pageSize: state.pageSize,
  };

  const res = await gql(query, vars);

  if (res.data?.stats) {
    const s = res.data.stats;
    document.getElementById("st-total").textContent = s.total.toLocaleString();
    document.getElementById("st-weather").textContent =
      s.weather.toLocaleString();
    document.getElementById("st-finance").textContent =
      s.finance.toLocaleString();
    document.getElementById("st-infra").textContent = s.infra.toLocaleString();
    document.getElementById("st-alerts").textContent =
      s.alerts.toLocaleString();
    document.getElementById("stat-total-pill").textContent =
      `${s.total.toLocaleString()} записей`;
  }

  const rec = res.data?.records;
  if (!rec || !rec.items.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center">Записей не найдено</td></tr>';
    updatePagination(0, 0, 1, 1, false, false);
    return;
  }

  updatePagination(
    rec.items.length,
    rec.totalCount,
    rec.pageInfo.currentPage,
    rec.pageInfo.totalPages,
    rec.pageInfo.hasPrevPage,
    rec.pageInfo.hasNextPage,
  );

  tbody.innerHTML = rec.items
    .map((r) => {
      const statusBadge =
        r.status === "ALERT"
          ? '<span class="badge badge-alert">ALERT</span>'
          : '<span class="badge badge-normal">NORMAL</span>';

      let commentsHtml = '<span style="color: var(--muted);">0 отзывов</span>';
      if (r.comments === null) {
        commentsHtml = '<span class="badge badge-alert" style="font-size: 10px;">⚠️ Сервис недоступен</span>';
      } else if (r.comments && r.comments.length) {
        const c = r.comments[0];
        commentsHtml = `<span style="font-size: 11px;">💬 <strong>${escapeHtml(c.author?.username || "user")}</strong> (${escapeHtml(c.author?.badge?.title || "Lv." + c.author?.badge?.level)}): "${escapeHtml(c.content)}"</span>`;
      }

      return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 11px;">${r.id.slice(0, 14)}</td>
        <td><span class="badge badge-accent">${r.source}</span></td>
        <td><strong>${escapeHtml(r.title)}</strong></td>
        <td><strong style="font-family: var(--font-mono);">${r.value}</strong> ${r.unit}</td>
        <td>${escapeHtml(r.location.city)} (${r.location.coordinates.lat.toFixed(1)}, ${r.location.coordinates.lon.toFixed(1)})</td>
        <td>${statusBadge}</td>
        <td>${commentsHtml}</td>
      </tr>
    `;
    })
    .join("");
}

function updatePagination(showing, total, cur, totalPages, hasPrev, hasNext) {
  document.getElementById("page-info").textContent =
    `Показано ${showing} из ${total}`;
  document.getElementById("page-current").textContent =
    `Стр. ${cur} из ${totalPages || 1}`;
  document.getElementById("btn-prev").disabled = !hasPrev;
  document.getElementById("btn-next").disabled = !hasNext;
}

function buildQuery() {
  const limit = parseInt(document.getElementById("qb-limit").value, 10) || 3;
  const fVal = document.getElementById("qb-f-val").checked;
  const fLoc = document.getElementById("qb-f-loc").checked;
  const fCoord = document.getElementById("qb-f-coord").checked;
  const fComm = document.getElementById("qb-f-comm").checked;
  const fAuth = document.getElementById("qb-f-author").checked;
  const fBadge = document.getElementById("qb-f-badge").checked;

  let q = `query DynamicRecords {\n  records(pageSize: ${limit}) {\n    items {\n      id\n      source\n      title\n`;
  if (fVal) q += `      value\n      unit\n      status\n`;
  if (fLoc) {
    q += `      location {\n        city\n        country\n`;
    if (fCoord) q += `        coordinates { lat lon }\n`;
    q += `      }\n`;
  }
  if (fComm) {
    q += `      comments(limit: 2) {\n        content\n`;
    if (fAuth) {
      q += `        author {\n          username\n`;
      if (fBadge) q += `          badge { title level }\n`;
      q += `        }\n`;
    }
    q += `      }\n`;
  }
  q += `    }\n    totalCount\n  }\n}`;
  document.getElementById("qb-editor").value = q;
}

async function runQuery() {
  const ed = document.getElementById("qb-editor");
  const out = document.getElementById("qb-result");
  out.textContent = "Выполнение...";
  const res = await gql(ed.value);
  document.getElementById("qb-cache-tag").textContent = `X-Cache: ${res.cache}`;
  document.getElementById("qb-time-tag").textContent = `${res.duration} ms`;
  out.textContent = JSON.stringify(res.data || res.errors, null, 2);
}

async function loadMonitoring() {
  const query = `
    query Mon {
      systemMetrics { uptimeSeconds memoryRssMb memoryHeapUsedMb nodeVersion }
      subgraphsStatus { name status isFailing }
      recentTraces { id timestamp operationName durationMs queryDepth hasErrors snippet }
    }
  `;
  const res = await gql(query);
  if (!res.data) return;

  const { systemMetrics, subgraphsStatus, recentTraces } = res.data;
  if (systemMetrics) {
    document.getElementById("sys-up").textContent =
      `${systemMetrics.uptimeSeconds}s`;
    document.getElementById("sys-rss").textContent =
      `${systemMetrics.memoryRssMb} MB`;
    document.getElementById("sys-heap").textContent =
      `${systemMetrics.memoryHeapUsedMb} MB`;
    document.getElementById("sys-node").textContent = systemMetrics.nodeVersion;
  }

  const comStatus = subgraphsStatus?.find((s) => s.name === "comments");
  if (comStatus) {
    const el = document.getElementById("chaos-status");
    el.textContent = comStatus.status;
    el.className = `badge ${comStatus.isFailing ? "badge-alert" : "badge-accent"}`;
  }

  const tbody = document.getElementById("traces-tbody");
  if (tbody && recentTraces) {
    tbody.innerHTML = recentTraces
      .map(
        (t) => `
      <tr>
        <td style="color: var(--muted); font-size: 10px;">${new Date(t.timestamp).toLocaleTimeString()}</td>
        <td><strong>${escapeHtml(t.operationName)}</strong></td>
        <td><strong style="color: var(--primary); font-family: var(--font-mono);">${t.durationMs} ms</strong></td>
        <td>${t.queryDepth}</td>
        <td><span class="badge ${t.hasErrors ? "badge-alert" : "badge-normal"}">${t.hasErrors ? "ERR" : "OK"}</span></td>
        <td style="font-family: var(--font-mono); font-size: 10px; color: var(--muted);">${escapeHtml(t.snippet)}</td>
      </tr>
    `,
      )
      .join("");
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.addEventListener("DOMContentLoaded", () => {
  initTabs();
  buildQuery();
  loadData();

  let deb = null;
  document.getElementById("filter-search")?.addEventListener("input", (e) => {
    clearTimeout(deb);
    deb = setTimeout(() => {
      state.search = e.target.value;
      state.page = 1;
      loadData();
    }, 300);
  });
  document.getElementById("filter-source")?.addEventListener("change", (e) => {
    state.source = e.target.value;
    state.page = 1;
    loadData();
  });
  document.getElementById("filter-sort")?.addEventListener("change", (e) => {
    state.sortField = e.target.value;
    loadData();
  });
  document.getElementById("filter-order")?.addEventListener("change", (e) => {
    state.sortOrder = e.target.value;
    loadData();
  });

  document.getElementById("btn-prev")?.addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      loadData();
    }
  });
  document.getElementById("btn-next")?.addEventListener("click", () => {
    state.page++;
    loadData();
  });
  document.getElementById("page-size")?.addEventListener("change", (e) => {
    state.pageSize = parseInt(e.target.value, 10);
    state.page = 1;
    loadData();
  });

  document
    .getElementById("btn-collect")
    ?.addEventListener("click", async () => {
      const res = await gql(`mutation Ingest { triggerIngest(count: 30) }`);
      if (res.data) {
        showToast(`Собрано ${res.data.triggerIngest} новых записей`);
        loadData();
      }
    });

  document.getElementById("qb-limit")?.addEventListener("input", buildQuery);
  document
    .querySelectorAll(".checkbox-list input")
    .forEach((cb) => cb.addEventListener("change", buildQuery));
  document.getElementById("btn-run-query")?.addEventListener("click", runQuery);

  document.querySelectorAll(".template-btns button").forEach((b) => {
    b.addEventListener("click", () => {
      const tmpl = b.getAttribute("data-tmpl");
      const ed = document.getElementById("qb-editor");
      if (tmpl === "deep") {
        ed.value = `query DeepQuery {\n  records(pageSize: 2) {\n    items {\n      title\n      value\n      location {\n        city\n        coordinates { lat lon }\n      }\n      comments(limit: 1) {\n        content\n        author {\n          username\n          badge { title level }\n        }\n      }\n    }\n  }\n}`;
      } else if (tmpl === "stats") {
        ed.value = `query Summary {\n  stats { total weather finance infra alerts }\n  systemMetrics { uptimeSeconds memoryRssMb nodeVersion }\n  subgraphsStatus { name status }\n}`;
      } else if (tmpl === "depth-err") {
        ed.value = `query DepthOverflow {\n  records(pageSize: 1) {\n    items {\n      comments {\n        record {\n          comments {\n            record {\n              comments {\n                author {\n                  badge {\n                    title\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}`;
      }
      runQuery();
    });
  });

  document
    .getElementById("btn-refresh-mon")
    ?.addEventListener("click", loadMonitoring);
  document.getElementById("btn-burst")?.addEventListener("click", async () => {
    showToast("Отправка 10 запросов...");
    await Promise.all(
      Array.from({ length: 10 }, () => gql(`query Ping { stats { total } }`)),
    );
    showToast("10 запросов выполнено");
    loadMonitoring();
  });

  let failCom = false;
  document
    .getElementById("btn-chaos-fail")
    ?.addEventListener("click", async () => {
      failCom = !failCom;
      await gql(
        `mutation Chaos($fail: Boolean!) { simulateFault(subgraph: "comments", fail: $fail) { status } }`,
        { fail: failCom },
      );
      showToast(`Comments: ${failCom ? "СБОЙ (FAIL)" : "ONLINE"}`);
      loadMonitoring();
    });

  setInterval(() => {
    if (state.tab === "monitoring-tab") loadMonitoring();
  }, 6000);
});
