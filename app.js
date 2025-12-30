let timerInterval;
let startTime;
let tracking = false;

document.getElementById('startBtn').onclick = startWork;
document.getElementById('stopBtn').onclick = stopWork;

function startWork() {
    if (tracking) return;

    tracking = true;
    startTime = new Date();

    // Timer functionality
    timerInterval = setInterval(() => {
        const elapsedTime = new Date() - startTime;
        const sec = Math.floor(elapsedTime / 1000) % 60;
        const min = Math.floor(elapsedTime / 60000) % 60;
        const hr = Math.floor(elapsedTime / 3600000);
        document.getElementById('timer').textContent = 
          `${hr.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }, 1000);

    // Enable location tracking
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => console.log('Location:', pos.coords.latitude, pos.coords.longitude),
            (err) => console.error(err),
            { enableHighAccuracy: true }
        );
    } else {
        alert('Geolocation not supported in your browser.');
    }

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
}

function stopWork() {
    tracking = false;
    clearInterval(timerInterval);

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;

    alert('Work tracking stopped!');
}
