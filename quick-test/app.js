import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";

(() => {
  const CONFIG = {
    CONFIG_URL: "./config.json",

    DEFAULT_MODEL_ID: "ivanthepevt/PhoWhisper-tiny-for-L-N",
    MODEL_TINY_LN: "ivanthepevt/PhoWhisper-tiny-for-L-N",
    MODEL_BASE: "huuquyet/PhoWhisper-base",

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

    PAINT_SETTLE_MS: 0
  };

  const DEFAULT_LESSON = {
    lesson_name: "Quick Test L/N",
    praises: ["Tốt lắm, con đọc đúng rồi!"],
    default_bad: "Chưa đúng rồi, con thử đọc lại nhé.",
    items: [
      {
        id: "lua_nep",
        text: "lúa nếp",
        syllables: [
          { text: "lúa", target: "l", bad: "Tiếng thứ nhất là âm L.", image: "l.png" },
          { text: "nếp", target: "n", bad: "Tiếng thứ hai là âm N.", image: "n.png" }
        ]
      }
    ]
  };

  const $ = (id) => document.getElementById(id);

  const setup = $("setup");
  const tester = $("tester");

  const lessonNameEl = $("lessonName");
  const studentIdEl = $("studentId");

  const voiceSelect = $("voiceSelect");
  const btnTestVoice = $("btnTestVoice");

  const modelSelect = $("modelSelect");
  const btnLoadModel = $("btnLoadModel");
  const modelStatus = $("modelStatus");
  const btnStart = $("btnStart");

  const itemSelect = $("itemSelect");
  const progressText = $("progressText");
  const attemptText = $("attemptText");

  const promptEl = $("prompt");
  const statusEl = $("status");
  const feedback = $("feedback");
  const imageBox = $("imageBox");

  const btnListen = $("btnListen");
  const btnSpeak = $("btnSpeak");
  const btnPrev = $("btnPrev");
  const btnNext = $("btnNext");
  const btnClear = $("btnClear");
  const btnBack = $("btnBack");

  const btnExportCSV = $("btnExportCSV");
  const btnExportJSON = $("btnExportJSON");

  let lesson = DEFAULT_LESSON;
  let items = [];
  let index = 0;

  let studentId = "TESTER";
  let sessionStartedAt = null;
  let currentStartedAt = null;

  let currentAttemptCount = 0;
  let currentHintCount = 0;

  let logs = [];

  let transcriber = null;
  let loadedModelId = null;

  let selectedVoice = null;

  let recording = false;
  let stream = null;
  let recorder = null;
  let chunks = [];

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

  function currentItem() {
    return items[index] || null;
  }

  function setModelStatus(text, type = "") {
    modelStatus.className = "model-status";
    if (type) modelStatus.classList.add(type);
    modelStatus.textContent = text;
  }

  function setJudging(on) {
    isJudging = on;
    setVisible(statusEl, on);

    btnSpeak.disabled = on;
    btnListen.disabled = on;
    btnPrev.disabled = on;
    btnNext.disabled = on;
    btnClear.disabled = on;
    itemSelect.disabled = on;
  }

  function setFeedback(text, type = "info") {
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

  async function loadLesson() {
    try {
      const res = await fetch(CONFIG.CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Cannot load config.json");
      lesson = await res.json();
    } catch (e) {
      console.warn("[CONFIG] fallback:", e);
      lesson = DEFAULT_LESSON;
    }

    items = lesson.items || [];
    lessonNameEl.textContent = lesson.lesson_name || "Quick Test L/N";
    buildItemSelect();
  }

  function buildItemSelect() {
    itemSelect.innerHTML = "";

    items.forEach((item, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${item.text}`;
      itemSelect.appendChild(opt);
    });
  }

  function populateVoices() {
    if (!("speechSynthesis" in window)) {
      voiceSelect.innerHTML = `<option value="">Thiết bị không hỗ trợ TTS</option>`;
      selectedVoice = null;
      return;
    }

    const voices = speechSynthesis.getVoices() || [];
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

    let preferred = ordered.findIndex(v =>
      (v.lang || "").toLowerCase().startsWith("vi") &&
      /linh|vietnam|google|microsoft/i.test(v.name)
    );

    if (preferred < 0) {
      preferred = ordered.findIndex(v => (v.lang || "").toLowerCase().startsWith("vi"));
    }

    if (preferred < 0) preferred = 0;

    voiceSelect.value = String(preferred);
    selectedVoice = ordered[preferred];
    voiceSelect._orderedVoices = ordered;
  }

  function updateSelectedVoice() {
    const ordered = voiceSelect._orderedVoices || [];
    selectedVoice = ordered[Number(voiceSelect.value)] || null;
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = selectedVoice?.lang || "vi-VN";
    u.rate = CONFIG.TTS_RATE;
    u.pitch = CONFIG.TTS_PITCH;
    u.volume = CONFIG.TTS_VOLUME;

    if (selectedVoice) {
      u.voice = selectedVoice;
    }

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
      return;
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
    } catch (e) {
      transcriber = null;
      loadedModelId = null;
      btnStart.disabled = true;
      setModelStatus("Load model thất bại. Mở Console để xem lỗi.", "bad");
      console.error("[ASR LOAD ERROR]", e);
      throw e;
    } finally {
      btnLoadModel.disabled = false;
      modelSelect.disabled = false;
    }
  }

  async function ensureModel() {
    if (!transcriber) {
      throw new Error("Model has not been loaded.");
    }
    return transcriber;
  }

  async function startRec() {
    chunks = [];
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

  function renderPrompt(item, wrongIndexes = [], okIndexes = []) {
    const syllables = item.syllables || [];

    promptEl.innerHTML = syllables.map((syl, i) => {
      let cls = "syllable";
      if (wrongIndexes.includes(i)) cls += " bad";
      if (okIndexes.includes(i)) cls += " ok";

      return `<span class="${cls}">${escapeHtml(syl.text)}</span>`;
    }).join(" ");
  }

  function showItem(i = index) {
    index = Math.max(0, Math.min(items.length - 1, i));
    itemSelect.value = String(index);

    const item = currentItem();
    if (!item) return;

    currentStartedAt = Date.now();
    currentAttemptCount = 0;
    currentHintCount = 0;

    clearFeedback();
    renderPrompt(item);

    progressText.textContent = `${index + 1}/${items.length}`;
    attemptText.textContent = `Attempt: ${currentAttemptCount}`;
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

  function logAttempt(item, heardRaw, heardNorm, exactOk, syllableResults, ok) {
    logs.push({
      student_id: studentId,
      lesson_name: lesson.lesson_name || "",
      model_id: loadedModelId,
      item_index: index + 1,
      item_id: item.id,
      item_text: item.text,

      mode: "QUICK_TEST",
      attempt_number_for_current_visit: currentAttemptCount,
      hint_count_for_current_visit: currentHintCount,
      visit_time_seconds: secondsSince(currentStartedAt),

      asr_output: heardRaw,
      normalized_output: heardNorm,
      exact_match: exactOk,
      syllable_results: syllableResults,
      final_result: ok ? "CORRECT" : "INCORRECT",
      timestamp: nowISO()
    });
  }

  async function judge(audioF32) {
    const item = currentItem();
    if (!item) return;

    setJudging(true);
    await nextPaint();
    await new Promise(r => setTimeout(r, CONFIG.PAINT_SETTLE_MS));

    try {
      const asr = await ensureModel();
      const out = await asr(audioF32, { language: "vi", task: "transcribe" });
      const heardRaw = (out?.text || "").trim();

      currentAttemptCount += 1;

      const expectedNorm = normalizeVi(item.text);
      const heardNorm = normalizeVi(heardRaw);
      const exactOk = expectedNorm === heardNorm;

      const syllableResults = evaluateSyllables(item, heardRaw);
      const ok = exactOk || syllableResults.every(x => x.ok);

      const wrongIndexes = syllableResults.filter(x => !x.ok).map(x => x.index);
      const okIndexes = syllableResults.filter(x => x.ok && x.target).map(x => x.index);

      attemptText.textContent = `Attempt: ${currentAttemptCount}`;

      console.log("----- QUICK TEST ASR -----");
      console.log("expected:", item.text);
      console.log("heard:", heardRaw);
      console.log("expected_norm:", expectedNorm);
      console.log("heard_norm:", heardNorm);
      console.log("syllable_results:", syllableResults);
      console.log("ok:", ok);
      console.log("full_output:", out);

      logAttempt(item, heardRaw, heardNorm, exactOk, syllableResults, ok);

      if (ok) {
        renderPrompt(item, [], okIndexes);
        setFeedback(pickRandom(lesson.praises, "Đúng rồi!"), "ok");
        setVisible(imageBox, false);
        imageBox.innerHTML = "";
        playSfx(true);
      } else {
        renderPrompt(item, wrongIndexes, okIndexes);
        renderBadGuides(item, wrongIndexes);

        const badTexts = wrongIndexes
          .map(i => item.syllables[i]?.bad)
          .filter(Boolean);

        const bad = badTexts.join(" ") || lesson.default_bad || "Chưa đúng rồi, con thử lại nhé.";
        setFeedback(bad, "bad");
        playSfx(false);
      }
    } finally {
      setJudging(false);
    }
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  function csvEscape(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replaceAll('"', '""')}"`;
  }

  function exportJSON() {
    download(
      `ln_quick_test_${studentId}.json`,
      JSON.stringify({ student_id: studentId, model_id: loadedModelId, lesson, logs }, null, 2),
      "application/json"
    );
  }

  function exportCSV() {
    const cols = [
      "student_id",
      "lesson_name",
      "model_id",
      "item_index",
      "item_id",
      "item_text",
      "mode",
      "attempt_number_for_current_visit",
      "hint_count_for_current_visit",
      "visit_time_seconds",
      "asr_output",
      "normalized_output",
      "exact_match",
      "syllable_results",
      "final_result",
      "timestamp"
    ];

    const rows = [
      cols.join(","),
      ...logs.map(log => cols.map(c => {
        const value = Array.isArray(log[c]) ? JSON.stringify(log[c]) : log[c];
        return csvEscape(value);
      }).join(","))
    ];

    download(`ln_quick_test_${studentId}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
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
      alert("Bạn cần bấm Load model trước.");
      return;
    }

    studentId = studentIdEl.value.trim() || "TESTER";
    sessionStartedAt = Date.now();

    logs = [];

    updateSelectedVoice();

    setVisible(setup, false);
    setVisible(tester, true);

    showItem(0);
  };

  btnTestVoice.onclick = () => {
    updateSelectedVoice();
    speakText(CONFIG.TTS_TEST_TEXT);
  };

  voiceSelect.onchange = updateSelectedVoice;

  itemSelect.onchange = () => {
    showItem(Number(itemSelect.value));
  };

  btnListen.onclick = () => {
    const item = currentItem();
    if (!item || isJudging) return;

    currentHintCount += 1;
    speakText(item.text);
  };

  btnSpeak.onclick = async () => {
    try {
      if (isJudging || btnSpeak.disabled) return;

      if (!recording) {
        clearFeedback();
        await startRec();
        return;
      }

      const blob = await stopRec();
      if (!blob) return;

      const audio = await blobToFloat32(blob);
      await judge(audio);
    } catch (e) {
      console.error("[SPEAK ERROR]", e);
      setJudging(false);
      alert("Có lỗi khi thu âm hoặc chấm phát âm. Mở Console để xem chi tiết.");
    }
  };

  btnPrev.onclick = () => {
    if (isJudging) return;
    showItem(index - 1);
  };

  btnNext.onclick = () => {
    if (isJudging) return;
    showItem(index + 1);
  };

  btnClear.onclick = () => {
    if (isJudging) return;
    const item = currentItem();
    currentAttemptCount = 0;
    currentHintCount = 0;
    currentStartedAt = Date.now();

    attemptText.textContent = "Attempt: 0";
    clearFeedback();
    renderPrompt(item);
  };

  btnBack.onclick = () => {
    if (recording) {
      stopRec().catch(() => {});
    }

    setVisible(tester, false);
    setVisible(setup, true);
  };

  btnExportCSV.onclick = exportCSV;
  btnExportJSON.onclick = exportJSON;

  populateVoices();

  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = populateVoices;
  }

  loadLesson();

  setModelStatus("Model chưa được load", "");
  btnStart.disabled = true;

  console.log("[QUICK TEST APP] ready");
})();