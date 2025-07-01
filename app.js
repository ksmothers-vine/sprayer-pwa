// State Management
let db;
let isSpraying = false;
let currentJob = null;
let currentTank = 1;
let tankVolume = 0;
let totalVolume = 0;
let currentTankPath = [];
let pathLine = null;
let currentMarker = null;
let map = null;

// Database Initialization
const initDB = new Promise((resolve) => {
  const request = indexedDB.open('SprayerDataDB', 2);

  request.onupgradeneeded = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('sensorData')) {
      db.createObjectStore('sensorData', { autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('jobs')) {
      db.createObjectStore('jobs', { keyPath: 'id' });
    }
  };

  request.onsuccess = (event) => {
    db = event.target.result;
    resolve(db);
  };
});

// Map Initialization
function initMap() {
  map = L.map('map').setView([38.0, -122.0], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  pathLine = L.polyline([], { color: '#3498db', weight: 5 }).addTo(map);
  currentMarker = L.marker([0, 0], {
    icon: L.divIcon({
      className: 'current-marker',
      html: '<div class="pulse"></div>',
      iconSize: [20, 20]
    })
  }).addTo(map);
}

// Update Map Display
function updateMap(lat, lng, gpa) {
  const newPoint = [lat, lng];
  
  if (isSpraying) {
    currentTankPath.push(newPoint);
    pathLine.setLatLngs(currentTankPath);
    
    // Color by application rate
    const color = gpa > 20 ? '#e74c3c' : gpa > 15 ? '#f39c12' : '#2ecc71';
    pathLine.setStyle({ color });
  }
  
  currentMarker.setLatLng(newPoint);
  map.setView(newPoint, 15, { animate: true, duration: 1 });
}

// Job Management
function startNewJob() {
  const jobId = `Job-${new Date().toISOString().slice(0, 10)}-${Math.floor(Math.random() * 1000)}`;
  currentJob = {
    id: jobId,
    startTime: new Date(),
    tanks: [],
    totalVolume: 0
  };
  
  document.getElementById('currentJob').textContent = jobId;
  document.getElementById('startJob').disabled = true;
  document.getElementById('endJob').disabled = false;
  document.getElementById('startSpraying').disabled = false;
  document.getElementById('exportJob').disabled = true;
}

function endCurrentJob() {
  if (currentJob) {
    currentJob.endTime = new Date();
    currentJob.totalVolume = totalVolume;
    
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    store.add(currentJob);
    
    resetJobState();
  }
}

function resetJobState() {
  currentJob = null;
  currentTank = 1;
  totalVolume = 0;
  tankVolume = 0;
  isSpraying = false;
  
  document.getElementById('currentJob').textContent = '--';
  document.getElementById('tankNumber').textContent = '1';
  document.getElementById('tankVolume').textContent = '0';
  document.getElementById('totalVolume').textContent = '0';
  document.getElementById('startJob').disabled = false;
  document.getElementById('endJob').disabled = true;
  document.getElementById('startSpraying').disabled = true;
  document.getElementById('stopSpraying').disabled = true;
  document.getElementById('exportJob').disabled = true;
}

// Tank Management
function startTank() {
  if (!currentJob) return;
  
  const tankId = currentJob.tanks.length + 1;
  currentJob.tanks.push({
    id: tankId,
    startTime: new Date(),
    path: [],
    volume: 0
  });
  
  isSpraying = true;
  currentTankPath = [];
  tankVolume = 0;
  
  document.getElementById('tankNumber').textContent = tankId;
  document.getElementById('tankVolume').textContent = '0';
  document.getElementById('stopSpraying').disabled = false;
  document.getElementById('startSpraying').disabled = true;
}

function stopTank() {
  if (!currentJob || currentJob.tanks.length === 0) return;
  
  isSpraying = false;
  const currentTankObj = currentJob.tanks[currentJob.tanks.length - 1];
  currentTankObj.endTime = new Date();
  currentTankObj.volume = tankVolume;
  currentTankObj.path = [...currentTankPath];
  
  document.getElementById('stopSpraying').disabled = true;
  document.getElementById('startSpraying').disabled = false;
  document.getElementById('exportJob').disabled = false;
}

// Data Export
async function exportJobData() {
  if (!currentJob) return;
  
  const zip = new JSZip();
  const jobsFolder = zip.folder(`spray_job_${currentJob.id}`);
  
  // Job metadata
  jobsFolder.file('job_summary.json', JSON.stringify({
    id: currentJob.id,
    startTime: currentJob.startTime,
    endTime: currentJob.endTime,
    totalVolume: currentJob.totalVolume,
    numberOfTanks: currentJob.tanks.length
  }, null, 2));
  
  // Tank data
  currentJob.tanks.forEach(tank => {
    let csv = 'Latitude,Longitude,Timestamp\n';
    tank.path.forEach(point => {
      csv += `${point[0]},${point[1]},${new Date().toISOString()}\n`;
    });
    jobsFolder.file(`tank_${tank.id}.csv`, csv);
  });
  
  // Generate and download
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `spray_job_${currentJob.id}.zip`);
}

// Bluetooth Connection
async function connectToSprayer() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['0000ff00-0000-1000-8000-00805f9b34fb']
    });
    
    document.getElementById('status').textContent = 'Connecting...';
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('0000ff01-0000-1000-8000-00805f9b34fb');
    
    document.getElementById('status').textContent = 'Connected';
    characteristic.startNotifications();
    
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const data = new TextDecoder().decode(event.target.value);
      const [lat, lon, gpm, gpa] = data.split(',').map(Number);
      
      // Update UI
      document.getElementById('gpm').textContent = gpm.toFixed(1);
      document.getElementById('gpa').textContent = gpa.toFixed(1);
      document.getElementById('gps').textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      
      // Update volumes if spraying
      if (isSpraying && currentJob) {
        tankVolume += gpm / 60;
        totalVolume += gpm / 60;
        currentJob.totalVolume = totalVolume;
        currentJob.tanks[currentJob.tanks.length - 1].volume = tankVolume;
        
        document.getElementById('tankVolume').textContent = tankVolume.toFixed(1);
        document.getElementById('totalVolume').textContent = totalVolume.toFixed(1);
      }
      
      updateMap(lat, lon, gpa);
    });
  } catch (error) {
    document.getElementById('status').textContent = `Error: ${error}`;
    console.error(error);
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  await initDB;
  initMap();
  
  // Event Listeners
  document.getElementById('startJob').addEventListener('click', startNewJob);
  document.getElementById('endJob').addEventListener('click', endCurrentJob);
  document.getElementById('startSpraying').addEventListener('click', startTank);
  document.getElementById('stopSpraying').addEventListener('click', stopTank);
  document.getElementById('connect').addEventListener('click', connectToSprayer);
  document.getElementById('exportJob').addEventListener('click', exportJobData);
  
  document.getElementById('download').addEventListener('click', async () => {
    if (!db) return;
    const tx = db.transaction('sensorData', 'readonly');
    const store = tx.objectStore('sensorData');
    const allData = await store.getAll();
    
    let csv = 'Timestamp,Latitude,Longitude,GPM,GPA\n';
    allData.result.forEach(entry => {
      csv += `${new Date(entry.timestamp).toISOString()},${entry.lat},${entry.lon},${entry.gpm},${entry.gpa}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    saveAs(blob, 'sprayer_data.csv');
  });
});