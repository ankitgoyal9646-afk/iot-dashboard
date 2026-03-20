const mqtt = require('mqtt');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- CONFIG ---
const MQTT_URL = "mqtt://otplai.com";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1_i_YidrwDdyhPmpN7uvQF0cZ4LzK_uNcrkxnD4P6OTqdsnoJl-A_o6y3Fnq9vxvyyQ/exec";

const client = mqtt.connect(MQTT_URL, { username: "oxmo", password: "123456789" });

let dataBuffer = { temp: null, hum: null };

client.on('connect', () => {
    console.log("✅ Backend Bridge Connected to MQTT");
    client.subscribe("oxmo/ankit/secure/#");
});

client.on('message', (topic, message) => {
    const val = message.toString();
    if (topic.includes("temp")) dataBuffer.temp = val;
    if (topic.includes("hum")) dataBuffer.hum = val;

    // Jab dono values mil jayein tabhi Dashboard aur Sheets ko bhejo
    if (dataBuffer.temp !== null && dataBuffer.hum !== null) {
        console.log(`📤 Syncing: T:${dataBuffer.temp} H:${dataBuffer.hum}`);
        
        // 1. Dashboard (Real-time)
        io.emit('iot_update', { temp: dataBuffer.temp, hum: dataBuffer.hum });

        // 2. Google Sheets (Auto Logging)
        axios.get(`${SCRIPT_URL}?temp=${dataBuffer.temp}&hum=${dataBuffer.hum}`)
            .then(() => console.log("✅ Saved to Google Sheets"))
            .catch(err => console.log("❌ Sheets Error: " + err.message));

        dataBuffer = { temp: null, hum: null }; // Reset Buffer
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));