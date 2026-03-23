const mqtt = require('mqtt');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    transports: ['websocket', 'polling'] 
});

// --- CONFIG ---
const MQTT_URL = "mqtt://otplai.com";
// ZAROORI: Check kijiye ki ye URL aapke "New Deployment" wala hi hai na?
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwbxN7T3ulr753aNqu0QgYfvNM7sVWmG7hIbzbF3wEXZu2YiPAP2M0Om8XWU4sRpq5YxA/exec";

app.use(express.static(__dirname));

// 1. Dashboard Serve Karein
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. GET HISTORY (Proxy Route with Parameters Fix)
app.get('/get-history', async (req, res) => {
    try {
        console.log("📥 History Request:", req.query);
        let url = SCRIPT_URL;
        
        // Query parameters ko carefully attach karein
        let params = [];
        if (req.query.mode) params.push(`mode=${req.query.mode}`);
        if (req.query.start) params.push(`start=${req.query.start}`);
        if (req.query.end) params.push(`end=${req.query.end}`);
        
        if (params.length > 0) {
            url += (url.includes('?') ? '&' : '?') + params.join('&');
        }

        const response = await axios.get(url);
        console.log(`✅ ${response.data.length} rows fetched from Google Sheets`);
        res.json(response.data); 
    } catch (error) {
        console.log("❌ History Proxy Error:", error.message);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// --- MQTT SETUP ---
const client = mqtt.connect(MQTT_URL, { 
    username: "oxmo", 
    password: "123456789",
    keepalive: 60 
});

let dataBuffer = { temp: null, hum: null };

client.on('connect', () => {
    console.log("✅ Backend Bridge Connected to MQTT");
    client.subscribe("oxmo/ankit/secure/#");
});

client.on('message', (topic, message) => {
    const val = message.toString();
    if (topic.includes("temp")) dataBuffer.temp = val;
    if (topic.includes("hum")) dataBuffer.hum = val;

    if (dataBuffer.temp !== null && dataBuffer.hum !== null) {
        console.log(`📤 Syncing: T:${dataBuffer.temp} H:${dataBuffer.hum}`);
        io.emit('iot_update', { type: 'temp', val: dataBuffer.temp });
        io.emit('iot_update', { type: 'hum', val: dataBuffer.hum });

        axios.get(`${SCRIPT_URL}?temp=${dataBuffer.temp}&hum=${dataBuffer.hum}`)
            .catch(err => console.log("Sheets Sensor Log Error"));

        dataBuffer = { temp: null, hum: null };
    }
});

// --- SOCKET CONNECTION ---
io.on('connection', (socket) => {
    console.log("📱 Dashboard Connected to Socket");
    socket.on('led_command', (status) => {
        console.log("💡 LED Command Received:", status);
        client.publish("oxmo/ankit/secure/cmd", status); 
        axios.get(`${SCRIPT_URL}?led=${status}`)
            .then(() => console.log(`✅ LED ${status} Logged to Sheet`))
            .catch(err => console.log("❌ LED Log Error"));
    });
});

// --- SERVER LISTEN ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is live on port ${PORT}`);
});
