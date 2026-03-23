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

// Static files serve karne ke liye
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- CONFIG ---
const MQTT_URL = "mqtt://otplai.com";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyeTZdTDRnE6A1rQI2VjQUrv53T30yy5tpIEo33onG2TX20azJRpxciHQ7Js5NXVhw56w/exec";

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

// 1. ESP32 se Data Dashboard aur Sheets tak bhejna
client.on('message', (topic, message) => {
    const val = message.toString();
    
    if (topic.includes("temp")) dataBuffer.temp = val;
    if (topic.includes("hum")) dataBuffer.hum = val;

    // Jab dono mil jayein tabhi Dashboard aur Sheets ko bhejo
    if (dataBuffer.temp !== null && dataBuffer.hum !== null) {
        console.log(`📤 Syncing: T:${dataBuffer.temp} H:${dataBuffer.hum}`);
        
        // Dashboard ko data bhejo (Correct Format)
        io.emit('iot_update', { type: 'temp', val: dataBuffer.temp });
        io.emit('iot_update', { type: 'hum', val: dataBuffer.hum });

        // Google Sheets mein save karein
        axios.get(`${SCRIPT_URL}?temp=${dataBuffer.temp}&hum=${dataBuffer.hum}`)
            .catch(err => console.log("Sheets Save Error"));

        dataBuffer = { temp: null, hum: null }; // Clear buffer
    }
});

// 2. DASHBOARD SE COMMAND ESP32 TAK BHEJNA
io.on('connection', (socket) => {
    console.log("📱 Dashboard Connected to Socket");

    socket.on('led_command', (status) => {
        console.log("💡 LED Command Received:", status);
        client.publish("oxmo/ankit/secure/cmd", status); 
    });
});

// Render Port Fix
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is live on port ${PORT}`);
});
