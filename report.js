
document.addEventListener("DOMContentLoaded", () => {

  let currentLang = "en-IN";

  function t(key) {
    return (UI_STRINGS[currentLang] || UI_STRINGS["en-IN"])[key] || UI_STRINGS["en-IN"][key] || key;
  }

  function applyLanguage(lang) {
    currentLang = lang;
    const strings = UI_STRINGS[lang] || UI_STRINGS["en-IN"];

    const formTitle = document.getElementById("formTitle");
    if (formTitle) formTitle.textContent = strings.formTitle;

    const voicePanelLabel = document.getElementById("voicePanelLabel");
    if (voicePanelLabel) voicePanelLabel.textContent = strings.voiceLabel;

    const voicePanelSub = document.getElementById("voicePanelSub");
    if (voicePanelSub) voicePanelSub.textContent = strings.voiceSub;

    const descInput = document.getElementById("descInput");
    if (descInput) descInput.placeholder = strings.placeholder;

    const submitBtn = document.querySelector("#reportForm [type=submit]");
    if (submitBtn) submitBtn.textContent = strings.submitBtn;

    const locateBtn = document.getElementById("locateBtn");
    if (locateBtn) locateBtn.innerHTML = strings.locateBtn;

    const applyBtn = document.getElementById("applyTranscriptBtn");
    if (applyBtn) applyBtn.textContent = strings.applyBtn;

    const retryBtn = document.getElementById("retryVoiceBtn");
    if (retryBtn) retryBtn.textContent = strings.retryBtn;
    document.documentElement.lang = lang.split("-")[0];
  }
  const langBtn      = document.getElementById("langBtn");
  const langDropdown = document.getElementById("langDropdown");
  const langName     = document.getElementById("langName");
  const langFlag     = document.getElementById("langFlag");
  langBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = langDropdown.classList.toggle("open");
    langBtn.setAttribute("aria-expanded", open);
  });
  document.addEventListener("click", () => {
    langDropdown?.classList.remove("open");
    langBtn?.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".lang-option").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".lang-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      const lang = opt.dataset.lang;
      langName.textContent = opt.dataset.name;
      langFlag.textContent = opt.dataset.flag === "🟠" ? "🌐" : opt.dataset.flag;
      langDropdown.classList.remove("open");
      langBtn.setAttribute("aria-expanded", "false");
      applyLanguage(lang);
    });
  });
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks  = document.querySelector(".nav-links");
  navToggle?.addEventListener("click", () => {
    navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", navLinks.classList.contains("open"));
  });
  const categoryGrid = document.getElementById("categoryGrid");
  const severityCopy = document.getElementById("severityCopy");
  const severityPill = document.getElementById("severityPill");
  const sevOverride  = document.getElementById("sevOverride");
  const sevChips     = document.getElementById("sevOverrideChips");
  let selectedCategory = null;
  let manualSeverity   = "auto";
  function renderCategoryChips() {
    categoryGrid.innerHTML = Object.entries(CATEGORY_WEIGHTS).map(([key, c]) => `
      <label class="category-chip" data-key="${key}">
        <input type="radio" name="category" value="${key}" />
        <span class="ic">${c.icon}</span>
        <span>${c.label}</span>
      </label>
    `).join("");
  }
  function effectiveSeverity() {
    if (manualSeverity !== "auto") return { tier: manualSeverity, label: manualSeverity.charAt(0).toUpperCase() + manualSeverity.slice(1), score: 0 };
    if (!selectedCategory) return null;
    return computeSeverity(selectedCategory, 0);
  }
  function updateSeverityReadout() {
    const sev = effectiveSeverity();
    if (!sev) {
      severityPill.innerHTML = `<span class="dot"></span> Select a category`;
      severityPill.className = "sev-pill";
      severityCopy.innerHTML = `Severity is <b>inferred automatically</b> from the issue category and how many nearby citizens confirm it.`;
      sevOverride.style.display = "none";
      return;
    }
    severityPill.className = `sev-pill ${sev.tier}`;
    severityPill.innerHTML = `<span class="dot"></span> ${sev.label} severity${manualSeverity !== "auto" ? " (manual override)" : " (auto)"}`;
    if (selectedCategory) {
      const cat = CATEGORY_WEIGHTS[selectedCategory];
      severityCopy.innerHTML = manualSeverity !== "auto"
        ? `You've set severity manually to <b>${sev.label}</b>.`
        : `Based on <b>${cat.label}</b>, this starts at <b>${sev.label.toLowerCase()}</b> severity with a <b>${cat.slaHours}h</b> SLA.`;
      sevOverride.style.display = "block";
    }
  }

  function selectCategory(key) {
    selectedCategory = key;
    categoryGrid.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
    const chip = categoryGrid.querySelector(`.category-chip[data-key="${key}"]`);
    if (chip) { chip.classList.add("active"); chip.querySelector("input").checked = true; }
    updateSeverityReadout();
  }

  sevChips?.addEventListener("click", e => {
    const btn = e.target.closest(".sev-chip");
    if (!btn) return;
    manualSeverity = btn.dataset.sev;
    sevChips.querySelectorAll(".sev-chip").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    updateSeverityReadout();
  });

  categoryGrid?.addEventListener("click", e => {
    const chip = e.target.closest(".category-chip");
    if (!chip) return;
    selectCategory(chip.dataset.key);
  });

  renderCategoryChips();
  updateSeverityReadout();


  const micBtn             = document.getElementById("micBtn");
  const voiceTranscript    = document.getElementById("voiceTranscript");
  const transcriptText     = document.getElementById("transcriptText");
  const transcriptActions  = document.getElementById("transcriptActions");
  const applyTranscriptBtn = document.getElementById("applyTranscriptBtn");
  const retryVoiceBtn      = document.getElementById("retryVoiceBtn");
  const voicePanelSub      = document.getElementById("voicePanelSub");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let lastTranscript = "";

  if (!SpeechRecognition) {
    if (micBtn) {
      micBtn.disabled = true;
      micBtn.title = "Voice input not supported in this browser. Try Chrome.";
    }
    if (voicePanelSub) voicePanelSub.textContent = "Voice input requires Chrome or Edge.";
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      micBtn.classList.add("listening");
      voicePanelSub.textContent = t("listening");
      voiceTranscript.style.display = "block";
      transcriptText.innerHTML = `<span class="transcript-interim">…</span>`;
      transcriptActions.style.display = "none";
    };

    recognition.onresult = e => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        e.results[i].isFinal ? (final += txt) : (interim += txt);
      }
      const shown = final || interim;
      transcriptText.innerHTML = final
        ? `<span class="transcript-final">"${shown}"</span>`
        : `<span class="transcript-interim">${shown}</span>`;
      if (final) lastTranscript = final;
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.classList.remove("listening");
      if (lastTranscript) {
        voicePanelSub.textContent = t("processing");
        processTranscript(lastTranscript);
      } else {
        voicePanelSub.textContent = t("voiceSub");
        voiceTranscript.style.display = "none";
      }
    };

    recognition.onerror = e => {
      isListening = false;
      micBtn.classList.remove("listening");
      const msg = e.error === "not-allowed"
        ? "Microphone access denied."
        : e.error === "no-speech"
        ? "No speech detected. Please try again."
        : `Error: ${e.error}`;
      voicePanelSub.textContent = msg;
      voiceTranscript.style.display = "none";
    };
  }

  function startListening() {
    if (!recognition) return;
    lastTranscript = "";
    recognition.lang = currentLang;
    recognition.start();
  }

  function stopListening() {
    if (recognition && isListening) recognition.stop();
  }

  micBtn?.addEventListener("click", () => {
    if (isListening) stopListening();
    else startListening();
  });

  retryVoiceBtn?.addEventListener("click", () => {
    lastTranscript = "";
    transcriptText.innerHTML = "";
    transcriptActions.style.display = "none";
    voiceTranscript.style.display = "none";
    voicePanelSub.textContent = t("voiceSub");
    startListening();
  });

  function processTranscript(transcript) {
    const detectedCat = detectCategoryFromTranscript(transcript);
    let html = `<span class="transcript-final">"${transcript}"</span>`;
    if (detectedCat) {
      const cat = CATEGORY_WEIGHTS[detectedCat];
      html += `<div class="transcript-suggestion">
        🤖 Detected: <strong>${cat.icon} ${cat.label}</strong>
        <button type="button" class="btn-ghost btn-sm voice-cat-accept" data-cat="${detectedCat}"
          style="text-decoration:underline;padding:0 .3rem;font-size:inherit;">Use this</button>
      </div>`;
    }
    transcriptText.innerHTML = html;
    transcriptActions.style.display = "flex";
    voicePanelSub.textContent = t("voiceSub");
    if (detectedCat) selectCategory(detectedCat);
    transcriptText.querySelector(".voice-cat-accept")?.addEventListener("click", e => {
      selectCategory(e.target.dataset.cat);
    });
  }
  applyTranscriptBtn?.addEventListener("click", () => {
    const descInput = document.getElementById("descInput");
    if (descInput && lastTranscript) {
      descInput.value = lastTranscript;
    }
    const locStatus = document.getElementById("locStatus");
    if (locStatus && !locStatus.classList.contains("ok")) {
      document.getElementById("locateBtn")?.click();
    }
    showToast("Voice report applied ✓ — review and submit.");
    transcriptActions.style.display = "none";
  });
  const aiHint = document.getElementById("aiHint");
  function simulateAiSuggestion(fileCount) {
    if (!aiHint || fileCount === 0) return;
    aiHint.textContent = "Analyzing photo…";
    aiHint.classList.add("show");
    setTimeout(() => {
      const guess = ["pothole", "manhole", "garbage", "streetlight"][Math.floor(Math.random() * 4)];
      aiHint.innerHTML = `AI suggests: <b>${CATEGORY_WEIGHTS[guess].label}</b> — <button type="button" id="acceptAiGuess" class="btn-ghost" style="text-decoration:underline;padding:0;font-size:inherit;">use this</button>`;
      document.getElementById("acceptAiGuess")?.addEventListener("click", () => {
        selectCategory(guess);
      });
    }, 900);
  }
  const dropzone    = document.getElementById("dropzone");
  const fileInput   = document.getElementById("photoInput");
  const previewGrid = document.getElementById("previewGrid");
  let files = [];
  function renderPreviews() {
    previewGrid.innerHTML = "";
    files.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const div = document.createElement("div");
      div.className = "preview-thumb";
      div.innerHTML = `<img src="${url}" alt="Photo ${i+1}" /><button type="button" aria-label="Remove" data-i="${i}">✕</button>`;
      previewGrid.appendChild(div);
    });
  }
  function addFiles(list) {
    files = files.concat(Array.from(list).filter(f => f.type.startsWith("image/"))).slice(0, 6);
    renderPreviews();
    simulateAiSuggestion(files.length);
  }
  fileInput?.addEventListener("change", e => addFiles(e.target.files));
  previewGrid?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-i]");
    if (btn) { files.splice(Number(btn.dataset.i), 1); renderPreviews(); }
  });
  ["dragenter","dragover"].forEach(ev => dropzone?.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
  ["dragleave","drop"].forEach(ev => dropzone?.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
  dropzone?.addEventListener("drop", e => addFiles(e.dataTransfer.files));
  const locBtn    = document.getElementById("locateBtn");
  const locStatus = document.getElementById("locStatus");
  const mapWrap   = document.getElementById("reportMapWrap");
  let locCoords = null, reportMap = null, reportMarker = null;

  function initReportMap(lat, lng) {
    mapWrap.style.display = "block";
    if (!reportMap) {
      reportMap = L.map("reportMap", { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(reportMap);
      reportMap.on("click", e => {
        locCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
        reportMarker?.setLatLng(e.latlng);
        locStatus.classList.add("ok");
        locStatus.innerHTML = `<span class="pulse"></span> Pinned: ${locCoords.lat.toFixed(4)}, ${locCoords.lng.toFixed(4)}`;
      });
    } else {
      reportMap.setView([lat, lng], 15);
    }
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;background:var(--gold);border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.5);"></div>`,
      iconSize: [16,16], iconAnchor: [8,8],
    });
    if (reportMarker) reportMarker.setLatLng([lat, lng]);
    else reportMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(reportMap);
    reportMarker.on("dragend", e => {
      const p = e.target.getLatLng();
      locCoords = { lat: p.lat, lng: p.lng };
      locStatus.innerHTML = `<span class="pulse"></span> Pinned: ${locCoords.lat.toFixed(4)}, ${locCoords.lng.toFixed(4)}`;
    });
    setTimeout(() => reportMap.invalidateSize(), 100);
  }

  locBtn?.addEventListener("click", () => {
    if (!navigator.geolocation) { locStatus.textContent = "Geolocation unavailable."; return; }
    locStatus.innerHTML = `<span class="pulse"></span> Locating…`;
    navigator.geolocation.getCurrentPosition(
      pos => {
        locCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        locStatus.classList.add("ok");
        locStatus.innerHTML = `<span class="pulse"></span> Pinned: ${locCoords.lat.toFixed(4)}, ${locCoords.lng.toFixed(4)}`;
        initReportMap(locCoords.lat, locCoords.lng);
        renderLocationIntelPanel(locCoords.lat, locCoords.lng);
      },
      () => {
        locStatus.classList.remove("ok");
        locStatus.textContent = "Couldn't get location — using area centre.";
        initReportMap(12.9716, 77.5946);
        renderLocationIntelPanel(12.9716, 77.5946);
      }
    );
  });

  function buildLocIntelPanel() {
    let panel = document.getElementById("locIntelPanel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "locIntelPanel";
    panel.style.cssText = `
      margin-top:.85rem; border-radius:10px; overflow:hidden;
      border:1px solid rgba(198,161,91,0.22);
      background:rgba(17,24,32,0.95);
      font-size:.82rem; line-height:1.6;
    `;
    // insert after loc-row field
    const locField = document.getElementById("locStatus")?.closest(".field");
    if (locField) locField.appendChild(panel);
    return panel;
  }

  function renderLocationIntelPanel(lat, lng) {
    const impact = getLocationImpact(lat, lng, selectedCategory || "other", 0, 2000);
    const panel  = buildLocIntelPanel();

    if (impact.nearbyCount === 0) {
      panel.innerHTML = `<div style="padding:.75rem 1rem;color:var(--text-low);">📍 No major public locations detected within 2km.</div>`;
      return;
    }

    const SEV_COLORS = { critical:"#c1553d", high:"#c68a3d", medium:"#c6b23d", low:"#4f9e6e" };
    const color = SEV_COLORS[impact.boostedSeverity.tier] || SEV_COLORS.medium;
    const isHigh = impact.isHighImpact;

    const headerBg = isHigh
      ? `rgba(193,85,61,0.13)`
      : `rgba(198,161,91,0.08)`;
    const headerBorder = isHigh
      ? `border-bottom:1px solid rgba(193,85,61,0.3)`
      : `border-bottom:1px solid rgba(198,161,91,0.14)`;

    const headerIcon  = isHigh ? "🚨" : "🏛️";
    const headerTitle = isHigh ? "High-impact location detected" : "Critical locations nearby";

    const locationRows = impact.locations.map(loc => {
      const locColor = SEV_COLORS[LOCATION_TYPE_PRIORITY[loc.type]?.boost >= 1.8 ? "critical"
                     : LOCATION_TYPE_PRIORITY[loc.type]?.boost >= 1.4 ? "high" : "medium"];
      return `
        <div style="display:flex;align-items:center;gap:.65rem;padding:.55rem 1rem;border-bottom:1px solid rgba(255,255,255,0.04);">
          <span style="font-size:1.15rem;flex:none;">${loc.icon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;color:var(--text-hi);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${loc.name}</div>
            <div style="font-size:.72rem;color:var(--text-low);">${LOCATION_TYPE_PRIORITY[loc.type]?.label ?? loc.type}</div>
          </div>
          <span style="flex:none;font-family:var(--font-mono);font-size:.72rem;color:${locColor};background:${locColor}18;padding:.15rem .45rem;border-radius:999px;border:1px solid ${locColor}40;">${loc.distM}m</span>
        </div>`;
    }).join("");

    const boostNote = impact.boostedSeverity.tier !== computeSeverity(selectedCategory || "other", 0).tier
      ? `<div style="padding:.55rem 1rem;font-size:.75rem;color:${color};background:${color}10;border-top:1px solid ${color}30;">
           ⬆ Severity boosted to <strong>${impact.boostedSeverity.label}</strong> due to proximity to critical locations
         </div>`
      : "";

    panel.innerHTML = `
      <div style="padding:.7rem 1rem;background:${headerBg};${headerBorder};display:flex;align-items:center;gap:.5rem;">
        <span style="font-size:1rem;">${headerIcon}</span>
        <strong style="color:${isHigh ? color : "var(--text-hi)"};">${headerTitle}</strong>
        <span style="margin-left:auto;font-family:var(--font-mono);font-size:.7rem;color:var(--text-low);">${impact.nearbyCount} location${impact.nearbyCount>1?"s":""}</span>
      </div>
      ${locationRows}
      ${boostNote}
    `;

    // Add emoji markers to the report map
    if (reportMap) {
      impact.locations.forEach(loc => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="font-size:1.25rem;line-height:1;filter:drop-shadow(0 1px 4px rgba(0,0,0,.7))" title="${loc.name}">${loc.icon}</div>`,
          iconSize: [24,24], iconAnchor: [12,12],
        });
        L.marker([loc.lat, loc.lng], { icon }).addTo(reportMap)
          .bindPopup(`<b>${loc.icon} ${loc.name}</b><br/><span style="color:var(--text-low)">${LOCATION_TYPE_PRIORITY[loc.type]?.label}</span><br/>${loc.distM}m away`);
      });
    }
  }
  categoryGrid?.addEventListener("click", () => {
    if (locCoords) renderLocationIntelPanel(locCoords.lat, locCoords.lng);
  });
  function getOrCreateOfflineBanner() {
    let banner = document.getElementById("offlineSyncBanner");
    if (banner) return banner;
    banner = document.createElement("div");
    banner.id = "offlineSyncBanner";
    banner.style.cssText = `
      display:none; position:fixed; bottom:80px; left:50%;
      transform:translateX(-50%);
      background:var(--bg-panel-raised); border:1px solid var(--border-strong);
      border-radius:8px; padding:.65rem 1.1rem;
      font-size:.8rem; color:var(--text-mid);
      z-index:150; white-space:nowrap;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
    `;
    document.body.appendChild(banner);
    return banner;
  }
  function showOfflineBanner(msg, color) {
    const b = getOrCreateOfflineBanner();
    b.style.display = "block";
    b.style.borderColor = (color || "var(--gold)") + "60";
    b.innerHTML = msg;
  }
  function hideOfflineBanner() {
    const b = document.getElementById("offlineSyncBanner");
    if (b) b.style.display = "none";
  }
  function refreshOfflineBadge() {
    const q = offlineQueueGet();
    if (q.length === 0) { hideOfflineBanner(); return; }
    showOfflineBanner(
      `📶 ${q.length} report${q.length>1?"s":""} saved offline — waiting for connection`,
      "#c6b23d"
    );
  }
  refreshOfflineBadge();
  window.addEventListener("offline", () => {
    showOfflineBanner("📵 You're offline — reports will be saved and synced when you reconnect", "#c68a3d");
  });
  window.addEventListener("online", () => {
    const q = offlineQueueGet();
    if (!q.length) { showOfflineBanner("✅ Back online", "#4f9e6e"); setTimeout(hideOfflineBanner, 2500); return; }
    showOfflineBanner(`🔄 Syncing ${q.length} offline report${q.length>1?"s":""}…`, "#4fa8a0");
  });
  initOfflineSync((done, total, report) => {
    if (done < total) {
      showOfflineBanner(`🔄 Syncing ${done}/${total} — ${report._offlineId}`, "#4fa8a0");
    } else {
      showToast(`✅ ${total} offline report${total>1?"s":""} synced successfully.`);
      hideOfflineBanner();
    }
  });
  const form  = document.getElementById("reportForm");
  const toast = document.getElementById("toast");

  form?.addEventListener("submit", e => {
    e.preventDefault();
    if (!selectedCategory) {
      severityPill.style.borderColor = "var(--sev-critical)";
      categoryGrid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const refId = `SETU-${Math.floor(1000 + Math.random() * 9000)}`;
    const report = {
      id: refId,
      category: selectedCategory,
      severity: manualSeverity !== "auto" ? manualSeverity : effectiveSeverity()?.tier,
      description: document.getElementById("descInput")?.value || "",
      address: document.getElementById("addressInput")?.value || "",
      name: document.getElementById("nameInput")?.value || "",
      phone: document.getElementById("phoneInput")?.value || "",
      coords: locCoords,
      lang: currentLang,
      voiceTranscript: lastTranscript || null,
      reportedAt: new Date().toISOString(),
      status: "open",
      confirmations: 0,
    };

    if (!navigator.onLine) {
      // Save to offline queue
      offlineQueuePush(report);
      showToast(`📵 Saved offline — ${refId}. Will sync when online.`);
      showOfflineBanner(
        `📵 ${offlineQueueGet().length} report${offlineQueueGet().length>1?"s":""} saved offline`,
        "#c68a3d"
      );
    } else {
      showToast(`✅ Reported — thanks. Reference ${refId}`);
    }
    form.reset(); files = []; renderPreviews();
    categoryGrid.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
    sevChips?.querySelectorAll(".sev-chip").forEach(c => c.classList.remove("active"));
    sevChips?.querySelector("[data-sev='auto']")?.classList.add("active");
    selectedCategory = null; manualSeverity = "auto"; lastTranscript = "";
    updateSeverityReadout();
    if (aiHint) aiHint.classList.remove("show");
    locStatus.classList.remove("ok");
    locStatus.innerHTML = `<span class="pulse"></span> Not located yet`;
    if (voiceTranscript) voiceTranscript.style.display = "none";
    if (transcriptActions) transcriptActions.style.display = "none";
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3600);
  }
  const reportGrid = document.getElementById("reportGrid");
  if (reportGrid) {
    const BASE = [12.9716, 77.5946];
    reportGrid.innerHTML = MOCK_REPORTS.filter(r => r.status !== "resolved").slice(0, 6).map((r, i) => {
      const cat     = CATEGORY_WEIGHTS[r.category];
      const sev     = computeSeverity(r.category, r.confirmations);
      const frac    = slaRemainingFraction(r.category, r.reportedAt);
      const hrsLeft = slaHoursLeft(r.category, r.reportedAt);
    
      const lat = BASE[0] + Math.sin(i * 1.3) * 0.04;
      const lng = BASE[1] + Math.cos(i * 1.7) * 0.05;
      const impact = getLocationImpact(lat, lng, r.category, r.confirmations, 2000);
      const dispSev = impact.isHighImpact ? impact.boostedSeverity : sev;
      const SEV_COLORS = { critical:"#c1553d", high:"#c68a3d", medium:"#c6b23d", low:"#4f9e6e" };
      const impactHtml = impact.nearbyCount > 0
        ? `<div style="margin-top:.55rem;padding:.5rem .65rem;border-radius:6px;
              background:${SEV_COLORS[dispSev.tier]}14;border:1px solid ${SEV_COLORS[dispSev.tier]}35;
              font-size:.72rem;line-height:1.55;color:var(--text-mid);">
             ${impact.isHighImpact ? `<span style="color:${SEV_COLORS[dispSev.tier]};font-weight:600;">🚨 High-impact zone</span><br/>` : `<span style="color:var(--text-low);">🏛️ Nearby locations</span><br/>`}
             ${impact.alertLines.slice(0,2).map(l=>`<span style="display:block">${l}</span>`).join("")}
           </div>`
        : "";
      return `
        <article class="panel panel-pad report-card">
          <div class="rc-top">
            <div>
              <span class="sev-pill ${dispSev.tier}"><span class="dot"></span>${dispSev.label}</span>
              <h3 style="margin-top:.6rem;">${cat.icon} ${cat.label}</h3>
              <div class="rc-meta"><span>${r.area}</span></div>
            </div>
            <div class="sla-ring" style="--ring-pct:${frac};--ring-color:${ringColorForFraction(frac)};">
              <span class="sla-label">${hrsLeft > 0 ? `<b>${hrsLeft}h</b>left` : `<b>Overdue</b>`}</span>
            </div>
          </div>
          <div class="rc-conf">✓ ${r.confirmations} citizens confirmed nearby</div>
          ${impactHtml}
        </article>`;
    }).join("");
  }
  if (document.getElementById("nearbyMap")) {
    const nearbyMap = L.map("nearbyMap", { scrollWheelZoom: false }).setView([12.9716, 77.5946], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors", maxZoom: 19,
    }).addTo(nearbyMap);
    const SEV_COLORS = { critical:"#c1553d", high:"#c68a3d", medium:"#c6b23d", low:"#4f9e6e" };
    const BASE = [12.9716, 77.5946];
    MOCK_REPORTS.filter(r => r.status !== "resolved").forEach((r, i) => {
      const sev = computeSeverity(r.category, r.confirmations);
      const lat = BASE[0] + Math.sin(i * 1.3) * 0.04;
      const lng = BASE[1] + Math.cos(i * 1.7) * 0.05;
      const color = SEV_COLORS[sev.tier];
      const impact = getLocationImpact(lat, lng, r.category, r.confirmations, 2000);
      const cat = CATEGORY_WEIGHTS[r.category];
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;background:${color};border:2px solid rgba(255,255,255,.8);border-radius:50%;box-shadow:0 0 8px ${color}80;"></div>`,
        iconSize: [14,14], iconAnchor: [7,7],
      });
      const impactPopup = impact.nearbyCount > 0
        ? `<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:.3rem 0"/>
           <span style="font-size:.75rem"><b>📍 Nearby:</b><br/>${impact.alertLines.slice(0,2).join("<br/>")}</span>`
        : "";
      L.marker([lat,lng], { icon }).addTo(nearbyMap)
        .bindPopup(`<b>${cat.icon} ${cat.label}</b><br/>${r.area}<br/><span style="color:${color}">● ${sev.label}</span><br/>✓ ${r.confirmations} confirmed${impactPopup}`);
    });
    CRITICAL_LOCATIONS.forEach(loc => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="font-size:1rem;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))" title="${loc.name}">${loc.icon}</div>`,
        iconSize: [20,20], iconAnchor: [10,10],
      });
      L.marker([loc.lat, loc.lng], { icon }).addTo(nearbyMap)
        .bindPopup(`<b>${loc.icon} ${loc.name}</b><br/><em style="color:var(--text-low)">${LOCATION_TYPE_PRIORITY[loc.type]?.label ?? loc.type}</em>`);
    });
  }
  document.querySelectorAll("[data-count]").forEach(el => {
    const target = Number(el.dataset.count);
    let cur = 0;
    const step = Math.max(1, Math.round(target / 40));
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      el.textContent = cur.toLocaleString();
      if (cur >= target) clearInterval(t);
    }, 25);
  });
});
