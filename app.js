// app.js — DrivePK Employee Tracker (Registration gate + Hero ads + Tracking)

// 1) Paste your deployed Apps Script Web App URL here:
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_WEB_APP_URL_HERE";

// 2) HERO BANNER IMAGES (put these files in repo root)
const HERO_SLIDES = [
  { img: "ad1.jpg", title: "DrivePK Updates", subtitle: "Promote inspection offers, auctions, hiring, etc." },
  { img: "ad2.jpg", title: "Inspection Campaign", subtitle: "Upload your own banners anytime." },
  { img: "ad3.jpg", title: "DrivePK Auctions", subtitle: "Add new ads by changing filenames in app.js." }
];

// --- State ---
let timerInterval = null;
let startTime = null;
let tracking = false;
let watchId = null;
let lastPingAt = 0;

const $ = (id) => document.getElementById(id);

// ---- Phone Normalization (Pakistan) ----
function normalizePkPhone(input) {
  if (!input) return "";
  let num = String(input).trim();

  // keep digits only
  num = num.replace(/\D/g, "");

  // 0092XXXXXXXXXXX -> 92XXXXXXXXXXX
  if (num.startsWith("0092")) num = num.substring(2);

  // 92XXXXXXXXXXX -> 0XXXXXXXXXXX
  if (num.startsWith("92")) num = "0" + num.substring(2);

  // 3XXXXXXXXX (10 digits) -> 03XXXXXXXXX
  if (num.length === 10 && num.startsWith("3")) num = "0" + num;

  return num;
}

async function getBatteryPercent() {
  try {
    if (!navigator.getBattery) return "";
    const b = await navigator.getBattery();
    return Math.round(b.level * 100) + "%";
  } catch {
    return "";
  }
}

function setStatus(msg, ok = true) {
  const el = $("status");
  if (!el) return;
  el.textContent = "Status: " + msg;
  el.style.color = ok ? "#0a7a2f" : "#b00020";
}

function setRegStatus(msg, ok = true) {
  const el = $("regStatus");
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
  el.style.color = ok ? "#0a7a2f" : "#b00020";
}

async function sendToGoogleSheet(payload) {
  const res = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { status: "ERROR", message: "Bad JSON from server", raw: text };
  }
}

function getFormData() {
  const employeeName = ($("empName")?.value || "").trim();
  const phoneRaw = ($("empPhone")?.value || "").trim();
  const phoneNumber = normalizePkPhone(phoneRaw);

  const cnic = ($("cnic")?.value || "").trim();
  const streetAddress = ($("streetAddress")?.value || "").trim();
  const townCity = ($("townCity")?.value || "").trim();

  return { employeeName, phoneRaw, phoneNumber, cnic, streetAddress, townCity };
}

// ---- Registration Gate (Local) ----
// Saves which phone is registered on THIS device.
// (Registration itself is stored in your Google Sheet Employees tab)
function setLocalRegistered(phoneNumber) {
  localStorage.setItem("dp_registered_phone", phoneNumber);
}
function getLocalRegistered() {
  return localStorage.getItem("dp_registered_phone") || "";
}
function clearLocalRegistered() {
  localStorage.removeItem("dp_registered_phone");
}

// ---- UI Switch ----
function showRegister() {
  $("registerCard").classList.remove("hidden");
  $("clockCard").classList.add("hidden");

  // Header logout button hidden
  const btn = $("logoutBtn");
  if (btn) btn.style.display = "none";
}
function showClock() {
  $("registerCard").classList.add("hidden");
  $("clockCard").classList.remove("hidden");

  // Header logout button visible
  const btn = $("logoutBtn");
  if (btn) btn.style.display = "inline-block";
}

