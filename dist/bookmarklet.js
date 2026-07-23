(() => {
  // src/guard.js
  var BOOKING_HOME = "https://cgv.co.kr/cnm/movieBook";
  var SEAT_PATH = "/cnm/selectVisitorCnt";
  function checkLocation(loc = location) {
    const onCgv = loc.hostname === "cgv.co.kr" || loc.hostname.endsWith(".cgv.co.kr");
    if (!onCgv) return "other-domain";
    if (!loc.pathname.startsWith(SEAT_PATH)) return "other-page";
    return "seat-page";
  }
  function runGuard(loc = location) {
    const where = checkLocation(loc);
    if (where === "seat-page") return true;
    const msg = where === "other-domain" ? "CGV 예매 페이지로 이동할까요?" : "예매 페이지로 이동합니다.\n영화·극장·회차 선택 후 좌석선택 화면에서 다시 실행하세요.";
    if (confirm(msg)) location.href = BOOKING_HOME;
    return false;
  }

  // src/dom.js
  var POLL_INTERVAL = 5e3;
  var POLL_JITTER = 1e3;
  var SEAT_UNIT = 38;
  var SEL = {
    seatChoiceArea: "[class*=seatChoiceArea]",
    mainMap: ".react-transform-component [class*=seatPositionWrap]",
    anyMap: "[class*=seatPositionWrap]",
    seatBtn: "button[class*=seatNumber]",
    seatSelectWrap: "[class*=seatSelectWrap]",
    refreshBtn: 'button[title="새로고침"]',
    numberWrap: "[class*=NumberWrap]",
    numBtn: "[class*=btn-num]",
    label: "[class*=label]"
  };
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var jitter = () => POLL_INTERVAL + Math.floor(Math.random() * POLL_JITTER * 2) - POLL_JITTER;
  function seatLabel(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".voice-only").forEach((n) => n.remove());
    return clone.textContent.trim();
  }

  // src/visitors.js
  async function selectAdults(n) {
    const wraps = document.querySelectorAll(SEL.numberWrap);
    if (!wraps.length) throw new Error("인원 선택 영역을 찾을 수 없습니다.");
    const normalWrap = [...wraps].find((w) => {
      const l = w.querySelector(SEL.label);
      return l && l.textContent.trim() === "일반";
    }) || wraps[0];
    const btn = [...normalWrap.querySelectorAll(SEL.numBtn)].find((b) => b.textContent.trim() === String(n));
    if (!btn) throw new Error("일반 " + n + "명 버튼을 찾을 수 없습니다.");
    if (btn.getAttribute("aria-pressed") === "true") return;
    btn.click();
    await sleep(600);
  }

  // src/seatmap.js
  function getMainMap() {
    const area = document.querySelector(SEL.seatChoiceArea);
    if (!area) return null;
    return area.querySelector(SEL.mainMap) || area.querySelector(SEL.anyMap);
  }
  function seatButtons() {
    const map = getMainMap();
    if (!map) return [];
    return [...map.querySelectorAll(SEL.seatBtn)].filter((el) => !/zone/i.test(el.className));
  }
  function collectSeats() {
    return seatButtons().map((el) => ({
      label: seatLabel(el),
      col: Math.round((parseFloat(el.style.left) || 0) / SEAT_UNIT),
      row: Math.round((parseFloat(el.style.top) || 0) / SEAT_UNIT),
      sold: el.disabled
    }));
  }
  async function openSeatMap() {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "선택" && b.closest(SEL.seatSelectWrap));
    if (!btn) throw new Error("[선택] 버튼을 찾을 수 없습니다.");
    btn.click();
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      if (seatButtons().length > 0) return;
    }
    throw new Error("좌석맵이 열리지 않았습니다.");
  }
  function findSeatButton(label) {
    return seatButtons().find((el) => seatLabel(el) === label) || null;
  }
  function enabledCandidates(targets) {
    return targets.filter((t) => {
      const el = findSeatButton(t);
      return el && !el.disabled;
    });
  }
  function activeSeats() {
    return seatButtons().filter((el) => el.className.split(/\s+/).some((c) => c.startsWith("seatMap_active")));
  }

  // src/ui/picker.js
  var CHIP = 30;
  var GAP = 2;
  var LABEL_W = 24;
  function showPicker(initialSeats, initialPeople) {
    return new Promise((resolve) => {
      document.getElementById("cgv-sniper-overlay")?.remove();
      let seats = initialSeats;
      let people = initialPeople || 1;
      let selected = [];
      const ov = document.createElement("div");
      ov.id = "cgv-sniper-overlay";
      Object.assign(ov.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.85)",
        zIndex: 999999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "-apple-system,sans-serif",
        color: "#fff",
        overflow: "hidden"
      });
      const hdr = document.createElement("div");
      Object.assign(hdr.style, { textAlign: "center", padding: "16px 16px 4px", flexShrink: "0", width: "100%" });
      hdr.innerHTML = '<h2 style="margin:0 0 4px;font-size:17px;color:#e94560">좌석 스나이퍼</h2><p style="margin:0;font-size:12px;color:#888">잡고 싶은 좌석을 우선순위 순으로 터치하세요</p>';
      ov.appendChild(hdr);
      const peopleWrap = document.createElement("div");
      Object.assign(peopleWrap.style, { display: "flex", gap: "8px", justifyContent: "center", padding: "4px 0 8px", flexShrink: "0" });
      const peopleBtns = [1, 2].map((n) => {
        const b = document.createElement("button");
        b.textContent = n + "명";
        Object.assign(b.style, {
          padding: "6px 18px",
          borderRadius: "16px",
          border: "1px solid #e94560",
          background: "transparent",
          color: "#e94560",
          fontSize: "13px",
          cursor: "pointer"
        });
        b.addEventListener("click", () => setPeople(n));
        peopleWrap.appendChild(b);
        return b;
      });
      ov.appendChild(peopleWrap);
      const status = document.createElement("div");
      Object.assign(status.style, {
        padding: "6px 16px",
        margin: "0 16px 8px",
        background: "#16213e",
        borderRadius: "8px",
        fontSize: "13px",
        color: "#e94560",
        textAlign: "center",
        minHeight: "18px",
        wordBreak: "break-all",
        flexShrink: "0"
      });
      ov.appendChild(status);
      const mapWrap = document.createElement("div");
      Object.assign(mapWrap.style, {
        flex: "1",
        overflow: "auto",
        padding: "8px",
        WebkitOverflowScrolling: "touch",
        width: "100%"
      });
      ov.appendChild(mapWrap);
      const legend = document.createElement("div");
      Object.assign(legend.style, { display: "flex", gap: "16px", justifyContent: "center", padding: "8px", fontSize: "11px", color: "#888", flexShrink: "0" });
      legend.innerHTML = '<span><span style="display:inline-block;width:10px;height:10px;background:#4a1a1a;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택불가(매진 포함)</span><span><span style="display:inline-block;width:10px;height:10px;background:#1a3a5c;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택가능</span><span><span style="display:inline-block;width:10px;height:10px;background:#e94560;border-radius:2px;vertical-align:middle;margin-right:3px"></span>내 후보</span>';
      ov.appendChild(legend);
      const bw = document.createElement("div");
      Object.assign(bw.style, { display: "flex", gap: "10px", padding: "12px 16px 20px", width: "100%", maxWidth: "460px", flexShrink: "0" });
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "취소";
      Object.assign(cancelBtn.style, {
        flex: "1",
        padding: "14px",
        border: "1px solid #444",
        borderRadius: "10px",
        background: "transparent",
        color: "#aaa",
        fontSize: "15px",
        cursor: "pointer"
      });
      cancelBtn.addEventListener("click", () => {
        ov.remove();
        resolve(null);
      });
      const confirmBtn = document.createElement("button");
      Object.assign(confirmBtn.style, {
        flex: "2",
        padding: "14px",
        border: "none",
        borderRadius: "10px",
        background: "#e94560",
        color: "#fff",
        fontSize: "15px",
        fontWeight: "bold",
        cursor: "pointer",
        transition: "opacity 0.15s"
      });
      confirmBtn.addEventListener("click", () => {
        if (confirmBtn.disabled) return;
        ov.remove();
        resolve({ targets: [...selected], people });
      });
      bw.appendChild(cancelBtn);
      bw.appendChild(confirmBtn);
      ov.appendChild(bw);
      function updateStatus() {
        status.textContent = selected.length ? selected.map((t, i) => i + 1 + "." + t).join("  ") : people === 2 ? "후보를 2개 이상 선택하세요 (빈 2석 확보 시 점유, 인접 보장 없음)" : "선택된 좌석 없음";
        const ok = selected.length >= people;
        confirmBtn.disabled = !ok;
        confirmBtn.style.opacity = ok ? "1" : "0.4";
        confirmBtn.textContent = "감시 시작 (" + people + "명)";
        peopleBtns.forEach((b, i) => {
          const on = i + 1 === people;
          b.style.background = on ? "#e94560" : "transparent";
          b.style.color = on ? "#fff" : "#e94560";
        });
      }
      function renderGrid() {
        mapWrap.textContent = "";
        const screen = document.createElement("div");
        Object.assign(screen.style, { textAlign: "center", color: "#555", fontSize: "11px", marginBottom: "8px", letterSpacing: "4px" });
        screen.textContent = "SCREEN";
        mapWrap.appendChild(screen);
        if (!seats.length) {
          const empty = document.createElement("p");
          empty.textContent = "좌석을 찾을 수 없습니다.";
          empty.style.textAlign = "center";
          mapWrap.appendChild(empty);
          return;
        }
        const maxCol = Math.max(...seats.map((s) => s.col));
        const maxRow = Math.max(...seats.map((s) => s.row));
        const rowLabelMap = {};
        seats.forEach((s) => {
          rowLabelMap[s.row] = s.label.replace(/[0-9]/g, "");
        });
        const grid = document.createElement("div");
        Object.assign(grid.style, {
          display: "grid",
          gridTemplateColumns: LABEL_W + "px repeat(" + (maxCol + 1) + ", " + CHIP + "px) " + LABEL_W + "px",
          gridTemplateRows: "repeat(" + (maxRow + 1) + ", " + CHIP + "px)",
          gap: GAP + "px",
          width: "fit-content",
          margin: "0 auto"
        });
        Object.entries(rowLabelMap).forEach(([row, label]) => {
          [1, maxCol + 3].forEach((col) => {
            const lbl = document.createElement("div");
            lbl.textContent = label;
            Object.assign(lbl.style, {
              gridColumn: col,
              gridRow: parseInt(row, 10) + 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              color: "#666",
              fontWeight: "bold"
            });
            grid.appendChild(lbl);
          });
        });
        const chipMap = {};
        seats.forEach((s) => {
          const chip = document.createElement("button");
          const paintBase = () => {
            chip.style.background = s.sold ? "#4a1a1a" : "#1a3a5c";
            chip.style.color = s.sold ? "#ff6b6b" : "#7bb8e0";
            chip.textContent = s.label;
          };
          Object.assign(chip.style, {
            gridColumn: s.col + 2,
            /* +2: 라벨열 1칸 오프셋 */
            gridRow: s.row + 1,
            width: CHIP + "px",
            height: CHIP + "px",
            border: "none",
            borderRadius: "4px",
            fontSize: "8px",
            cursor: "pointer",
            padding: "0",
            lineHeight: CHIP + "px",
            textAlign: "center",
            transition: "background 0.1s"
          });
          paintBase();
          chip.addEventListener("click", () => {
            const idx = selected.indexOf(s.label);
            if (idx >= 0) {
              selected.splice(idx, 1);
              paintBase();
              selected.forEach((t, i) => {
                const c = chipMap[t];
                if (c) c.textContent = "[" + (i + 1) + "]";
              });
            } else {
              selected.push(s.label);
              chip.style.background = "#e94560";
              chip.style.color = "#fff";
              chip.textContent = "[" + selected.length + "]";
            }
            updateStatus();
          });
          chipMap[s.label] = chip;
          grid.appendChild(chip);
        });
        mapWrap.appendChild(grid);
      }
      async function setPeople(n) {
        if (n === people) {
          updateStatus();
          return;
        }
        people = n;
        selected = [];
        status.textContent = "인원 변경 중...";
        let err = null;
        try {
          await selectAdults(n);
          await sleep(800);
          seats = collectSeats();
        } catch (e) {
          err = e;
        }
        renderGrid();
        updateStatus();
        if (err) status.textContent = "인원 변경 실패: " + err.message;
      }
      renderGrid();
      updateStatus();
      document.body.appendChild(ov);
    });
  }

  // src/claim.js
  function findEnabledButtonByText(text) {
    return [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text && !b.disabled) || null;
  }
  async function deselectAll() {
    for (let i = 0; i < 6 && activeSeats().length; i++) {
      activeSeats()[0].click();
      await sleep(200);
    }
  }
  async function adjustSelection(targets) {
    for (let i = 0; i < 8; i++) {
      const labels = activeSeats().map(seatLabel);
      const extra = labels.find((l) => !targets.includes(l));
      const missing = targets.find((t) => !labels.includes(t));
      if (!extra && !missing) return true;
      const label = extra || missing;
      const el = findSeatButton(label);
      if (!el) return false;
      if (label === missing && el.disabled) return false;
      el.click();
      await sleep(300);
    }
    return false;
  }
  async function tryClaim(picks, people, candidates = picks) {
    const selectionOk = () => {
      const labels = activeSeats().map(seatLabel);
      return labels.length === people && labels.every((l) => candidates.includes(l));
    };
    try {
      await selectAdults(people);
      await sleep(300);
      for (const t of picks) {
        if (selectionOk()) break;
        const el = findSeatButton(t);
        if (!el || el.disabled) {
          await deselectAll();
          return null;
        }
        el.click();
        await sleep(300);
      }
      if (!selectionOk() && !await adjustSelection(picks)) {
        await deselectAll();
        return null;
      }
      let done = null;
      for (let i = 0; i < 10; i++) {
        await sleep(200);
        done = findEnabledButtonByText("선택완료");
        if (done) break;
      }
      if (!done) {
        await deselectAll();
        return null;
      }
      const claimed = activeSeats().map(seatLabel);
      done.click();
      for (let i = 0; i < 15; i++) {
        await sleep(200);
        const pay = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("결제"));
        if (pay) return claimed;
      }
      await deselectAll();
      return null;
    } catch (e) {
      await deselectAll();
      return null;
    }
  }

  // src/config.js
  var KEY = "cgvSniper.config";
  function loadConfig(storage = globalThis.localStorage) {
    try {
      return JSON.parse(storage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveConfig(cfg, storage = globalThis.localStorage) {
    storage.setItem(KEY, JSON.stringify(cfg || {}));
  }

  // src/notify.js
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.2, 0.4].forEach((d) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.3;
        o.start(ctx.currentTime + d);
        o.stop(ctx.currentTime + d + 0.15);
      });
    } catch (e) {
    }
  }
  function vibrate() {
    try {
      navigator.vibrate([300, 100, 300, 100, 300]);
    } catch (e) {
    }
  }
  function showNoti(msg, bg) {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      padding: "32px 40px",
      borderRadius: "20px",
      background: bg,
      color: "#fff",
      fontSize: "22px",
      fontWeight: "bold",
      zIndex: 1e6,
      boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      textAlign: "center",
      maxWidth: "85%",
      lineHeight: "1.5",
      whiteSpace: "pre-line"
    });
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1e4);
  }
  function getShowInfo() {
    const h = [...document.querySelectorAll("h1,h2,h3")].map((e) => e.textContent.trim()).find((t) => t && t.length < 60 && !/CGV|CJ|QR|관람인원|screen|범례|확인해/i.test(t));
    return h || "";
  }
  async function sendTelegram(text, cfg = loadConfig(), fetchFn = globalThis.fetch) {
    const token = cfg.telegramBotToken;
    const chat = cfg.telegramChatId;
    if (!token || !chat) return { skipped: true };
    try {
      const res = await fetchFn("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text })
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  async function notifySuccess(seats) {
    beep();
    vibrate();
    showNoti("좌석 " + seats.join(", ") + " 점유 성공!\n결제를 진행하세요!", "#27ae60");
    await sendTelegram([
      "🎬 CGV 좌석 점유 성공!",
      getShowInfo(),
      "좌석: " + seats.join(", "),
      (/* @__PURE__ */ new Date()).toLocaleString("ko-KR")
    ].filter(Boolean).join("\n"));
  }
  async function notifyAbort(reason) {
    showNoti("감시 중단: " + reason, "#f39c12");
    await sendTelegram("⚠️ CGV 좌석 감시 중단: " + reason);
  }

  // src/ui/panel.js
  function createPanel(targets, people, { onStop, onSettings }) {
    document.getElementById("cgv-sniper-panel")?.remove();
    const panel = document.createElement("div");
    panel.id = "cgv-sniper-panel";
    Object.assign(panel.style, {
      position: "fixed",
      bottom: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "12px 20px",
      borderRadius: "14px",
      background: "rgba(26,26,46,0.95)",
      border: "1px solid #333",
      color: "#fff",
      fontSize: "13px",
      zIndex: 999998,
      boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      textAlign: "center",
      maxWidth: "90%",
      backdropFilter: "blur(8px)"
    });
    const tgt = document.createElement("div");
    Object.assign(tgt.style, { marginBottom: "6px", color: "#e94560", fontWeight: "bold" });
    tgt.textContent = "[" + people + "명] " + targets.join(", ");
    panel.appendChild(tgt);
    const st = document.createElement("div");
    st.style.marginBottom = "8px";
    st.textContent = "감시 준비 중...";
    panel.appendChild(st);
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "8px", justifyContent: "center" });
    const stopBtn = document.createElement("button");
    stopBtn.textContent = "중지";
    Object.assign(stopBtn.style, {
      padding: "8px 24px",
      border: "1px solid #e94560",
      borderRadius: "8px",
      background: "transparent",
      color: "#e94560",
      fontSize: "13px",
      cursor: "pointer"
    });
    stopBtn.addEventListener("click", onStop);
    row.appendChild(stopBtn);
    const setBtn = document.createElement("button");
    setBtn.textContent = "⚙️ 알림설정";
    Object.assign(setBtn.style, {
      padding: "8px 14px",
      border: "1px solid #555",
      borderRadius: "8px",
      background: "transparent",
      color: "#aaa",
      fontSize: "13px",
      cursor: "pointer"
    });
    setBtn.addEventListener("click", onSettings);
    row.appendChild(setBtn);
    panel.appendChild(row);
    document.body.appendChild(panel);
    return {
      setStatus: (t) => {
        st.textContent = t;
      },
      remove: () => panel.remove()
    };
  }

  // src/ui/settings.js
  function showSettings() {
    document.getElementById("cgv-sniper-settings")?.remove();
    const cfg = loadConfig();
    const wrap = document.createElement("div");
    wrap.id = "cgv-sniper-settings";
    Object.assign(wrap.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.7)",
      zIndex: 1000001,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system,sans-serif"
    });
    const box = document.createElement("div");
    Object.assign(box.style, {
      background: "#1a1a2e",
      border: "1px solid #333",
      borderRadius: "14px",
      padding: "20px",
      width: "320px",
      maxWidth: "90%",
      color: "#fff"
    });
    const title = document.createElement("h3");
    Object.assign(title.style, { margin: "0 0 12px", fontSize: "15px", color: "#e94560" });
    title.textContent = "Telegram 알림 설정";
    box.appendChild(title);
    const mkInput = (ph, val) => {
      const i = document.createElement("input");
      i.placeholder = ph;
      i.value = val || "";
      Object.assign(i.style, {
        width: "100%",
        boxSizing: "border-box",
        margin: "0 0 8px",
        padding: "10px",
        borderRadius: "8px",
        border: "1px solid #444",
        background: "#16213e",
        color: "#fff",
        fontSize: "13px"
      });
      return i;
    };
    const tokenIn = mkInput("Bot Token (예: 123456:ABC-DEF...)", cfg.telegramBotToken);
    const chatIn = mkInput("Chat ID (예: 123456789)", cfg.telegramChatId);
    box.appendChild(tokenIn);
    box.appendChild(chatIn);
    const result = document.createElement("div");
    Object.assign(result.style, { fontSize: "12px", minHeight: "16px", margin: "0 0 10px", color: "#888" });
    box.appendChild(result);
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "8px" });
    const mkBtn = (label, primary) => {
      const b = document.createElement("button");
      b.textContent = label;
      Object.assign(b.style, {
        flex: "1",
        padding: "10px",
        borderRadius: "8px",
        fontSize: "13px",
        cursor: "pointer",
        border: primary ? "none" : "1px solid #444",
        background: primary ? "#e94560" : "transparent",
        color: primary ? "#fff" : "#aaa"
      });
      return b;
    };
    const testBtn = mkBtn("테스트 전송", false);
    const saveBtn = mkBtn("저장", true);
    const closeBtn = mkBtn("닫기", false);
    const current = () => ({
      telegramBotToken: tokenIn.value.trim(),
      telegramChatId: chatIn.value.trim()
    });
    testBtn.addEventListener("click", async () => {
      result.textContent = "전송 중...";
      const r = await sendTelegram("CGV 좌석 스나이퍼 테스트 메시지입니다.", current());
      result.textContent = r.skipped ? "token/chat_id를 입력하세요." : r.ok ? "전송 성공! Telegram을 확인하세요." : "전송 실패: " + (r.error || "API 오류");
    });
    saveBtn.addEventListener("click", () => {
      saveConfig(current());
      result.textContent = "저장되었습니다.";
    });
    closeBtn.addEventListener("click", () => wrap.remove());
    row.appendChild(testBtn);
    row.appendChild(saveBtn);
    row.appendChild(closeBtn);
    box.appendChild(row);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  }

  // src/monitor.js
  async function startMonitoring(targets, people) {
    let running = true;
    let count = 0;
    let panel = null;
    const stop = () => {
      running = false;
      panel?.remove();
      window.__cgvSniper = null;
    };
    window.__cgvSniper = { stop };
    panel = createPanel(targets, people, {
      onStop: () => {
        stop();
        showNoti("감시가 중지되었습니다.", "#f39c12");
      },
      onSettings: showSettings
    });
    while (running) {
      count++;
      panel.setStatus("감시 중... (" + count + "회 새로고침)");
      const refresh = document.querySelector(SEL.refreshBtn);
      if (!refresh) {
        stop();
        await notifyAbort("새로고침 버튼을 찾을 수 없습니다.");
        break;
      }
      refresh.click();
      await sleep(1500);
      try {
        await selectAdults(people);
      } catch (e) {
        stop();
        await notifyAbort(e.message);
        break;
      }
      await sleep(500);
      const avail = enabledCandidates(targets);
      if (avail.length >= people) {
        const picks = avail.slice(0, people);
        panel.setStatus(picks.join(", ") + " 발견! 점유 시도...");
        const claimed = await tryClaim(picks, people, targets);
        if (claimed) {
          stop();
          await notifySuccess(claimed);
          break;
        }
        panel.setStatus("점유 실패, 계속 감시...");
      }
      await sleep(jitter());
    }
  }

  // src/index.js
  (async () => {
    try {
      if (!runGuard()) return;
      window.__cgvSniper?.stop();
      await selectAdults(1);
      await openSeatMap();
      const seats = collectSeats();
      if (!seats.length) {
        alert("좌석을 찾을 수 없습니다.");
        return;
      }
      const picked = await showPicker(seats, 1);
      if (!picked || !picked.targets.length) return;
      await startMonitoring(picked.targets, picked.people);
    } catch (e) {
      alert("오류: " + e.message);
    }
  })();
})();
