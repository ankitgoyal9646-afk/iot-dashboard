const mqtt = require('mqtt');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path'); // Naya module joddna hai

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// --- SETTINGS FOR RENDER (INDEX.HTML DIKHANE KE LIYE) ---
app.use(express.static(__dirname)); // Static files (HTML, CSS) serve karne ke liye

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- MQTT & SHEETS CONFIG ---
const MQTT_URL = "mqtt://otplai.com";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz1_i_YidrwDdyhPmpN7uvQF0cZ4LzK_uNcrkxnD4P6OTqdsnoJl-A_o6y3Fnq9vxvyyQ/exec";

const client = mqtt.connect(MQTT_URL, { username: "oxmo", password: "123456789" });

let dataBuffer = { temp: null, hum: null };

client.on('connect', () => {
    console.log("✅ Backend Bridge Ready");
    client.subscribe("oxmo/ankit/secure/#");
});

client.on('message', (topic, message) => {
    const val = message.toString();
    if (topic.includes("temp")) dataBuffer.temp = val;
    if (topic.includes("hum")) dataBuffer.hum = val;

    if (dataBuffer.temp !== null && dataBuffer.hum !== null) {
        io.emit('iot_update', { temp: dataBuffer.temp, hum: dataBuffer.hum });
        axios.get(`${SCRIPT_URL}?temp=${dataBuffer.temp}&hum=${dataBuffer.hum}`)
            .catch(err => console.log("Sheets Error"));
        dataBuffer = { temp: null, hum: null };
    }
});

// RENDER APNA PORT DETA HAI, AGAR NAHI TOH 3000 USE KAREGA
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
