const express = require('express');
const app = express();
app.use(express.json());

// Basic request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Root route for basic health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Simplified webhook handler
app.post('/webhook', (req, res) => {
    // Send 200 OK immediately
    res.status(200).send('OK');
    
    console.log('Webhook received:', {
        timestamp: new Date().toISOString(),
        body: req.body
    });
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});