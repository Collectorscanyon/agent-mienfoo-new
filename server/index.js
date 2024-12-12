const express = require('express');
const { NeynarAPIClient } = require('@neynar/nodejs-sdk');
require('dotenv').config();

const app = express();
app.use(express.json());

// Basic error logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Initialize Neynar client simply
const neynar = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

// Basic health check
app.get('/', (req, res) => {
    res.json({ status: 'ok' });
});

// Simplified webhook handler
app.post('/webhook', (req, res) => {
    // Send immediate response
    res.status(200).send('OK');
    
    // Log webhook data
    console.log('Webhook received:', {
        timestamp: new Date().toISOString(),
        body: req.body
    });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
