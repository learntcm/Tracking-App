// DrivePK Employee Tracker (Login-first)

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyvQkPXPVhuzcxNMeEwOSVLeqFvOlGq6LknOtRe10YZ68QlJYXmeC5cjJ8Sau6B2_0ZHQ/exec"; 
// Example:
// const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxxxx/exec";

const HERO_SLIDES = [
  { img: "ad1.png", title: "MG U9 Pickup", subtitle: "Built for Pakistan • Powered by DrivePK" },
  { img: "ad2.png", title: "GWM Tank 500", subtitle: "Luxury Meets Power • Discover on DrivePK" },
  { img: "ad3.png", title: "Dr Khan",
];

let deferredPrompt = null;
let timerInterval = null;
let startTime = null;
let tracking = false;
let watchId = null;
let lastPingAt = 0;

const $ = (id) => document.getElementById(id);

function normalizePkPhone(input) {
  if (!input) return "";
  let num = String(input).trim().replace(/\D/g, "");
  if (num.startsWith("0092")) num = num.substring(2);
  if (num.startsWith("92")) num = "0" + num.substring(2);
  if (num.length === 10 && num.startsWith("3")) num = "0" + num;
  return num;
}

function setLoginStatus(msg, ok = true) {
  const el = $("loginStatus");
  el.textContent = "Status: " + msg;
  el.style.color = ok ? "#0a7a2f" : "#b00020";
}

function setStatus(msg, ok = true) {
  const el = $("statusBox");
  el.textContent = "Status: " + msg;
  el.style.color = ok ? "#0a7a2f" : "#b00020";
}

async function post(payload) {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_")) {
    throw new Error("Apps Script URL is missing in app.js (GOOGLE_SCRIPT_URL).");
  }

  const res = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { 
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Fetch error ${res.status}: ${res.statusText}`);
  }

  const text = await res.text();

  // Try JSON parse, else show raw
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Server returned non-JSON: " + text);
  }
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

/** Local session handling */
function saveSession(token, phone, name) {
  localStorage.setItem("dp_token", token);
  localStorage.setItem("dp_phone", phone);
  localStorage.setItem("dp_name", name);
}

function clearSession() {
  localStorage.removeItem("dp_token");
  localStorage.removeItem("dp_phone");
  localStorage.removeItem("dp_name");
}

function getSession() {
  return {
    token: localStorage.getItem("dp_token") || "",
    phone: localStorage.getItem("dp_phone") || "",
    name: localStorage.getItem("dp_name") || ""
  };
}

function showClock() {
  $("loginCard").classList.add("hidden");
  $("clockCard").classList.remove("hidden");
  $("logoutBtn").style.display = "inline-block";
}

function showLogin() {
  $("loginCard").classList.remove("hidden");
  $("clockCard").classList.add("hidden");
  $("logoutBtn").style.display = "none";
}

/** Timer functions */
function startTimer() {
  startTime = new Date();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = new Date() - startTime;
    const sec = Math.floor(elapsed / 1000) % 60;
    const min = Math.floor(elapsed / 60000) % 60;
    const hr = Math.floor(elapsed / 3600000);
    $("timer").textContent =
      `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  $("timer").textContent = "00:00:00";
}

/** HERO slides */
let heroIndex = 0;

function renderDots() {
  const wrap = $("heroDots");
  wrap.innerHTML = "";
  HERO_SLIDES.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "dot" + (i === heroIndex ? " active" : "");
    d.onclick = () => { heroIndex = i; applyHero(); };
    wrap.appendChild(d);
  });
}

function applyHero() {
  const s = HERO_SLIDES[heroIndex];
  $("heroImg").src = s.img;
  $("heroTitle").textContent = s.title;
  $("heroSubtitle").textContent = s.subtitle;
  renderDots();
}

function autoHero() {
  applyHero();
  setInterval(() => {
    heroIndex = (heroIndex + 1) % HERO_SLIDES.length;
    applyHero();
  }, 5000);
}

