(() => {
  const CONFIG = {
    CONFIG_URL: "./config.json",
    DEFAULT_STUDENT_ID: "1",
    DEFAULT_TIME_LIMIT_SECONDS: 45,
    TIMER_TICK_MS: 250,

    TTS_TEST_TEXT: "Xin chào, mình là người Việt Nam",
    TTS_RATE: 1.0,
    TTS_PITCH: 1.0,
    TTS_VOLUME: 1.0,

    AUDIO_TYPES: [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ],
    AUDIO_EXT: "webm"
  };

  const DEFAULT_LESSON = {
    lesson_name: "Trò chơi: tập phát âm L/N",
    default_time_limit_seconds: CONFIG.DEFAULT_TIME_LIMIT_SECONDS,
    items: [
      {
        id: "lua_nep",
        text: "lúa nếp",
        time_limit_seconds: 45,
        syllables: [
          { text: "lúa", target: "l" },
          { text: "nếp", target: "n" }
        ]
      }
    ]
  };

  const $ = (id) => document.getElementById(id);

  const menu = $("menu");
  const practice = $("practice");
  const done = $("done");

  const lessonNameEl = $("lessonName");
  const studentIdEl = $("studentId");
  const voiceSelect = $("voiceSelect");

  const btnTestVoice = $("btnTestVoice");
  const btnStart = $("btnStart");
  const btnListen = $("btnListen");
  const btnSpeak = $("btnSpeak");
  const btnEnd = $("btnEnd");
  const btnRetry = $("btnRetry");
  const btnNext = $("btnNext");
  const btnExportZip = $("btnExportZip");
  const btnExportJSON = $("btnExportJSON");
  const btnRestart = $("btnRestart");

  const progressText = $("progressText");
  const timerText = $("timerText");
  const attemptText = $("attemptText");
  const promptEl = $("prompt");
  const recordStatus = $("recordStatus");
  const feedback = $("feedback");
  const summary = $("summary");

  let lesson = DEFAULT_LESSON;
  let items = [];
  let index = 0;
  let current = null;

  let studentId = CONFIG.DEFAULT_STUDENT_ID;
  let sessionStartMs = null;
  let sessionStartISO = null;
  let sessionEndISO = null;
  let itemStartMs = null;

  let countdownMs = 0;
  let timer = null;
  let lastTickMs = null;
  let timerPaused = false;

  let logs = [];
  let audioFiles = [];

  let voices = [];
  let selectedVoice = null;

  let recording = false;
  let stream = null;
  let recorder = null;
  let chunks = [];

  const show = (el, yes) => el.classList.toggle("hidden", !yes);
  const nowISO = () => new Date().toISOString();
  const nowMs = () => Date.now();
  const offsetMs = () => Date.now() - sessionStartMs;
  const itemElapsedMs = () => itemStartMs ? Date.now() - itemStartMs : null;
  const secSince = (ms) => Number(((Date.now() - ms) / 1000).toFixed(3));
  const fmtSec = (ms) => `${Math.max(0, Math.ceil(ms / 1000))}s`;

  function safeName(s) {
    return String(s || "item")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "item";
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function logEvent(type, extra = {}) {
    if (!current) return;

    current.event_log.push({
      type,
      timestamp: nowISO(),
      offset_ms: offsetMs(),
      item_elapsed_ms: itemElapsedMs(),
      time_left_ms: Math.max(0, Math.round(countdownMs)),
      ...extra
    });
  }

  async function loadLesson() {
    try {
      const res = await fetch(CONFIG.CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Cannot load config.json");
      lesson = await res.json();
    } catch (e) {
      console.warn("[CONFIG] using fallback lesson:", e);
      lesson = DEFAULT_LESSON;
    }

    items = lesson.items || [];
    lessonNameEl.textContent = lesson.lesson_name || "Assessment phát âm L/N";
  }

  function populateVoices() {
    if (!("speechSynthesis" in window)) {
      voiceSelect.innerHTML = `<option value="">Thiết bị không hỗ trợ TTS</option>`;
      return;
    }

    const all = speechSynthesis.getVoices() || [];
    const vi = all.filter(v => (v.lang || "").toLowerCase().startsWith("vi"));
    const other = all.filter(v => !(v.lang || "").toLowerCase().startsWith("vi"));
    voices = [...vi, ...other];

    voiceSelect.innerHTML = "";

    if (!voices.length) {
      voiceSelect.innerHTML = `<option value="">Đang tải giọng đọc…</option>`;
      return;
    }

    voices.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${v.name} (${v.lang})${v.default ? " — default" : ""}`;
      voiceSelect.appendChild(opt);
    });

    let idx = voices.findIndex(v =>
      (v.lang || "").toLowerCase().startsWith("vi") &&
      /linh|vietnam|google|microsoft/i.test(v.name)
    );

    if (idx < 0) idx = voices.findIndex(v => (v.lang || "").toLowerCase().startsWith("vi"));
    if (idx < 0) idx = 0;

    voiceSelect.value = String(idx);
    selectedVoice = voices[idx];

    console.log("[TTS] selected:", selectedVoice);
  }

  function updateVoice() {
    selectedVoice = voices[Number(voiceSelect.value)] || null;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;

    updateVoice();
    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = selectedVoice?.lang || "vi-VN";
    u.rate = CONFIG.TTS_RATE;
    u.pitch = CONFIG.TTS_PITCH;
    u.volume = CONFIG.TTS_VOLUME;

    if (selectedVoice) u.voice = selectedVoice;

    speechSynthesis.speak(u);
  }

  function currentItem() {
    return items[index] || null;
  }

  function itemLimitMs(item) {
    return Number(
      item?.time_limit_seconds ||
      lesson.default_time_limit_seconds ||
      CONFIG.DEFAULT_TIME_LIMIT_SECONDS
    ) * 1000;
  }

  function renderPrompt(item) {
    const syllables = item.syllables || [];

    if (!syllables.length) {
      promptEl.textContent = item.text;
      return;
    }

    promptEl.innerHTML = syllables
      .map(s => `<span class="syllable">${esc(s.text)}</span>`)
      .join(" ");
  }

  function clearFeedback() {
    feedback.textContent = "";
    show(feedback, false);
  }

  function setFeedback(text, type = "ok") {
    feedback.className = `feedback ${type}`;
    feedback.textContent = text;
    show(feedback, true);
  }

  function newItemState(item) {
    return {
      student_id: studentId,
      lesson_name: lesson.lesson_name || "",
      item_index: index + 1,
      item_id: item.id,
      item_text: item.text,

      time_limit_seconds: itemLimitMs(item) / 1000,

      item_shown_at: nowISO(),
      item_shown_offset_ms: offsetMs(),

      recording_started_at: null,
      recording_stopped_at: null,
      completed_at: null,
      next_clicked_at: null,

      item_time_seconds: null,
      time_left_seconds_at_finish: null,

      recording_count: 0,
      hint_count: 0,

      recordings: [],
      event_log: [],

      final_status: null
    };
  }

  function startCountdown(item) {
    stopCountdown();

    countdownMs = itemLimitMs(item);
    timerText.textContent = fmtSec(countdownMs);

    timerPaused = false;
    lastTickMs = Date.now();

    timer = setInterval(() => {
      if (timerPaused || recording || !current || current.final_status) {
        lastTickMs = Date.now();
        return;
      }

      const t = Date.now();
      countdownMs -= t - lastTickMs;
      lastTickMs = t;

      timerText.textContent = fmtSec(countdownMs);

      if (countdownMs <= 0) handleTimeout();
    }, CONFIG.TIMER_TICK_MS);
  }

  function stopCountdown() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function pauseCountdown() {
    timerPaused = true;
    lastTickMs = null;
  }

  function resumeCountdown() {
    if (!current?.final_status) {
      timerPaused = false;
      lastTickMs = Date.now();
    }
  }

  function showItem() {
    const item = currentItem();

    if (!item) {
      finishAssessment();
      return;
    }

    itemStartMs = Date.now();
    current = newItemState(item);
    current.event_log.push({
      type: "ITEM_SHOWN",
      timestamp: current.item_shown_at,
      offset_ms: current.item_shown_offset_ms
    });

    clearFeedback();
    renderPrompt(item);

    progressText.textContent = `${index + 1}/${items.length}`;
    attemptText.textContent = "Lượt 1";
    timerText.textContent = fmtSec(itemLimitMs(item));

    show(recordStatus, false);
    show(btnRetry, false);
    show(btnNext, false);

    btnSpeak.textContent = "🎤 Nói";
    btnSpeak.disabled = false;

    btnListen.disabled = false;
    btnNext.disabled = false;

    startCountdown(item);
  }

  function finishCurrentItem(status) {
    if (!current || current.final_status) return;

    stopCountdown();

    current.final_status = status;
    current.completed_at = nowISO();
    current.item_time_seconds = secSince(itemStartMs);
    current.time_left_seconds_at_finish = Number(Math.max(0, countdownMs / 1000).toFixed(3));

    logEvent("ITEM_COMPLETED", { final_status: status });

    logs.push({ ...current });
    console.log("[ITEM LOG]", current);
  }

  async function startRecording() {
    if (!current || current.final_status) return;

    chunks = [];
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let mimeType = "";
    for (const t of CONFIG.AUDIO_TYPES) {
      if (MediaRecorder.isTypeSupported(t)) {
        mimeType = t;
        break;
      }
    }

    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = e => e.data?.size && chunks.push(e.data);
    recorder.start();

    recording = true;
    pauseCountdown();

    current.recording_count = 1;
    current.recording_started_at = nowISO();

    logEvent("RECORDING_STARTED", {
      attempt_no: 1,
      mime_type: recorder.mimeType || mimeType || "unknown"
    });

    show(recordStatus, true);
    btnSpeak.textContent = "⏹️ Dừng";
    btnListen.disabled = true;
    btnNext.disabled = true;
  }

  async function stopRecording() {
    if (!recording) return;

    const stoppedAtMs = nowMs();

    const blob = await new Promise(resolve => {
      recorder.onstop = () => resolve(
        new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
      );
      recorder.stop();
    });

    stream?.getTracks().forEach(t => t.stop());

    recording = false;
    show(recordStatus, false);
    btnSpeak.textContent = "🎤 Nói";

    const item = currentItem();
    const filename =
      `audio/${String(index + 1).padStart(2, "0")}_${safeName(item.id || item.text)}.${CONFIG.AUDIO_EXT}`;

    audioFiles.push({
      filename,
      blob,
      item_id: item.id
    });

    current.recording_stopped_at = nowISO();

    const meta = {
      attempt_no: 1,
      filename,
      mime_type: blob.type,
      size_bytes: blob.size,
      recording_stopped_at: current.recording_stopped_at,
      recording_stopped_offset_ms: stoppedAtMs - sessionStartMs
    };

    current.recordings.push(meta);
    logEvent("RECORDING_STOPPED", meta);

    finishCurrentItem("COMPLETED");

    setFeedback("Đã ghi nhận phần đọc. Bấm câu tiếp để chuyển câu.", "ok");

    btnSpeak.disabled = true;
    btnListen.disabled = true;

    show(btnRetry, false);
    show(btnNext, true);

    // Critical fix
    btnNext.disabled = false;
  }

  function handleTimeout() {
    if (!current || current.final_status) return;

    if (recording) {
      stopRecording().catch(console.error);
      return;
    }

    finishCurrentItem("FAIL_BY_TIMEOUT");

    setFeedback("Hết thời gian. Bấm câu tiếp để chuyển câu.", "warn");

    btnSpeak.disabled = true;
    btnListen.disabled = true;

    show(btnRetry, false);
    show(btnNext, true);

    // Critical fix
    btnNext.disabled = false;
  }

  function nextItem() {
    if (current) {
      current.next_clicked_at = nowISO();
      logEvent("NEXT_CLICKED");
    }

    index += 1;
    showItem();
  }

  function finishAssessment() {
    stopCountdown();

    if (recording) {
      stopRecording().catch(console.error);
    }

    sessionEndISO = nowISO();

    show(practice, false);
    show(done, true);

    const completed = logs.filter(x => x.final_status === "COMPLETED").length;
    const timeout = logs.filter(x => x.final_status === "FAIL_BY_TIMEOUT").length;
    const hints = logs.reduce((s, x) => s + x.hint_count, 0);
    const totalTime = sessionStartMs ? Math.round((Date.now() - sessionStartMs) / 1000) : 0;

    summary.innerHTML = `
      <b>Bài:</b> ${esc(lesson.lesson_name || "")}<br>
      <b>Học sinh:</b> ${esc(studentId)}<br>
      <b>Thời gian:</b> ${totalTime}s<br>
      <b>Số câu hoàn thành:</b> ${completed}/${items.length}<br>
      <b>Số câu timeout:</b> ${timeout}<br>
      <b>Số file ghi âm:</b> ${audioFiles.length}<br>
      <b>Số lần nghe mẫu:</b> ${hints}
    `;

    console.log("[ASSESSMENT LOGS]", logs);
  }

  function makeReport() {
    return {
      app_type: "LN_ASSESSMENT_RECORDING_ONLY",
      exported_at: nowISO(),
      student_id: studentId,
      lesson_name: lesson.lesson_name || "",
      session_started_at: sessionStartISO,
      session_ended_at: sessionEndISO,
      config: lesson,
      logs
    };
  }

  function exportJSON() {
    download(
      `ln_assessment_${studentId}_report.json`,
      JSON.stringify(makeReport(), null, 2),
      "application/json"
    );
  }

  async function exportZip() {
    if (!window.JSZip) {
      alert("Không tải được JSZip. Kiểm tra CDN hoặc internet.");
      return;
    }

    const zip = new JSZip();
    zip.file("report.json", JSON.stringify(makeReport(), null, 2));

    for (const f of audioFiles) {
      zip.file(f.filename, f.blob);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `ln_assessment_${studentId}_${safeName(lesson.lesson_name)}.zip`;
    a.click();

    URL.revokeObjectURL(url);
  }

  btnStart.onclick = () => {
    studentId = studentIdEl.value.trim() || CONFIG.DEFAULT_STUDENT_ID;
    updateVoice();

    index = 0;
    logs = [];
    audioFiles = [];

    sessionStartMs = nowMs();
    sessionStartISO = nowISO();
    sessionEndISO = null;

    show(menu, false);
    show(done, false);
    show(practice, true);

    showItem();
  };

  btnTestVoice.onclick = () => speak(CONFIG.TTS_TEST_TEXT);
  voiceSelect.onchange = updateVoice;

  btnListen.onclick = () => {
    const item = currentItem();
    if (!item || !current || btnListen.disabled || recording) return;

    current.hint_count += 1;
    logEvent("HINT_CLICKED", { hint_count: current.hint_count });

    speak(item.text);
  };

  btnSpeak.onclick = async () => {
    try {
      if (!recording) await startRecording();
      else await stopRecording();
    } catch (e) {
      console.error("[RECORDING ERROR]", e);
      alert("Có lỗi khi ghi âm. Mở Console để xem chi tiết.");
    }
  };

  btnRetry.onclick = () => {};
  btnNext.onclick = nextItem;
  btnEnd.onclick = finishAssessment;

  btnExportZip.onclick = exportZip;
  btnExportJSON.onclick = exportJSON;

  btnRestart.onclick = () => {
    show(done, false);
    show(menu, true);
  };

  populateVoices();

  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  loadLesson();

  console.log("[APP] assessment ready");
})();
