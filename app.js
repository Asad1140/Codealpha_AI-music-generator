// Application State
let isRunning = false;
let pollingInterval = null;
let chartInstance = null;
let currentTokens = null;

// Audio and Visualizer State
const audioPlayer = document.getElementById('audio-player');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const timeDisplay = document.getElementById('time-display');
const canvas = document.getElementById('piano-roll-canvas');
const ctx = canvas.getContext('2d');
let animationFrameId = null;
let parsedNotes = [];
let totalDurationBeats = 0;

// Setup sliders value listeners
const tempInput = document.getElementById('temperature');
const tempVal = document.getElementById('temp-val');
tempInput.addEventListener('input', () => {
    tempVal.textContent = tempInput.value;
});

// Initialize Chart.js
function initChart(lossData = [], accData = []) {
    const ctxChart = document.getElementById('training-chart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Hide empty state if data exists
    const emptyState = document.getElementById('chart-empty');
    if (lossData.length > 0) {
        emptyState.style.display = 'none';
    } else {
        emptyState.style.display = 'flex';
        return;
    }

    chartInstance = new Chart(ctxChart, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Loss',
                    data: lossData,
                    borderColor: '#ff007f',
                    backgroundColor: 'rgba(255, 0, 127, 0.1)',
                    yAxisID: 'y-loss',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 3
                },
                {
                    label: 'Accuracy (%)',
                    data: accData,
                    borderColor: '#00f5d4',
                    backgroundColor: 'rgba(0, 245, 212, 0.1)',
                    yAxisID: 'y-acc',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Epoch', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', stepSize: 1 }
                },
                'y-loss': {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Cross Entropy Loss', color: '#ff007f' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                'y-acc': {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Accuracy (%)', color: '#00f5d4' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// Convert pitch representation to MIDI note numbers
const noteToOffset = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

function getMidiNumber(pitchStr) {
    if (!pitchStr || pitchStr.toLowerCase() === 'rest') return null;
    
    // Find the octave (last character, e.g. C#5 -> 5)
    const octave = parseInt(pitchStr.slice(-1));
    if (isNaN(octave)) return 60; // Fallback C4
    
    let noteName = pitchStr.slice(0, -1);
    
    // Convert flats to sharps
    if (noteName.includes('-')) {
        if (noteName === 'D-') noteName = 'C#';
        else if (noteName === 'E-') noteName = 'D#';
        else if (noteName === 'G-') noteName = 'F#';
        else if (noteName === 'A-') noteName = 'G#';
        else if (noteName === 'B-') noteName = 'A#';
    }
    
    const offset = noteToOffset[noteName];
    if (offset === undefined) return 60;
    return (octave + 1) * 12 + offset;
}

// Parse generated JSON tokens into scrolling notes list
function parseNoteTokens(tokens) {
    if (!tokens || tokens.length === 0) {
        parsedNotes = [];
        totalDurationBeats = 0;
        document.getElementById('canvas-empty').style.display = 'flex';
        return;
    }
    
    document.getElementById('canvas-empty').style.display = 'none';
    
    parsedNotes = [];
    let currentBeat = 0;
    
    tokens.forEach(token => {
        const lastUnderscore = token.lastIndexOf('_');
        if (lastUnderscore === -1) return;
        
        const pitchPart = token.slice(0, lastUnderscore);
        const duration = parseFloat(token.slice(lastUnderscore + 1));
        
        if (pitchPart.toLowerCase() === 'rest') {
            currentBeat += duration;
            return;
        }
        
        const isChord = pitchPart.includes('.');
        const pitches = isChord ? pitchPart.split('.') : [pitchPart];
        
        pitches.forEach(p => {
            const midiVal = getMidiNumber(p);
            if (midiVal !== null) {
                parsedNotes.push({
                    pitchName: p,
                    midi: midiVal,
                    beatOffset: currentBeat,
                    duration: duration
                });
            }
        });
        currentBeat += duration;
    });
    
    totalDurationBeats = currentBeat;
    drawPianoRoll();
}

// Draw static/scrolling piano roll canvas
function drawPianoRoll(currentPlaybackBeat = null) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Set actual canvas drawing resolution
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    
    ctx.clearRect(0, 0, width, height);
    
    // Draw background grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridRows = 24; // Draw 2 octaves
    const rowHeight = height / gridRows;
    for (let i = 0; i <= gridRows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * rowHeight);
        ctx.lineTo(width, i * rowHeight);
        ctx.stroke();
    }
    
    if (parsedNotes.length === 0) return;
    
    // Auto scale midi height coordinates
    let minMidi = 127;
    let maxMidi = 0;
    parsedNotes.forEach(n => {
        if (n.midi < minMidi) minMidi = n.midi;
        if (n.midi > maxMidi) maxMidi = n.midi;
    });
    
    // Padding of 2 notes at top/bottom
    minMidi = Math.max(0, minMidi - 2);
    maxMidi = Math.min(127, maxMidi + 2);
    const midiRange = Math.max(1, maxMidi - minMidi);
    
    // Drawing parameters
    const beatWidth = 45; // Width in px of 1 beat (quarter note)
    const playheadX = 120; // Fixed x coordinate of playing head indicator
    
    let offsetTranslateX = 0;
    if (currentPlaybackBeat !== null) {
        // Slide notes back based on current time
        offsetTranslateX = playheadX - (currentPlaybackBeat * beatWidth);
    } else {
        offsetTranslateX = 10; // Simple padding when static
    }
    
    // Render notes
    parsedNotes.forEach(note => {
        // X position based on beats
        const x = note.beatOffset * beatWidth + offsetTranslateX;
        const noteW = note.duration * beatWidth - 2;
        
        // Y position based on MIDI pitch
        // Reverse so high pitches are at the top
        const y = height - ((note.midi - minMidi) / midiRange) * height - (rowHeight * 0.8);
        const noteH = Math.max(6, rowHeight * 0.7);
        
        // Check if note is currently playing
        const isPlaying = currentPlaybackBeat !== null && 
                          currentPlaybackBeat >= note.beatOffset && 
                          currentPlaybackBeat <= (note.beatOffset + note.duration);
        
        if (isPlaying) {
            // Hot Pink glow for playing notes
            ctx.fillStyle = '#ff007f';
            ctx.shadowColor = '#ff007f';
            ctx.shadowBlur = 12;
        } else {
            // Neon Purple for passive notes
            ctx.fillStyle = '#9d4edd';
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }
        
        // Draw note rounded bar
        ctx.beginPath();
        ctx.roundRect(x, y, noteW, noteH, 4);
        ctx.fill();
    });
    
    // Reset shadow values
    ctx.shadowBlur = 0;
    
    // Draw vertical playback line
    if (currentPlaybackBeat !== null) {
        ctx.strokeStyle = '#00f5d4';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 8;
        
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
    }
}

