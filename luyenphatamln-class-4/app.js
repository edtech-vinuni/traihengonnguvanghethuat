import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";

(() => {
  const CONFIG = {
    CONFIG_URL: "./config.json",

    DEFAULT_MODEL_ID: "ivanthepevt/PhoWhisper-tiny-for-L-N",
    MODEL_TINY_LN: "ivanthepevt/PhoWhisper-tiny-for-L-N",
    MODEL_BASE: "huuquyet/PhoWhisper-base",

    DEFAULT_TIME_LIMIT_SECONDS: 45,
    DEFAULT_LISTEN_ENABLE_ATTEMPT: 2,
    MAX_ATTEMPTS: 3,
    TARGET_SAMPLE_RATE: 16000,

    TTS_TEST_TEXT: "Xin chào, mình là người Việt Nam",
    TTS_RATE: 1.0,
    TTS_PITCH: 1.0,
    TTS_VOLUME: 1.0,

    SFX_VOLUME: 0.5,
    SFX_OK_URL: "https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg",
    SFX_BAD_URL: "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg",

    ORT_WASM_PATH: "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/",
    ORT_WASM_FILE: "ort-wasm-simd.wasm",
    ORT_NUM_THREADS: 1,

    PAINT_SETTLE_MS: 0,
    TIMER_TICK_MS: 250,

    TIMER_WARN_RATIO: 0.5,
    TIMER_DANGER_RATIO: 0.25
  };

  const DEFAULT_LESSON = {
    lesson_name: "Bài luyện L/N",
    praises: ["Tốt lắm, con đọc đúng rồi!"],
    default_bad: "Chưa đúng rồi, con thử đọc lại nhé.",
    items: [
      {
        id: "lua_nep",
        text: "lúa nếp",
        time_limit_seconds: 45,
        listen_enable_attempt: 2,
        syllables: [
          { text: "lúa", target: "l", bad: "Tiếng thứ nhất là âm L.", image: "l.png" },
          { text: "nếp", target: "n", bad: "Tiếng thứ hai là âm N.", image: "n.png" }
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

  const modelSelect = $("modelSelect");
  const btnLoadModel = $("btnLoadModel");
  const modelStatus = $("modelStatus");

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
  const timerRing = $("timerRing");
  const timerText = $("timerText");
  const attemptText = $("attemptText");
  const promptEl = $("prompt");
  const statusEl = $("status");
  const feedback = $("feedback");
  const imageBox = $("imageBox");
  const summary = $("summary");

  let lesson = DEFAULT_LESSON;
  let items = [];
  let index = 0;
  let current = null;

  let studentId = "S001";
  let sessionStartedAt = null;
  let itemStartedAt = null;

  let countdownTotalMs = 0;
  let countdownLeftMs = 0;
  let timerInterval = null;
  let lastTimerTickMs = null;
  let timerPaused = false;

  let logs = [];
  let audioBlobs = new Map();

  let transcriber = null;
  let loadedModelId = null;

  let voices = [];
  let selectedVoice = null;

  let recording = false;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let recordingStartedAt = null;

  let isJudging = false;

  const sfxOk = new Audio(CONFIG.SFX_OK_URL);
  const sfxBad = new Audio(CONFIG.SFX_BAD_URL);
  sfxOk.preload = "auto";
  sfxBad.preload = "auto";
  sfxOk.volume = CONFIG.SFX_VOLUME;
  sfxBad.volume = CONFIG.SFX_VOLUME;

  const setVisible = (node, yes) => node.classList.toggle("hidden", !yes);
  const nextPaint = () => new Promise(requestAnimationFrame);

  function nowISO() {
    return new Date().toISOString();
  }

  function secondsSince(ts) {
    return Number(((Date.now() - ts) / 1000).toFixed(3));
  }

  function pickRandom(arr, fallback = "") {
    return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : fallback;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeVi(s, keepSpaces = false) {
    if (!s) return "";
    let x = s.toLowerCase().trim();
    x = x.replace(/[.,!?;:"'“”‘’()\[\]{}<>]/g, " ");
    x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    x = x.replace(/đ/g, "d");
    x = x.replace(/\s+/g, " ").trim();
    return keepSpaces ? x : x.replace(/\s/g, "");
  }

  function wordsNorm(s) {
    return normalizeVi(s, true).split(/\s+/g).filter(Boolean);
  }

  function firstLN(word) {
    const ch = (word || "")[0];
    return ch === "l" || ch === "n" ? ch : null;
  }

  function safeName(s) {
    return normalizeVi(String(s || "item"), true)
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "item";
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function makeAudioPath(item, attemptNo) {
    const folder = `${pad2(index + 1)}_${safeName(item.id || item.text)}`;
    return `audio/${folder}/attempt_${attemptNo}.webm`;
  }

  function formatSeconds(ms) {
    return `${Math.max(0, Math.ceil(ms / 1000))}s`;
  }

  function updateCountdownUI() {
    const safeTotal = Math.max(1, countdownTotalMs);
    const ratio = Math.max(0, Math.min(1, countdownLeftMs / safeTotal));
    const percent = ratio * 100;

    timerText.textContent = formatSeconds(countdownLeftMs);
    timerRing.style.setProperty("--p", `${percent}%`);

    timerRing.classList.remove("warn", "danger", "paused");

    if (timerPaused || isJudging) {
      timerRing.classList.add("paused");
      return;
    }

    if (ratio <= CONFIG.TIMER_DANGER_RATIO) {
      timerRing.classList.add("danger");
    } else if (ratio <= CONFIG.TIMER_WARN_RATIO) {
      timerRing.classList.add("warn");
    }
  }

  function setFeedback(text, type = "bad") {
    feedback.className = `feedback ${type}`;
    feedback.textContent = text;
    setVisible(feedback, true);
  }

  function clearFeedback() {
    setVisible(feedback, false);
    feedback.textContent = "";
    setVisible(imageBox, false);
    imageBox.innerHTML = "";
  }

  function getCurrentAttemptNumber() {
    if (!current) return 1;
    return Math.min(current.attempt_count + 1, CONFIG.MAX_ATTEMPTS);
  }

  function getListenEnableAttempt(item) {
    return Number(item?.listen_enable_attempt || CONFIG.DEFAULT_LISTEN_ENABLE_ATTEMPT);
  }

  function currentItem() {
    return items[index] || null;
  }

  function updateListenButton() {
    const item = currentItem();

    if (!item || !current || isJudging || current.final_status) {
      btnListen.disabled = true;
      return;
    }

    const enableFrom = getListenEnableAttempt(item);
    const currentAttempt = getCurrentAttemptNumber();

    btnListen.disabled = currentAttempt < enableFrom;
    btnListen.title = btnListen.disabled
      ? `Nghe mẫu sẽ mở từ lượt ${enableFrom}`
      : "Nghe mẫu";
  }

  function lockCurrentItem() {
    btnListen.disabled = true;
    btnSpeak.disabled = true;

    if (recording) {
      stopRec().catch(() => {});
    }
  }

  function unlockCurrentItem() {
    if (!current?.final_status && !isJudging) {
      btnSpeak.disabled = false;
      updateListenButton();
    }
  }

  function setJudging(on) {
    isJudging = on;
    timerPaused = on;
    setVisible(statusEl, on);

    btnSpeak.disabled = on;
    btnRetry.disabled = on;
    btnNext.disabled = on;

    if (on) {
      btnListen.disabled = true;
      lastTimerTickMs = null;
    } else {
      lastTimerTickMs = Date.now();

      if (current?.final_status) {
        lockCurrentItem();
      } else {
        unlockCurrentItem();
      }
    }

    updateCountdownUI();
  }

  function setModelStatus(text, type = "") {
    modelStatus.className = "model-status";
    if (type) modelStatus.classList.add(type);
    modelStatus.textContent = text;
  }

  async function loadLesson() {
    try {
      const res = await fetch(CONFIG.CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Cannot load config.json");
      lesson = await res.json();
    } catch (e) {
      console.warn("[CONFIG] fallback to default lesson:", e);
      lesson = DEFAULT_LESSON;
    }

    items = lesson.items || [];
    lessonNameEl.textContent = lesson.lesson_name || "Bài luyện L/N";
  }

  function populateVoices() {
    if (!("speechSynthesis" in window)) {
      voiceSelect.innerHTML = `<option value="">Thiết bị không hỗ trợ TTS</option>`;
      selectedVoice = null;
      return;
    }

    voices = speechSynthesis.getVoices() || [];

    const viVoices = voices.filter(v => (v.lang || "").toLowerCase().startsWith("vi"));
    const otherVoices = voices.filter(v => !(v.lang || "").toLowerCase().startsWith("vi"));

    const ordered = [...viVoices, ...otherVoices];

    voiceSelect.innerHTML = "";

    if (!ordered.length) {
      voiceSelect.innerHTML = `<option value="">Đang tải giọng đọc…</option>`;
      selectedVoice = null;
      return;
    }

    ordered.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${v.name} (${v.lang})${v.default ? " — default" : ""}`;
      voiceSelect.appendChild(opt);
    });

    let preferredIndex = ordered.findIndex(v =>
      (v.lang || "").toLowerCase().startsWith("vi") &&
      /linh|vietnam|google|microsoft/i.test(v.name)
    );

    if (preferredIndex < 0) {
      preferredIndex = ordered.findIndex(v => (v.lang || "").toLowerCase().startsWith("vi"));
    }

    if (preferredIndex < 0) preferredIndex = 0;

    voiceSelect.value = String(preferredIndex);
    selectedVoice = ordered[preferredIndex];
    voiceSelect._orderedVoices = ordered;
  }

  function updateSelectedVoice() {
    const ordered = voiceSelect._orderedVoices || [];
    const idx = Number(voiceSelect.value);
    selectedVoice = ordered[idx] || null;
  }

  function speakText(text, onEnd = null) {
    if (!("speechSynthesis" in window)) {
      if (onEnd) onEnd();
      return;
    }

    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = selectedVoice?.lang || "vi-VN";
    u.rate = CONFIG.TTS_RATE;
    u.pitch = CONFIG.TTS_PITCH;
    u.volume = CONFIG.TTS_VOLUME;

    if (selectedVoice) {
      u.voice = selectedVoice;
    }

    u.onend = () => onEnd && onEnd();
    speechSynthesis.speak(u);
  }

  async function playSfx(ok) {
    try {
      const a = ok ? sfxOk : sfxBad;
      a.currentTime = 0;
      await a.play();
    } catch {}
  }

  async function loadSelectedModel() {
    const modelId = modelSelect.value || CONFIG.DEFAULT_MODEL_ID;

    if (transcriber && loadedModelId === modelId) {
      setModelStatus(`Model đã sẵn sàng: ${modelId}`, "ok");
      btnStart.disabled = false;
      return transcriber;
    }

    transcriber = null;
    loadedModelId = null;
    btnStart.disabled = true;
    btnLoadModel.disabled = true;
    modelSelect.disabled = true;

    setModelStatus(`Đang load model: ${modelId}`, "loading");

    env.allowRemoteModels = true;
    env.backends.onnx.wasm.numThreads = CONFIG.ORT_NUM_THREADS;
    env.backends.onnx.wasm.wasmPaths = CONFIG.ORT_WASM_PATH;
    env.backends.onnx.wasm.wasmFileName = CONFIG.ORT_WASM_FILE;

    await nextPaint();

    try {
      transcriber = await pipeline("automatic-speech-recognition", modelId, {
        quantized: true,
        progress_callback: p => {
          if (p?.status) {
            console.log("[ASR]", p);
            setModelStatus(`Đang load model: ${p.status}`, "loading");
          }
        }
      });

      loadedModelId = modelId;
      setModelStatus(`Model đã sẵn sàng: ${modelId}`, "ok");
      btnStart.disabled = false;

      return transcriber;
    } catch (e) {
      transcriber = null;
      loadedModelId = null;
      btnStart.disabled = true;
      setModelStatus(`Load model thất bại. Mở Console để xem lỗi.`, "bad");
      console.error("[ASR LOAD ERROR]", e);
      throw e;
    } finally {
      btnLoadModel.disabled = false;
      modelSelect.disabled = false;
    }
  }

  async function ensureModel() {
    if (!transcriber) {
      throw new Error("Model has not been loaded. Please click Load model first.");
    }
    return transcriber;
  }

  async function startRec() {
    chunks = [];
    recordingStartedAt = Date.now();
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
    let mimeType = "";

    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        mimeType = t;
        break;
      }
    }

    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = e => e.data?.size && chunks.push(e.data);
    recorder.start();

    recording = true;
    btnSpeak.textContent = "⏹️ Dừng";
  }

  async function stopRec() {
    if (!recording) return null;

    const blob = await new Promise(resolve => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      recorder.stop();
    });

    stream?.getTracks().forEach(t => t.stop());

    recording = false;
    btnSpeak.textContent = "🎤 Nói";

    return blob;
  }

  function storeAttemptAudio(blob) {
    const item = currentItem();
    if (!item || !current || !blob) return null;

    const attemptNo = current.attempt_count + 1;
    const audioPath = makeAudioPath(item, attemptNo);
    const endedAt = Date.now();

    audioBlobs.set(audioPath, blob);

    const meta = {
      attempt: attemptNo,
      path: audioPath,
      mime_type: blob.type || "audio/webm",
      size_bytes: blob.size,
      recording_started_at: recordingStartedAt ? new Date(recordingStartedAt).toISOString() : null,
      recording_ended_at: new Date(endedAt).toISOString(),
      recording_duration_seconds: recordingStartedAt
        ? Number(((endedAt - recordingStartedAt) / 1000).toFixed(3))
        : null
    };

    current.audio_files.push(meta);
    recordingStartedAt = null;

    return meta;
  }

  async function blobToFloat32(blob) {
    const ab = await blob.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(ab);

    let mono = buf.getChannelData(0);

    if (buf.numberOfChannels > 1) {
      const ch1 = buf.getChannelData(1);
      const mix = new Float32Array(mono.length);
      for (let i = 0; i < mono.length; i++) mix[i] = (mono[i] + ch1[i]) / 2;
      mono = mix;
    }

    if (buf.sampleRate === CONFIG.TARGET_SAMPLE_RATE) return mono;

    const ratio = CONFIG.TARGET_SAMPLE_RATE / buf.sampleRate;
    const n = Math.floor(mono.length * ratio);
    const out = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const src = i / ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(mono.length - 1, i0 + 1);
      const t = src - i0;
      out[i] = (1 - t) * mono[i0] + t * mono[i1];
    }

    return out;
  }

  function getItemTimeLimitMs(item) {
    return Number(item?.time_limit_seconds || CONFIG.DEFAULT_TIME_LIMIT_SECONDS) * 1000;
  }

  function startCountdown(item) {
    stopCountdown();

    countdownTotalMs = getItemTimeLimitMs(item);
    countdownLeftMs = countdownTotalMs;

    timerPaused = false;
    lastTimerTickMs = Date.now();
    updateCountdownUI();

    timerInterval = setInterval(() => {
      if (timerPaused || isJudging || !current || current.final_status) {
        lastTimerTickMs = Date.now();
        updateCountdownUI();
        return;
      }

      const now = Date.now();
      const delta = now - lastTimerTickMs;
      lastTimerTickMs = now;

      countdownLeftMs -= delta;
      updateCountdownUI();

      if (countdownLeftMs <= 0) {
        handleTimeout();
      }
    }, CONFIG.TIMER_TICK_MS);
  }

  function stopCountdown() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function pauseCountdown() {
    timerPaused = true;
    lastTimerTickMs = null;
    updateCountdownUI();
  }

  function resumeCountdown() {
    if (!current?.final_status) {
      timerPaused = false;
      lastTimerTickMs = Date.now();
      unlockCurrentItem();
      updateCountdownUI();
    }
  }

  function handleTimeout() {
    if (!current || current.final_status) return;

    stopCountdown();

    current.final_status = "FAIL_BY_TIMEOUT";
    lockCurrentItem();
    finishCurrentItem();

    setFeedback("Hết thời gian. Con bấm câu tiếp để chuyển sang câu mới nhé.", "warn");
    playSfx(false);

    setVisible(btnRetry, false);
    setVisible(btnNext, true);
    updateCountdownUI();
  }

  function newItemState(item) {
    return {
      student_id: studentId,
      lesson_name: lesson.lesson_name || "",
      model_id: loadedModelId,
      item_index: index + 1,
      item_id: item.id,
      item_text: item.text,

      time_limit_seconds: item.time_limit_seconds || CONFIG.DEFAULT_TIME_LIMIT_SECONDS,
      listen_enable_attempt: getListenEnableAttempt(item),
      time_left_seconds_at_finish: null,

      started_at: nowISO(),
      completed_at: null,
      item_time_seconds: null,

      attempt_count: 0,
      hint_count: 0,
      first_attempt_correct: null,

      audio_files: [],
      asr_outputs: [],
      normalized_outputs: [],
      syllable_results: [],

      final_status: null
    };
  }

  function renderPrompt(item, wrongIndexes = []) {
    const syllables = item.syllables || [];

    promptEl.innerHTML = syllables.map((syl, i) => {
      const cls = wrongIndexes.includes(i) ? "syllable bad" : "syllable";
      return `<span class="${cls}">${escapeHtml(syl.text)}</span>`;
    }).join(" ");
  }

  function showItem() {
    const item = currentItem();

    if (!item) {
      finishLesson();
      return;
    }

    current = newItemState(item);
    itemStartedAt = Date.now();

    clearFeedback();
    renderPrompt(item);

    setVisible(btnRetry, false);
    setVisible(btnNext, false);

    attemptText.textContent = `Lượt 1/${CONFIG.MAX_ATTEMPTS}`;
    progressText.textContent = `${index + 1}/${items.length}`;

    btnSpeak.textContent = "🎤 Nói";

    startCountdown(item);
    unlockCurrentItem();
  }

  function evaluateSyllables(item, heardRaw) {
    const heard = wordsNorm(heardRaw);
    const syllables = item.syllables || [];

    return syllables.map((syl, i) => {
      const target = syl.target || null;
      const heardInitial = firstLN(heard[i]);
      const ok = target ? heardInitial === target : true;

      return {
        index: i,
        syllable_text: syl.text,
        target,
        heard_initial: heardInitial,
        ok
      };
    });
  }

  function renderBadGuides(item, wrongIndexes) {
    const html = wrongIndexes.map(i => {
      const syl = item.syllables[i];
      if (!syl?.image) return "";

      return `
        <div class="guide-card">
          <div class="guide-title">${escapeHtml(syl.bad || "Con thử đọc lại âm này nhé.")}</div>
          <img src="./${escapeHtml(syl.image)}" alt="Pronunciation guide">
        </div>
      `;
    }).join("");

    imageBox.innerHTML = html;
    setVisible(imageBox, Boolean(html));
  }

  function finishCurrentItem() {
    if (!current || current.completed_at) return;

    stopCountdown();

    current.completed_at = nowISO();
    current.item_time_seconds = secondsSince(itemStartedAt);
    current.time_left_seconds_at_finish = Number(Math.max(0, countdownLeftMs / 1000).toFixed(3));

    logs.push({ ...current });
  }

  function handleResult(ok, syllableResults) {
    const item = currentItem();
    const wrongIndexes = syllableResults.filter(x => !x.ok).map(x => x.index);

    current.syllable_results = syllableResults;

    if (current.attempt_count === 1) {
      current.first_attempt_correct = ok;
    }

    if (ok) {
      const praise = pickRandom(lesson.praises, "Tốt lắm, con đọc đúng rồi!");
      setFeedback(praise, "ok");
      renderPrompt(item);
      playSfx(true);

      current.final_status = "CORRECT";
      lockCurrentItem();
      finishCurrentItem();

      setVisible(btnRetry, false);
      setVisible(btnNext, true);
      updateCountdownUI();
      return;
    }

    renderPrompt(item, wrongIndexes);
    renderBadGuides(item, wrongIndexes);

    const badTexts = wrongIndexes
      .map(i => item.syllables[i]?.bad)
      .filter(Boolean);

    const bad = badTexts.join(" ") || lesson.default_bad || "Chưa đúng rồi, con thử đọc lại nhé.";
    setFeedback(bad, current.attempt_count >= CONFIG.MAX_ATTEMPTS ? "warn" : "bad");
    playSfx(false);

    if (current.attempt_count >= CONFIG.MAX_ATTEMPTS) {
      current.final_status = "FAIL_BY_ATTEMPT";
      lockCurrentItem();
      finishCurrentItem();

      setVisible(btnRetry, false);
      setVisible(btnNext, true);
      updateCountdownUI();
    } else {
      setVisible(btnRetry, true);
      setVisible(btnNext, false);
      resumeCountdown();
    }

    updateListenButton();
  }

  function nextItem() {
    index += 1;
    showItem();
  }

  function finishLesson() {
    stopCountdown();

    if (recording) {
      stopRec().catch(() => {});
    }

    setVisible(practice, false);
    setVisible(done, true);

    const total = logs.length;
    const correct = logs.filter(x => x.final_status === "CORRECT").length;
    const first = logs.filter(x => x.first_attempt_correct === true).length;
    const attempts = logs.reduce((s, x) => s + x.attempt_count, 0);
    const hints = logs.reduce((s, x) => s + x.hint_count, 0);
    const time = sessionStartedAt ? Math.round((Date.now() - sessionStartedAt) / 1000) : 0;

    summary.innerHTML = `
      <b>Bài học:</b> ${escapeHtml(lesson.lesson_name || "")}<br>
      <b>Học sinh:</b> ${escapeHtml(studentId)}<br>
      <b>Model:</b> ${escapeHtml(loadedModelId || "")}<br>
      <b>Thời gian toàn bài:</b> ${time}s<br>
      <b>Đúng:</b> ${correct}/${total}<br>
      <b>Đúng ngay lần đầu:</b> ${first}/${total}<br>
      <b>Tổng lượt nói:</b> ${attempts}<br>
      <b>Số lần nghe mẫu:</b> ${hints}<br>
      <b>Audio recordings:</b> ${audioBlobs.size}
    `;
  }

  async function judge(audioF32) {
    const item = currentItem();
    if (!item || !current || current.final_status) return;

    pauseCountdown();
    setJudging(true);

    await nextPaint();
    await new Promise(r => setTimeout(r, CONFIG.PAINT_SETTLE_MS));

    try {
      const asr = await ensureModel();
      const out = await asr(audioF32, { language: "vi", task: "transcribe" });
      const heardRaw = (out?.text || "").trim();

      current.attempt_count += 1;

      const expectedNorm = normalizeVi(item.text);
      const heardNorm = normalizeVi(heardRaw);
      const exactOk = expectedNorm === heardNorm;

      const syllableResults = evaluateSyllables(item, heardRaw);
      const syllableOk = syllableResults.every(x => x.ok);
      const ok = exactOk || syllableOk;

      current.asr_outputs.push(heardRaw);
      current.normalized_outputs.push(heardNorm);

      const nextAttempt = Math.min(current.attempt_count + 1, CONFIG.MAX_ATTEMPTS);
      attemptText.textContent = `Lượt ${nextAttempt}/${CONFIG.MAX_ATTEMPTS}`;

      console.log("----- ASR -----");
      console.log("expected:", item.text);
      console.log("heard:", heardRaw);
      console.log("expected_norm:", expectedNorm);
      console.log("heard_norm:", heardNorm);
      console.log("syllable_results:", syllableResults);
      console.log("ok:", ok);
      console.log("full_output:", out);

      setJudging(false);
      handleResult(ok, syllableResults);
    } catch (e) {
      setJudging(false);
      resumeCountdown();
      throw e;
    }
  }

  function buildSessionPayload() {
    return {
      student_id: studentId,
      lesson_name: lesson.lesson_name || "",
      model_id: loadedModelId,
      exported_at: nowISO(),
      lesson,
      logs
    };
  }

  function download(filename, blobOrText, mime) {
    const blob = blobOrText instanceof Blob
      ? blobOrText
      : new Blob([blobOrText], { type: mime });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    download(
      `ln_practice_${safeName(studentId)}.json`,
      JSON.stringify(buildSessionPayload(), null, 2),
      "application/json"
    );
  }

  async function exportZip() {
    if (typeof JSZip === "undefined") {
      alert("JSZip chưa được load. Kiểm tra kết nối mạng hoặc CDN.");
      return;
    }

    const zip = new JSZip();
    const payload = buildSessionPayload();

    zip.file("session_log.json", JSON.stringify(payload, null, 2));

    for (const [path, blob] of audioBlobs.entries()) {
      zip.file(path, blob);
    }

    const out = await zip.generateAsync({ type: "blob" });

    download(
      `ln_practice_${safeName(studentId)}.zip`,
      out,
      "application/zip"
    );
  }

  btnLoadModel.onclick = async () => {
    try {
      await loadSelectedModel();
    } catch {
      alert("Load model thất bại. Mở Console để xem chi tiết.");
    }
  };

  modelSelect.onchange = () => {
    transcriber = null;
    loadedModelId = null;
    btnStart.disabled = true;
    setModelStatus("Model chưa được load", "");
  };

  btnStart.onclick = () => {
    if (!transcriber) {
      alert("Bạn cần bấm Load model trước khi bắt đầu.");
      return;
    }

    studentId = studentIdEl.value.trim() || "S001";
    sessionStartedAt = Date.now();

    index = 0;
    logs = [];
    audioBlobs = new Map();

    updateSelectedVoice();

    setVisible(menu, false);
    setVisible(done, false);
    setVisible(practice, true);

    showItem();
  };

  btnTestVoice.onclick = () => {
    updateSelectedVoice();
    speakText(CONFIG.TTS_TEST_TEXT);
  };

  voiceSelect.onchange = updateSelectedVoice;

  btnListen.onclick = () => {
    const item = currentItem();
    if (!item || !current || isJudging || current.final_status || btnListen.disabled) return;

    current.hint_count += 1;
    speakText(item.text);
  };

  btnSpeak.onclick = async () => {
    try {
      if (isJudging || current?.final_status || btnSpeak.disabled) return;

      if (!recording) {
        clearFeedback();
        await startRec();
        return;
      }

      const blob = await stopRec();
      if (!blob) return;

      storeAttemptAudio(blob);

      const audio = await blobToFloat32(blob);
      await judge(audio);
    } catch (e) {
      console.error("[SPEAK ERROR]", e);
      setJudging(false);
      resumeCountdown();
      alert("Có lỗi khi thu âm hoặc chấm phát âm. Mở Console để xem chi tiết.");
    }
  };

  btnRetry.onclick = () => {
    if (isJudging || current?.final_status) return;

    clearFeedback();
    setVisible(btnRetry, false);
    renderPrompt(currentItem());
    resumeCountdown();
    updateListenButton();
  };

  btnNext.onclick = () => {
    if (isJudging) return;
    nextItem();
  };

  btnEnd.onclick = () => {
    finishLesson();
  };

  btnRestart.onclick = () => {
    setVisible(done, false);
    setVisible(menu, true);
  };

  btnExportZip.onclick = exportZip;
  btnExportJSON.onclick = exportJSON;

  populateVoices();

  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  loadLesson();

  setModelStatus("Model chưa được load", "");
  btnStart.disabled = true;

  console.log("[APP] ready");
})();