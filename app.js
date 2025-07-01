// Database for offline storage
let db;
const dbRequest = indexedDB.open('SprayerDataDB', 1);

dbRequest.onupgradeneeded = (event) => {
  db = event.target.result;
  db.createObjectStore('sensorData', { autoIncrement: true });
};

dbRequest.onsuccess = (event) => {
  db = event.target.result;
};

// Map setup
const map = L.map('map').setView([38.0, -122.0], 10);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);
let pathLayer = L.polyline([], { color: 'blue' }).addTo(map);

// Bluetooth connection
document.getElementById('connect').addEventListener('click', async () => {
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
      const [lat, lon, gpm, gpa] = data.split(',');
      
      // Update UI
      document.getElementById('gpm').textContent = gpm;
      document.getElementById('gpa').textContent = gpa;
      document.getElementById('gps').textContent = `${lat}, ${lon}`;
      
      // Update map
      const newPoint = [parseFloat(lat), parseFloat(lon)];
      pathLayer.addLatLng(newPoint);
      map.setView(newPoint, 15);
      
      // Store data
      if (db) {
        const tx = db.transaction('sensorData', 'readwrite');
        const store = tx.objectStore('sensorData');
        store.add({ timestamp: Date.now(), lat, lon, gpm, gpa });
      }
    });
  } catch (error) {
    document.getElementById('status').textContent = `Error: ${error}`;
  }
});

// Download logs
document.getElementById('download').addEventListener('click', async () => {
  if (!db) return;
  
  const tx = db.transaction('sensorData', 'readonly');
  const store = tx.objectStore('sensorData');
  const allData = await store.getAll();
  
  let csv = 'Timestamp,Latitude,Longitude,GPM,Gallons/Acre\n';
  allData.result.forEach(entry => {
    csv += `${entry.timestamp},${entry.lat},${entry.lon},${entry.gpm},${entry.gpa}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sprayer_logs.csv';
  a.click();
});