// Canvas animation frame loop
function updateVisualizer() {
    if (!audioPlayer.paused && audioPlayer.duration) {
        const currentTime = audioPlayer.currentTime;
        const totalTime = audioPlayer.duration;
        
        // Calculate current beat position
        const currentBeat = (currentTime / totalTime) * totalDurationBeats;
        
        drawPianoRoll(currentBeat);
        
        // Time display formatted
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(totalTime)}`;
        
        animationFrameId = requestAnimationFrame(updateVisualizer);
    }
}

function formatTime(secs) {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Audio player callbacks
audioPlayer.addEventListener('play', () => {
    document.getElementById('audio-disc').classList.add('playing');
    updateVisualizer();
});

audioPlayer.addEventListener('pause', () => {
    document.getElementById('audio-disc').classList.remove('playing');
    cancelAnimationFrame(animationFrameId);
});

audioPlayer.addEventListener('ended', () => {
    document.getElementById('audio-disc').classList.remove('playing');
    cancelAnimationFrame(animationFrameId);
    drawPianoRoll(null); // Reset visualizer view
});

playBtn.addEventListener('click', () => {
    audioPlayer.play();
});

stopBtn.addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    drawPianoRoll(null);
    timeDisplay.textContent = `00:00 / ${formatTime(audioPlayer.duration || 0)}`;
});

// Trigger pipeline step
function triggerStep(step) {
    if (isRunning) return;
    
    // Compile parameters
    const params = {
        step: step,
        collect_limit: parseInt(document.getElementById('collect-limit').value),
        seq_length: parseInt(document.getElementById('seq-length').value),
        epochs: parseInt(document.getElementById('epochs').value),
        lr: parseFloat(document.getElementById('lr').value),
        batch_size: parseInt(document.getElementById('batch-size').value),
        gen_length: parseInt(document.getElementById('gen-length').value),
        temp: parseFloat(document.getElementById('temperature').value),
        bpm: parseInt(document.getElementById('bpm').value)
    };

    setSystemRunning(true, step);
    addLocalLog(`Sending API request to run step: ${step}...`);

    fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            addLocalLog(data.message);
        } else {
            addLocalLog(`API Error: ${data.message}`, 'error');
            setSystemRunning(false);
        }
    })
    .catch(err => {
        addLocalLog(`Network Error: ${err}`, 'error');
        setSystemRunning(false);
    });
}

function setSystemRunning(running, stepName = 'idle') {
    isRunning = running;
    const badge = document.getElementById('system-status');
    const dot = badge.querySelector('.status-dot');
    const text = badge.querySelector('.status-text');
    
    // Disable all run buttons while pipeline is active
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => btn.disabled = running);

    if (running) {
        dot.className = 'status-dot orange';
        text.textContent = `Running ${stepName.toUpperCase()}...`;
    } else {
        dot.className = 'status-dot green';
        text.textContent = 'System Ready';
    }
}

// Log box functions
const logsBox = document.getElementById('logs-box');

function addLocalLog(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}-log`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsBox.appendChild(entry);
    logsBox.scrollTop = logsBox.scrollHeight;
}

