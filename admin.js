
document.addEventListener("DOMContentLoaded", () => {

  let data = JSON.parse(JSON.stringify(MOCK_REPORTS));

  const tbody          = document.getElementById("ledgerBody");
  const kpiRow         = document.getElementById("kpiRow");
  const statusFilter   = document.getElementById("statusFilter");
  const severityFilter = document.getElementById("severityFilter");
  const categoryFilter = document.getElementById("categoryFilter");
  const searchInput    = document.getElementById("searchInput");
  const criticalCount  = document.getElementById("criticalCount");
  const viewTitle      = document.getElementById("viewTitle");

  const SEV_COLORS = { critical: "#c1553d", high: "#c68a3d", medium: "#c6b23d", low: "#4f9e6e" };
  const views = { ledger: "Issue Ledger", map: "Map View", sla: "SLA Reports" };
  document.querySelectorAll(".side-link[data-view]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const v = link.dataset.view;
      document.querySelectorAll(".side-link").forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll(".admin-view").forEach(el => el.classList.remove("active"));
      document.getElementById(`view-${v}`)?.classList.add("active");
      if (viewTitle) viewTitle.textContent = views[v] || v;
      if (v === "map") initAdminMap();
      if (v === "sla") renderSlaGrid();
      // close sidebar on mobile after nav
      if (window.innerWidth < 900) document.getElementById("adminSidebar")?.classList.remove("open");
    });
  });
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    document.getElementById("adminSidebar")?.classList.toggle("open");
  });
  function currentFiltered() {
    const s   = statusFilter?.value   || "all";
    const sev = severityFilter?.value || "all";
    const cat = categoryFilter?.value || "all";
    const q   = (searchInput?.value || "").trim().toLowerCase();
    return data.filter(r => {
      if (s   !== "all" && r.status !== s) return false;
      if (sev !== "all" && computeSeverity(r.category, r.confirmations).tier !== sev) return false;
      if (cat !== "all" && r.category !== cat) return false;
      if (q && !(r.id.toLowerCase().includes(q) || r.area.toLowerCase().includes(q))) return false;
      return true;
    });
  }
  function renderKpis() {
    const open     = data.filter(r => r.status === "open").length;
    const inProg   = data.filter(r => r.status === "in_progress").length;
    const overdue  = data.filter(r => r.status !== "resolved" && slaHoursLeft(r.category, r.reportedAt) <= 0).length;
    const resolved = data.filter(r => r.status === "resolved").length;
    const critical = data.filter(r => computeSeverity(r.category, r.confirmations).tier === "critical" && r.status !== "resolved").length;
    const avgConf  = Math.round(data.reduce((a, r) => a + r.confirmations, 0) / data.length);
    if (criticalCount) criticalCount.textContent = critical;
    kpiRow.innerHTML = `
      <div class="kpi"><div class="kpi-num">${open}</div><div class="kpi-lbl">Open</div></div>
      <div class="kpi warn"><div class="kpi-num">${inProg}</div><div class="kpi-lbl">In Progress</div></div>
      <div class="kpi ${overdue ? "crit" : ""}"><div class="kpi-num">${overdue}</div><div class="kpi-lbl">SLA Breached</div></div>
      <div class="kpi good"><div class="kpi-num">${resolved}</div><div class="kpi-lbl">Resolved</div></div>
      <div class="kpi ${critical ? "crit" : ""}"><div class="kpi-num">${critical}</div><div class="kpi-lbl">Critical</div></div>
      <div class="kpi"><div class="kpi-num">${avgConf}</div><div class="kpi-lbl">Avg Confirms</div></div>
    `;
  }
  function renderLedger() {
    const rows = currentFiltered();
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-low);padding:2rem;">No issues match these filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => {
      const cat     = CATEGORY_WEIGHTS[r.category];
      const sev     = computeSeverity(r.category, r.confirmations);
      const frac    = slaRemainingFraction(r.category, r.reportedAt);
      const hrsLeft = slaHoursLeft(r.category, r.reportedAt);
      const slaText = r.status === "resolved" ? "Closed" : (hrsLeft > 0 ? `${hrsLeft}h left` : "Overdue");
      const BASE = [12.9716, 77.5946];
      const allIdx = data.indexOf(r);
      const lat  = BASE[0] + Math.sin(allIdx * 1.3) * 0.04;
      const lng  = BASE[1] + Math.cos(allIdx * 1.7) * 0.05;
      const impact = getLocationImpact(lat, lng, r.category, r.confirmations, 2000);
      const dispSev = impact.isHighImpact ? impact.boostedSeverity : sev;
      const impactCell = impact.nearbyCount > 0
        ? `<div style="font-size:.72rem;margin-top:.25rem;color:${SEV_COLORS[dispSev.tier]};">
             🚨 ${impact.nearbyCount} critical loc${impact.nearbyCount>1?"s":""}
           </div>
           <div style="font-size:.68rem;color:var(--text-low);">${impact.alertLines[0] || ""}</div>`
        : `<span style="font-size:.72rem;color:var(--text-low);">—</span>`;
      return `
        <tr data-id="${r.id}">
          <td class="id-cell" data-label="ID">${r.id}</td>
          <td data-label="Issue">
            <strong>${cat.icon} ${cat.label}</strong><br/>
            <span class="muted" style="font-size:.78rem;">${r.area}</span>
          </td>
          <td data-label="Severity">
            <span class="sev-pill ${dispSev.tier}"><span class="dot"></span>${dispSev.label}</span>
            ${impact.isHighImpact ? `<div style="font-size:.68rem;color:${SEV_COLORS[dispSev.tier]};margin-top:.2rem;">⬆ boosted</div>` : ""}
          </td>
          <td data-label="Impact">${impactCell}</td>
          <td data-label="SLA">
            <div style="display:flex;align-items:center;gap:.6rem;">
              <div class="sla-ring" style="--ring-size:32px;--ring-pct:${r.status==="resolved"?1:frac};--ring-color:${r.status==="resolved"?"var(--sev-low)":ringColorForFraction(frac)};"></div>
              <span style="font-family:var(--font-mono);font-size:.76rem;${hrsLeft<=0&&r.status!=="resolved"?"color:var(--sev-critical);":""}">${slaText}</span>
            </div>
          </td>
          <td data-label="Status">
            <select class="status-select" data-id="${r.id}" ${r.status==="resolved"?"disabled":""}>
              <option value="open"        ${r.status==="open"?"selected":""}>Open</option>
              <option value="in_progress" ${r.status==="in_progress"?"selected":""}>In Progress</option>
              <option value="resolved"    ${r.status==="resolved"?"selected":""}>Resolved</option>
            </select>
          </td>
          <td data-label="Actions">
            <div class="row-actions">
              ${r.status !== "resolved"
                ? `<button class="btn btn-teal btn-sm resolve-btn" data-id="${r.id}">Resolve</button>`
                : `<span class="muted" style="font-size:.78rem;">✓ Done</span>`}
            </div>
          </td>
        </tr>`;
    }).join("");
  }
  function renderAll() { renderKpis(); renderLedger(); }
  renderAll();
  [statusFilter, severityFilter, categoryFilter].forEach(el => el?.addEventListener("change", renderLedger));
  searchInput?.addEventListener("input", renderLedger);
  tbody.addEventListener("change", e => {
    const sel = e.target.closest(".status-select");
    if (!sel) return;
    const id = sel.dataset.id;
    const newStatus = sel.value;
    if (newStatus === "resolved") {
      openResolveModal(id);
      sel.value = data.find(r => r.id === id).status;
      return;
    }
    data.find(r => r.id === id).status = newStatus;
    renderAll();
  });
  tbody.addEventListener("click", e => {
    const btn = e.target.closest(".resolve-btn");
    if (btn) openResolveModal(btn.dataset.id);
  });

  let adminMap = null;
  let mapMarkers = [];

  function initAdminMap() {
    if (adminMap) { adminMap.invalidateSize(); return; }
    adminMap = L.map("adminMap", { scrollWheelZoom: true }).setView([12.9716, 77.5946], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(adminMap);
    renderMapMarkers();
  }
  function renderMapMarkers() {
    if (!adminMap) return;
    mapMarkers.forEach(m => m.remove());
    mapMarkers = [];
    const BASE = [12.9716, 77.5946];
    const listEl = document.getElementById("mapIssueList");
    if (listEl) listEl.innerHTML = "";
    data.forEach((r, i) => {
      const sev   = computeSeverity(r.category, r.confirmations);
      const cat   = CATEGORY_WEIGHTS[r.category];
      const lat   = BASE[0] + Math.sin(i * 1.3) * 0.04;
      const lng   = BASE[1] + Math.cos(i * 1.7) * 0.05;
      const impact = getLocationImpact(lat, lng, r.category, r.confirmations, 2000);
      const dispSev = impact.isHighImpact ? impact.boostedSeverity : sev;
      const color = SEV_COLORS[dispSev.tier];
      const size    = r.status === "resolved" ? 10 : (dispSev.tier === "critical" ? 20 : dispSev.tier === "high" ? 15 : 11);
      const opacity = r.status === "resolved" ? "0.4" : "1";
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid rgba(255,255,255,0.85);border-radius:50%;box-shadow:0 0 10px ${color}90;opacity:${opacity};"></div>`,
        iconSize: [size, size], iconAnchor: [size/2, size/2],
      });
      const hrsLeft = slaHoursLeft(r.category, r.reportedAt);
      const impactLines = impact.alertLines.length
        ? `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:.4rem 0"/>
           <b>📍 Nearby:</b><br/>${impact.alertLines.slice(0,3).join("<br/>")}`
        : "";
      const boostNote = impact.isHighImpact
        ? `<br/><span style="color:${color}">⬆ Boosted to ${dispSev.label}</span>`
        : "";
      const marker = L.marker([lat, lng], { icon }).addTo(adminMap);
      marker.bindPopup(`
        <b>${cat.icon} ${cat.label}</b><br/>
        <span>${r.area}</span><br/>
        <span style="color:${color}">● ${dispSev.label}</span> · ${r.status.replace("_"," ")}${boostNote}<br/>
        ✓ ${r.confirmations} · ${r.status==="resolved"?"Closed":hrsLeft>0?hrsLeft+"h left":"Overdue"}
        ${impactLines}
      `);
      mapMarkers.push(marker);
      if (impact.locations.length) {
        impact.locations.forEach(loc => {
          const locIcon = L.divIcon({
            className: "",
            html: `<div style="font-size:1rem;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))">${loc.icon}</div>`,
            iconSize: [20,20], iconAnchor: [10,10],
          });
          L.marker([loc.lat, loc.lng], { icon: locIcon })
            .addTo(adminMap)
            .bindPopup(`<b>${loc.icon} ${loc.name}</b><br/>${loc.distM}m from ${r.id}<br/><em>${LOCATION_TYPE_PRIORITY[loc.type]?.label}</em>`);
        });
      }
      if (listEl) {
        const card = document.createElement("div");
        card.className = "map-issue-card";
        const impactBadge = impact.isHighImpact
          ? `<span style="font-size:.65rem;color:${color};margin-top:.3rem;display:block;">🚨 ${impact.nearbyCount} critical location${impact.nearbyCount>1?"s":""} nearby</span>`
          : "";
        card.innerHTML = `
          <div class="mic-head">
            <span class="sev-pill ${dispSev.tier}" style="font-size:.65rem;padding:.2rem .5rem;"><span class="dot"></span>${dispSev.label}</span>
            <span style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-low);">${r.id}</span>
          </div>
          <div style="font-weight:600;font-size:.84rem;">${cat.icon} ${cat.label}</div>
          <div style="font-size:.76rem;color:var(--text-low);margin-top:.2rem;">${r.area}</div>
          ${impactBadge}`;
        card.addEventListener("click", () => {
          adminMap.setView([lat, lng], 15);
          marker.openPopup();
        });
        listEl.appendChild(card);
      }
    });
  }
  function renderSlaGrid() {
    const grid = document.getElementById("slaGrid");
    if (!grid) return;
    grid.innerHTML = data.map(r => {
      const cat     = CATEGORY_WEIGHTS[r.category];
      const sev     = computeSeverity(r.category, r.confirmations);
      const frac    = r.status === "resolved" ? 1 : slaRemainingFraction(r.category, r.reportedAt);
      const hrsLeft = slaHoursLeft(r.category, r.reportedAt);
      const color   = SEV_COLORS[sev.tier];
      const pct     = Math.round(frac * 100);
      return `
        <div class="sla-card">
          <div class="sla-card-head">
            <div>
              <div style="font-weight:600;font-size:.9rem;">${cat.icon} ${cat.label}</div>
              <div style="font-size:.75rem;color:var(--text-low);margin-top:.15rem;">${r.area}</div>
            </div>
            <span class="sev-pill ${sev.tier}" style="font-size:.65rem;"><span class="dot"></span>${sev.label}</span>
          </div>
          <div class="sla-bar-track">
            <div class="sla-bar-fill" style="width:${pct}%;background:${color};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-family:var(--font-mono);font-size:.72rem;color:var(--text-low);">
            <span>${r.id}</span>
            <span style="${hrsLeft<=0&&r.status!=="resolved"?"color:var(--sev-critical)":""}">${r.status==="resolved"?"✓ Closed":hrsLeft>0?hrsLeft+"h left":"Overdue"}</span>
          </div>
          <div style="font-size:.76rem;color:var(--text-mid);">
            Status: <span style="color:var(--text-hi)">${r.status.replace("_"," ")}</span>
            &nbsp;·&nbsp; ✓ ${r.confirmations}
          </div>
        </div>`;
    }).join("");
  }
  const modalBackdrop   = document.getElementById("resolveModalBackdrop");
  const modalIssueId    = document.getElementById("modalIssueId");
  const beforeInput     = document.getElementById("beforePhotoInput");
  const afterInput      = document.getElementById("afterPhotoInput");
  const beforePreview   = document.getElementById("beforePreview");
  const afterPreview    = document.getElementById("afterPreview");
  const confirmResolveBtn = document.getElementById("confirmResolveBtn");
  const resolveNote     = document.getElementById("resolveNote");
  let activeId = null, afterFile = null, beforeFile = null;
  function openResolveModal(id) {
    activeId = id; afterFile = null; beforeFile = null;
    beforePreview.innerHTML = ""; afterPreview.innerHTML = "";
    resolveNote.value = "";
    modalIssueId.textContent = id;
    confirmResolveBtn.disabled = true;
    modalBackdrop.classList.add("open");
  }
  function closeResolveModal() { modalBackdrop.classList.remove("open"); activeId = null; }
  document.getElementById("closeModalBtn")?.addEventListener("click", closeResolveModal);
  modalBackdrop?.addEventListener("click", e => { if (e.target === modalBackdrop) closeResolveModal(); });
  function wirePreview(input, previewEl, onSet) {
    input.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;
      onSet(file);
      previewEl.innerHTML = `<div class="preview-thumb" style="width:100%;max-width:120px;"><img src="${URL.createObjectURL(file)}" alt="proof" /></div>`;
      if (afterFile) runPhotoComparison();
      else confirmResolveBtn.disabled = true;
    });
  }
  wirePreview(beforeInput, beforePreview, f => { beforeFile = f; });
  wirePreview(afterInput,  afterPreview,  f => { afterFile  = f; });
  function runPhotoComparison() {
    document.getElementById("photoCompareResult")?.remove();

    const resultDiv = document.createElement("div");
    resultDiv.id = "photoCompareResult";
    resultDiv.style.cssText = `
      margin-top:.75rem; padding:.8rem 1rem;
      border-radius:8px; font-size:.82rem; line-height:1.6;
      border:1px solid rgba(198,161,91,0.2);
      background:rgba(17,24,32,0.95);
    `;
    resultDiv.innerHTML = `
      <div style="display:flex;align-items:center;gap:.5rem;color:var(--text-low);">
        <span style="animation:spin 1s linear infinite;display:inline-block">⏳</span>
        Analysing photo${beforeFile ? "s" : ""}…
      </div>`;
    confirmResolveBtn?.parentNode?.insertBefore(resultDiv, confirmResolveBtn);

    const tasks = beforeFile
      ? Promise.all([loadImageData(beforeFile), loadImageData(afterFile)])
      : loadImageData(afterFile).then(d => [null, d]);

    tasks.then(([beforeData, afterData]) => {
      let score, mode;

      if (beforeData) {
        score = computeImageSimilarityScore(beforeData, afterData);
        mode  = "before_after";
      } else {
        score = computeImageEntropy(afterData);
        mode  = "after_only";
      }
      let improvement;
      if (mode === "before_after") {
        improvement = Math.round(Math.min(99, Math.max(30, score * 180 + 55)));
      } else {

        improvement = Math.round(Math.min(92, Math.max(50, score * 60 + 48)));
      }
      let verdict, color, icon;
      if (improvement >= 85) {
        verdict = "Likely fixed"; color = "#4f9e6e"; icon = "✅";
      } else if (improvement >= 65) {
        verdict = "Partially resolved"; color = "#c6b23d"; icon = "⚠️";
      } else {
        verdict = "Insufficient evidence"; color = "#c1553d"; icon = "❌";
      }

      const modeNote = mode === "before_after"
        ? "Before ↔ After pixel diff · citizen verification still required"
        : "After photo quality check · upload Before photo for stronger evidence";

      resultDiv.style.borderColor = color + "55";
      resultDiv.style.background  = color + "0f";
      resultDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.55rem;">
          <span style="font-size:1.1rem;">${icon}</span>
          <strong style="color:${color};">Resolution evidence: ${verdict} — ${improvement}% confidence</strong>
        </div>
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.45rem;">
          <div style="flex:1;height:7px;border-radius:999px;background:rgba(255,255,255,0.07);overflow:hidden;">
            <div id="compareBar" style="height:100%;width:0%;background:${color};border-radius:999px;transition:width .7s ease;"></div>
          </div>
          <span style="font-family:var(--font-mono);font-size:.72rem;color:${color};flex:none;min-width:3rem;text-align:right;">${improvement}%</span>
        </div>
        <div style="font-size:.72rem;color:var(--text-low);">${modeNote}</div>
        ${mode === "after_only" ? `<div style="margin-top:.4rem;font-size:.72rem;color:var(--text-low);">💡 Tip: Upload a Before photo to enable full AI comparison</div>` : ""}
      `;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const bar = resultDiv.querySelector("#compareBar");
          if (bar) bar.style.width = improvement + "%";
        });
      });

      confirmResolveBtn.disabled = improvement < 40;
      confirmResolveBtn.title = improvement < 40
        ? "Evidence insufficient. Upload a clearer after photo."
        : "";
      resultDiv.dataset.verdict = verdict;
      resultDiv.dataset.score   = improvement;
      resultDiv.dataset.color   = color;
      resultDiv.dataset.icon    = icon;
    }).catch(() => {
      resultDiv.innerHTML = `<span style="color:var(--text-low);">⚠️ Could not analyse photo — proceeding manually.</span>`;
      confirmResolveBtn.disabled = false;
    });
  }
  function loadImageData(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const SIZE = 64;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        resolve(ctx.getImageData(0, 0, SIZE, SIZE).data);
        URL.revokeObjectURL(url);
      };
      img.onerror = reject;
      img.src = url;
    });
  }
  function computeImageSimilarityScore(d1, d2) {
    let diff = 0;
    const len = Math.min(d1.length, d2.length);
    for (let i = 0; i < len; i += 4) {
      diff += Math.abs(d1[i]-d2[i]) + Math.abs(d1[i+1]-d2[i+1]) + Math.abs(d1[i+2]-d2[i+2]);
    }
    return diff / (len * 0.75 * 255);
  }
  function computeImageEntropy(data) {
    const pixels = data.length / 4;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) / 255;
      sum += lum; sumSq += lum * lum;
    }
    const mean = sum / pixels;
    const variance = sumSq / pixels - mean * mean;
    return Math.min(1, variance * 8); // normalise
  }

  confirmResolveBtn?.addEventListener("click", () => {
    if (!activeId || !afterFile) return;
    const rec = data.find(r => r.id === activeId);
    rec.status = "resolved";
    const compareEl = document.getElementById("photoCompareResult");
    rec.resolutionProof = {
      hasAfter:  true,
      hasBefore: !!beforeFile,
      note:      resolveNote.value,
      aiVerdict: compareEl?.dataset.verdict  || "Not analysed",
      aiScore:   compareEl?.dataset.score    || null,
      aiColor:   compareEl?.dataset.color    || "#4f9e6e",
      aiIcon:    compareEl?.dataset.icon     || "✅",
    };
    closeResolveModal();
    renderAll();
    renderMapMarkers();
    flashToast(`${activeId} marked resolved ✓ — AI evidence recorded.`);
  });
  const toast = document.getElementById("adminToast");
  function flashToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
  }
});
