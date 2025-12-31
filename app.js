// app.js — DrivePK Employee Tracker

// IMPORTANT: Paste your Apps Script Web App URL here
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxIeab3XNb28woA16KGEoqV10INZcK96gBYn2GhklodaRPdH4ZiA9HvzXRsCs-QW2B9ug/exec";

const HERO_SLIDES = [
  { img: "ad1.jpg", title: "MG U9 Pickup", subtitle: "Built for Pakistan • Powered by DrivePK" },
  { img: "ad2.jpg", title: "GWM Tank 500", subtitle: "Luxury Meets Power • Discover on DrivePK" },
  { img: "ad3.jpg", title: "XPeng X9", subtitle: "Future-Ready EV • Explore with DrivePK" }
];

let timerInterval = null;
let startTime = null;
let tracking = false;
let watchId = null;
let lastPingAt = 0;

const $ = (id) => document.getElementById(id);

function normalizePkPhone(input) {
  if (!input) return "";
  let num = String(input).trim();
  num = num.replace(/\D/g, "");
  if (num.startsWith("0092")) num = num.substring(2);
  if (num.startsWith("92")) num = "0" + num.substring(2);
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

function setInvalid(el, isInvalid) {
  if (!el) return;
  el.classList.toggle("invalid", !!isInvalid);
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

  // CNIC optional
  const cnic = ($("cnic")?.value || "").trim();

  const streetAddress = ($("streetAddress")?.value || "").trim();
  const townCity = ($("townCity")?.value || "").trim();

  return { employeeName, phoneRaw, phoneNumber, cnic, streetAddress, townCity };
}

function setLocalRegistered(phoneNumber) {
  localStorage.setItem("dp_registered_phone", phoneNumber);
}
function getLocalRegistered() {
  return localStorage.getItem("dp_registered_phone") || "";
}
function clearLocalRegistered() {
  localStorage.removeItem("dp_registered_phone");
}

function showRegister() {
  $("registerCard").classList.remove("hidden");
  $("clockCard").classList.add("hidden");
  const btn = $("logoutBtn");
  if (btn) btn.style.display = "none";
}
function showClock() {
  $("registerCard").classList.add("hidden");
  $("clockCard").classList.remove("hidden");
  const btn = $("logoutBtn");
  if (btn) btn.style.display = "inline-block";
}

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

// HERO
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

// REGISTER
async function registerEmployee() {
  const btn = $("registerBtn");
  if (btn) btn.disabled = true;

  try {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
      setRegStatus("ERROR: Web App URL is not set in app.js (GOOGLE_SCRIPT_URL).", false);
      return;
    }

    const nameEl = $("empName");
    const phoneEl = $("empPhone");

    const { employeeName, phoneRaw, phoneNumber, cnic } = getFormData();

    // Mandatory: name + phone
    const nameMissing = !employeeName;
    const phoneMissing = !phoneNumber;

    setInvalid(nameEl, nameMissing);
    setInvalid(phoneEl, phoneMissing);

    if (nameMissing || phoneMissing) {
      setRegStatus("Please enter Employee Name and Phone Number.", false);
      return;
    }

    setRegStatus("Registering... please wait.");

    const resp = await sendToGoogleSheet({
      register: true,
      employeeName,
      phoneNumber,  // normalized
      cnic: cnic || "" // optional
    });

    if (resp.status === "REGISTERED" || resp.status === "ALREADY_REGISTERED") {
      setRegStatus(`Registered ✅ (${phoneRaw} → ${phoneNumber})`);
      setLocalRegistered(phoneNumber);
      showClock();
      setStatus("Ready");
      $("empPhone").value = phoneNumber;
    } else {
      setRegStatus("Registration failed: " + (resp.message || resp.status), false);
    }
  } catch (e) {
    setRegStatus("Registration error: " + String(e), false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function startWork() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
    setStatus("ERROR: Web App URL missing in app.js", false);
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
  } catch {}

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

  if (!navigator.geolocation) {
    setStatus("Geolocation not supported.", false);
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
    (err) => setStatus("Tracking error: " + err.message, false),
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
  clearLocalRegistered();
  tracking = false;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopTimer();

  $("regStatus").style.display = "none";
  showRegister();
}

window.addEventListener("load", () => {
  startHeroAuto();

  $("registerBtn")?.addEventListener("click", registerEmployee);
  $("startBtn")?.addEventListener("click", startWork);
  $("stopBtn")?.addEventListener("click", stopWork);
  $("logoutBtn")?.addEventListener("click", logout);

  const savedPhone = getLocalRegistered();
  if (savedPhone) {
    if ($("empPhone")) $("empPhone").value = savedPhone;
    showClock();
    setStatus("Ready");
  } else {
    showRegister();
  }
});