function clearLogs() {
    logsBox.innerHTML = '<div class="log-entry system-log">Console logs cleared. Ready...</div>';
}

// Poll state from Flask server
function pollStatus() {
    fetch('/api/status')
    .then(res => res.json())
    .then(status => {
        // Sync running state
        if (status.running !== isRunning) {
            setSystemRunning(status.running, status.current_step);
        }
        
        // Sync console logs
        if (status.logs) {
            // Append and scroll logs
            logsBox.innerHTML = status.logs.split('\n').map(line => {
                const isErr = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed');
                return `<div class="log-entry ${isErr ? 'error-log' : ''}">${line}</div>`;
            }).join('');
            logsBox.scrollTop = logsBox.scrollHeight;
        }
        
        // Sync training curves chart
        if (status.loss_history && status.loss_history.length > 0) {
            initChart(status.loss_history, status.accuracy_history);
        } else {
            // Hide chart if empty
            document.getElementById('chart-empty').style.display = 'flex';
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
        }
        
        // Sync available MIDI and WAV files
        const midSelect = status.available_midi;
        const wavSelect = status.available_wav;
        
        const trackTitle = document.getElementById('track-title');
        const trackMeta = document.getElementById('track-meta');
        
        const dmid = document.getElementById('download-mid');
        const dwav = document.getElementById('download-wav');
        
        if (wavSelect.length > 0) {
            const lastWav = wavSelect[wavSelect.length - 1];
            const lastMid = midSelect.length > 0 ? midSelect[midSelect.length - 1] : null;
            
            // If new track loaded or track audio changed
            const audioSrc = `/api/audio/${lastWav}`;
            if (audioPlayer.getAttribute('src') !== audioSrc) {
                audioPlayer.src = audioSrc;
                trackTitle.textContent = "Generated Bach Composition";
                trackMeta.textContent = `Loaded file: ${lastWav}`;
                
                // Enable player buttons
                playBtn.disabled = false;
                stopBtn.disabled = false;
                
                // Enable downloads
                dwav.href = audioSrc;
                dwav.classList.remove('disabled');
                
                if (lastMid) {
                    dmid.href = `/api/midi/${lastMid}`;
                    dmid.classList.remove('disabled');
                }
                
                // Parse and visualizer notes
                currentTokens = status.available_tokens;
                parseNoteTokens(currentTokens);
            }
        } else {
            // Reset player to empty state
            trackTitle.textContent = "No Track Loaded";
            trackMeta.textContent = "Generate music or run the pipeline to synthesize";
            audioPlayer.src = "";
            playBtn.disabled = true;
            stopBtn.disabled = true;
            dmid.classList.add('disabled');
            dwav.classList.add('disabled');
            parsedNotes = [];
            drawPianoRoll(null);
            document.getElementById('canvas-empty').style.display = 'flex';
        }
    })
    .catch(err => {
        console.error("Polling error:", err);
    });
}

// Start polling status
pollStatus();
pollingInterval = setInterval(pollStatus, 1000);
addLocalLog("System initialized. Monitoring Flask backend.");
