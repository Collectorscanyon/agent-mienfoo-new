const express = require('express');
const app = express();

// Basic middleware
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Test endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Simple webhook endpoint
app.post('/webhook', (req, res) => {
    console.log('Webhook received:', req.body);
    res.status(200).send('OK');
});

// Start server
app.listen(5000, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:5000');
});
