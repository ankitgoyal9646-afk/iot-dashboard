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

// --- CONFIG (Sabse Pehle) ---
const MQTT_URL = "mqtt://otplai.com";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3krZni8yKpjmbwUwOeWJxWgGOfaKdJHiPqAQvaKqHsyANFzgB-l6__AARhAw5JltojQ/exec";

// Static files serve karne ke liye
app.use(express.static(__dirname));

// 1. Dashboard Serve Karein
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. GET HISTORY (Proxy Route)
app.get('/get-history', async (req, res) => {
    try {
        console.log("📥 Dashboard requested history via Render Proxy");
        let url = SCRIPT_URL;
        if (req.query.start && req.query.end) {
            url += `?start=${req.query.start}&end=${req.query.end}`;
        }
        const response = await axios.get(url);
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
        console.log("💡 LED Command:", status);
        client.publish("oxmo/ankit/secure/cmd", status); 
        axios.get(`${SCRIPT_URL}?led=${status}`)
            .then(() => console.log(`✅ LED ${status} Logged`))
            .catch(err => console.log("❌ LED Log Error"));
    });
});

// --- SERVER LISTEN ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is live on port ${PORT}`);
});
