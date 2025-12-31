// app.js — Employee Time Tracking (Google Sheets via Apps Script)

// 1) Paste your deployed Apps Script Web App URL here:
const GOOGLE_SCRIPT_URL = "PASTE_YOUR_WEB_APP_URL_HERE";

// --- State ---
let timerInterval = null;
let startTime = null;
let tracking = false;
let watchId = null;
let lastPingAt = 0;

// --- Helpers ---
const $ = (id) => document.getElementById(id);

function setStatus(msg, ok = true) {
  const el = $("status");
  if (!el) return;
  el.textContent = "Status: " + msg;
  el.style.color = ok ? "#0a7a2f" : "#b00020";
}

function nowText() {
  return new Date().toLocaleString();
}

/**
 * Normalize Pakistani phone into 03XXXXXXXXX
 * Accepts: 0300..., 300..., 0092300..., +92300..., 92 300..., +92 0300..., spaces/dashes
 */
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

async function sendToGoogleSheet(payload) {
  // Apps Script expects JSON in postData.contents
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
  const phoneNumberRaw = ($("empPhone")?.value || "").trim();
  const phoneNumber = normalizePkPhone(phoneNumberRaw);
  const cnic = ($("cnic")?.value || "").trim();
  const streetAddress = ($("streetAddress")?.value || "").trim();
  const townCity = ($("townCity")?.value || "").trim();

  return { employeeName, phoneNumberRaw, phoneNumber, cnic, streetAddress, townCity };
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

// --- Actions ---
async function registerEmployee() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
    alert("Paste your Apps Script Web App URL inside app.js (GOOGLE_SCRIPT_URL).");
    return;
  }

  const { employeeName, phoneNumberRaw, phoneNumber, cnic } = getFormData();

  if (!employeeName) {
    setStatus("Employee Name is required for registration.", false);
    return;
  }
  if (!phoneNumber) {
    setStatus("Phone Number is required for registration.", false);
    return;
  }
  if (!cnic) {
    setStatus("CNIC is required for registration.", false);
    return;
  }

  setStatus("Registering employee...");

  const resp = await sendToGoogleSheet({
    register: true,
    employeeName,
    phoneNumber,     // IMPORTANT: send normalized
    cnic
  });

  if (resp.status === "REGISTERED") {
    setStatus(`Registered ✅ (${phoneNumberRaw} → ${phoneNumber})`);
  } else if (resp.status === "ALREADY_REGISTERED") {
    setStatus(`Already registered ✅ (${phoneNumber})`);
  } else {
    setStatus("Registration failed: " + (resp.message || resp.status), false);
  }
}

async function startWork() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
    alert("Paste your Apps Script Web App URL inside app.js (GOOGLE_SCRIPT_URL).");
    return;
  }

  if (tracking) return;

  const { phoneNumberRaw, phoneNumber, streetAddress, townCity } = getFormData();

  if (!phoneNumber) {
    setStatus("Phone Number is required (must match Employees sheet).", false);
    return;
  }

  tracking = true;
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;

  startTimer();
  setStatus("Starting... please allow location permission.");

  const batteryPercent = await getBatteryPercent();

  // Try one-time location for ClockIn row
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

  // Send START event
  const resp = await sendToGoogleSheet({
    eventType: "START",
    phoneNumber,         // normalized
    streetAddress,
    townCity,
    batteryPercent,
    latitude,
    longitude,
    statusNote: `ClockIn (${phoneNumberRaw} → ${phoneNumber})`
  });

  if (resp.status === "OK") {
    setStatus("ClockIn saved ✅");
  } else {
    setStatus("ClockIn failed: " + (resp.message || resp.status), false);
  }

  // Start live tracking (PING)
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported in this browser.", false);
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      if (!tracking) return;

      // Throttle pings (every 20 seconds) to keep sheet clean
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

  const { phoneNumberRaw, phoneNumber, streetAddress, townCity } = getFormData();
  const batteryPercent = await getBatteryPercent();

  // Try one-time location for ClockOut row
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
    statusNote: `ClockOut (${phoneNumberRaw} → ${phoneNumber})`
  });

  if (resp.status === "OK") {
    setStatus("ClockOut saved ✅");
  } else {
    setStatus("ClockOut failed: " + (resp.message || resp.status), false);
  }

  alert("Work tracking stopped!");
}

// --- Bind UI ---
window.addEventListener("load", () => {
  if ($("registerBtn")) $("registerBtn").addEventListener("click", registerEmployee);
  if ($("startBtn")) $("startBtn").addEventListener("click", startWork);
  if ($("stopBtn")) $("stopBtn").addEventListener("click", stopWork);

  setStatus("Ready");
});