// ---- Timer ----
function startTimer() {
  startTime = new Date();
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const elapsed = new Date() - startTime;
    const sec = Math.floor(elapsed / 1000) % 60;
    const min = Math.floor(elapsed / 60000) % 60;
    const hr  = Math.floor(elapsed / 3600000);

    $("timer").textContent =
      `${String(hr).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }, 1000);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

// ---- HERO Banner slider ----
let heroIndex = 0;
function renderHeroDots() {
  const wrap = $("heroDots");
  if (!wrap) return;
  wrap.innerHTML = "";
  HERO_SLIDES.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "dot" + (i === heroIndex ? " active" : "");
    d.addEventListener("click", () => {
      heroIndex = i;
      applyHeroSlide();
    });
    wrap.appendChild(d);
  });
}
function applyHeroSlide() {
  const slide = HERO_SLIDES[heroIndex] || HERO_SLIDES[0];
  const img = $("heroImg");
  const t = $("heroTitle");
  const s = $("heroSubtitle");
  if (img) img.src = slide.img;
  if (t) t.textContent = slide.title;
  if (s) s.textContent = slide.subtitle;
  renderHeroDots();
}
function startHeroAuto() {
  applyHeroSlide();
  setInterval(() => {
    heroIndex = (heroIndex + 1) % HERO_SLIDES.length;
    applyHeroSlide();
  }, 5000);
}

// ---- Actions ----
async function registerEmployee() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
    alert("Paste your Apps Script Web App URL in app.js (GOOGLE_SCRIPT_URL).");
    return;
  }

  const { employeeName, phoneRaw, phoneNumber, cnic } = getFormData();

  if (!employeeName) return setRegStatus("Employee Name is required.", false);
  if (!phoneNumber) return setRegStatus("Phone Number is required.", false);
  if (!cnic) return setRegStatus("CNIC is required.", false);

  setRegStatus("Registering... please wait.");

  const resp = await sendToGoogleSheet({
    register: true,
    employeeName,
    phoneNumber, // IMPORTANT: normalized
    cnic
  });

  if (resp.status === "REGISTERED" || resp.status === "ALREADY_REGISTERED") {
    setRegStatus(`Registered ✅ (${phoneRaw} → ${phoneNumber})`);
    setLocalRegistered(phoneNumber);

    // Move to clock screen
    showClock();
    setStatus("Ready");

    // Keep phone in input (so tracking uses same)
    $("empPhone").value = phoneNumber;
  } else {
    setRegStatus("Registration failed: " + (resp.message || resp.status), false);
  }
}

async function startWork() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
    alert("Paste your Apps Script Web App URL in app.js (GOOGLE_SCRIPT_URL).");
    return;
  }

  if (tracking) return;

  const { phoneRaw, phoneNumber, streetAddress, townCity } = getFormData();
  if (!phoneNumber) {
    setStatus("Phone Number missing. Please register again.", false);
    return;
  }

  tracking = true;
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;

  startTimer();
  setStatus("Starting... allow location permission.");

  const batteryPercent = await getBatteryPercent();

  // One-time location for ClockIn row
  let latitude = "";
  let longitude = "";

  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000
      });
    });
    latitude = pos.coords.latitude;
    longitude = pos.coords.longitude;
  } catch (err) {
    console.warn("START location error:", err);
  }

  // START (ClockIn)
  const resp = await sendToGoogleSheet({
    eventType: "START",
    phoneNumber,
    streetAddress,
    townCity,
    batteryPercent,
    latitude,
    longitude,
    statusNote: `ClockIn (${phoneRaw} → ${phoneNumber})`
  });

  if (resp.status === "OK") setStatus("ClockIn saved ✅");
  else setStatus("ClockIn failed: " + (resp.message || resp.status), false);

  // Live tracking PING every 20 seconds (sheet-friendly)
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported in this browser.", false);
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      if (!tracking) return;

      const now = Date.now();
      if (now - lastPingAt < 20000) return;
      lastPingAt = now;

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      const batteryLive = await getBatteryPercent();

      const pingResp = await sendToGoogleSheet({
        eventType: "PING",
        phoneNumber,
        streetAddress,
        townCity,
        batteryPercent: batteryLive,
        latitude: lat,
        longitude: lng,
        statusNote: `Tracking ±${Math.round(acc)}m`
      });

      if (pingResp.status === "OK") {
        setStatus(`Tracking: ${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(acc)}m)`);
      } else {
        setStatus("PING failed: " + (pingResp.message || pingResp.status), false);
      }
    },
    (err) => {
      console.error("watchPosition error:", err);
      setStatus("Tracking error: " + err.message, false);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}

async function stopWork() {
  if (!tracking) return;

  tracking = false;
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;

  stopTimer();

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  const { phoneRaw, phoneNumber, streetAddress, townCity } = getFormData();
  const batteryPercent = await getBatteryPercent();

  let latitude = "";
  let longitude = "";

  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000
      });
    });
    latitude = pos.coords.latitude;
    longitude = pos.coords.longitude;
  } catch {}

  const resp = await sendToGoogleSheet({
    eventType: "STOP",
    phoneNumber,
    streetAddress,
    townCity,
    batteryPercent,
    latitude,
    longitude,
    statusNote: `ClockOut (${phoneRaw} → ${phoneNumber})`
  });

  if (resp.status === "OK") setStatus("ClockOut saved ✅");
  else setStatus("ClockOut failed: " + (resp.message || resp.status), false);

  alert("Work tracking stopped!");
}

function logout() {
  // Only logs out locally (device), does not delete employee from sheet
  clearLocalRegistered();
  tracking = false;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopTimer();

  // Clear form
  if ($("empName")) $("empName").value = "";
  if ($("empPhone")) $("empPhone").value = "";
  if ($("cnic")) $("cnic").value = "";
  if ($("townCity")) $("townCity").value = "";
  if ($("streetAddress")) $("streetAddress").value = "";

  if ($("regStatus")) $("regStatus").style.display = "none";

  showRegister();
}

// ---- Init ----
window.addEventListener("load", () => {
  // Hero
  startHeroAuto();

  // Buttons
  $("registerBtn")?.addEventListener("click", registerEmployee);
  $("startBtn")?.addEventListener("click", startWork);
  $("stopBtn")?.addEventListener("click", stopWork);
  $("logoutBtn")?.addEventListener("click", logout);

  // Gate: if device already registered, go straight to Clock screen
  const savedPhone = getLocalRegistered();
  if (savedPhone) {
    // Put saved phone into input so tracking uses it
    if ($("empPhone")) $("empPhone").value = savedPhone;
    showClock();
    setStatus("Ready");
  } else {
    showRegister();
  }
});
