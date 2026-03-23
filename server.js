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

// NEW: Render khud data fetch karke Dashboard ko dega (No Fetch Error)
app.get('/get-history', async (req, res) => {
    try {
        let url = SCRIPT_URL;
        // Agar filter parameters hain toh unhe add karo
        if (req.query.start && req.query.end) {
            url += `?start=${req.query.start}&end=${req.query.end}`;
        }
        const response = await axios.get(url);
        res.json(response.data); // Render data browser ko bhej dega
    } catch (error) {
        console.log("History Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// --- CONFIG ---
const MQTT_URL = "mqtt://otplai.com";
// ZAROORI: Yahan wahi URL rakhein jo Google Script ki 'New Deployment' se mila hai
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3krZni8yKpjmbwUwOeWJxWgGOfaKdJHiPqAQvaKqHsyANFzgB-l6__AARhAw5JltojQ/exec";

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
        console.log(`📤 Syncing Sensor Data: T:${dataBuffer.temp} H:${dataBuffer.hum}`);
        
        // Dashboard ko data bhejo
        io.emit('iot_update', { type: 'temp', val: dataBuffer.temp });
        io.emit('iot_update', { type: 'hum', val: dataBuffer.hum });

        // Google Sheets mein Sensor data save karein
        axios.get(`${SCRIPT_URL}?temp=${dataBuffer.temp}&hum=${dataBuffer.hum}`)
            .catch(err => console.log("Sheets Sensor Log Error"));

        dataBuffer = { temp: null, hum: null }; // Clear buffer
    }
});

// 2. DASHBOARD SE COMMAND ESP32 TAK BHEJNA + SHEETS LOGGING
io.on('connection', (socket) => {
    console.log("📱 Dashboard Connected to Socket");

    socket.on('led_command', (status) => {
        console.log("💡 LED Command Received:", status);
        
        // A. ESP32 ko control karne ke liye MQTT par bhejo
        client.publish("oxmo/ankit/secure/cmd", status); 

        // B. Google Sheets mein LED status log karne ke liye bhejo
        axios.get(`${SCRIPT_URL}?led=${status}`)
            .then(() => console.log(`✅ LED ${status} Logged in Sheets`))
            .catch(err => console.log("❌ Sheets LED Log Error"));
    });
});

// Render Port Fix
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is live on port ${PORT}`);
});