/** Login functionality */
async function login() {
  try {
    const name = ($("loginName").value || "").trim();
    const phone = normalizePkPhone($("loginPhone").value || "");
    const pin = ($("loginPin").value || "").trim();

    if (!name || !phone || !pin) {
      setLoginStatus("Name, phone and PIN are required", false);
      return;
    }

    setLoginStatus("Logging in...");

    const r = await post({
      action: "LOGIN",
      employeeName: name,
      phoneNumber: phone,
      pin: pin
    });

    if (!r.ok) {
      setLoginStatus("Login failed: " + (r.error || "Unknown error"), false);
      return;
    }

    saveSession(r.token, r.phone, r.employeeName);
    showClock();
    setStatus("Ready ✅");
  } catch (e) {
    setLoginStatus(String(e), false);
  }
}

/** Tracking functions */
async function track(eventType, extra) {
  const s = getSession();
  return await post(Object.assign({
    action: "TRACK",
    token: s.token,
    phoneNumber: s.phone,
    eventType
  }, extra || {}));
}

async function startWork() {
  const s = getSession();
  if (!s.token || !s.phone) {
    showLogin();
    setLoginStatus("Session missing. Please login again.", false);
    return;
  }

  tracking = true;
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;

  startTimer();
  setStatus("Starting... allow location permission.");

  let lat = "", lng = "";
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000
      });
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch {}

  const battery = await getBatteryPercent();

  const r = await track("START", {
    batteryPercent: battery,
    latitude: lat,
    longitude: lng,
    statusNote: "ClockIn"
  });

  if (r.ok) setStatus("ClockIn saved ✅");
  else setStatus("ClockIn failed: " + (r.error || "Unknown"), false);

  watchId = navigator.geolocation.watchPosition(async (pos) => {
    if (!tracking) return;

    const now = Date.now();
    if (now - lastPingAt < 20000) return;
    lastPingAt = now;

    const batteryLive = await getBatteryPercent();

    const rr = await track("PING", {
      batteryPercent: batteryLive,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      statusNote: `Tracking ±${Math.round(pos.coords.accuracy)}m`
    });

    if (rr.ok) {
      setStatus(`Tracking: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
    } else {
      setStatus("PING failed: " + (rr.error || "Unknown"), false);
    }
  }, (err) => {
    setStatus("Location error: " + err.message, false);
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000
  });
}

async function stopWork() {
  tracking = false;
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;

  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  setStatus("Stopping...");

  let lat = "", lng = "";
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000
      });
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch {}

  const battery = await getBatteryPercent();

  const r = await track("STOP", {
    batteryPercent: battery,
    latitude: lat,
    longitude: lng,
    statusNote: "ClockOut"
  });

  if (r.ok) setStatus("ClockOut saved ✅");
  else setStatus("ClockOut failed: " + (r.error || "Unknown"), false);

  stopTimer();
  alert("Stopped!");
}

/** Logout functionality */
function logout() {
  tracking = false;
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopTimer();
  clearSession();
  showLogin();
  setLoginStatus("Logged out.");
}

/** INIT */
window.addEventListener("load", () => {
  autoHero();

  $("loginBtn").addEventListener("click", login);
  $("startBtn").addEventListener("click", startWork);
  $("stopBtn").addEventListener("click", stopWork);
  $("logoutBtn").addEventListener("click", logout);

  const s = getSession();
  if (s.token && s.phone) {
    showClock();
    setStatus("Ready ✅");
  } else {
    showLogin();
    setLoginStatus("Ready");
  }

  ["loginName","loginPhone","loginPin"].forEach(id=>{
    $(id).addEventListener("keydown",(ev)=>{
      if(ev.key==="Enter") login();
    });
  });
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Prevent default install prompt
  deferredPrompt = e; // Save the install event
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.style.display = 'block';
});

function installPWA() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log("User accepted the install prompt ✅");
    } else {
      console.log("User dismissed the install prompt ❌");
    }
    deferredPrompt = null;
  });
}
