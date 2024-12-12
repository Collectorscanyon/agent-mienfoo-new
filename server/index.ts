import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.method === 'POST') {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Health check endpoint
app.get('/', (_req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString() 
    });
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
    try {
        // Send immediate response
        res.status(200).json({ 
            status: 'ok',
            message: 'Webhook received',
            timestamp: new Date().toISOString()
        });

        // Process webhook asynchronously
        const { type, cast } = req.body;
        console.log('Webhook received:', { type, cast });

    } catch (error) {
        console.error('Webhook processing error:', error);
        // No need to send error response since we already sent 200
    }
});

const PORT = process.env.PORT || 5000;

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] Server started:`);
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`📍 Bound to: http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server startup error:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    server.close(() => {
        console.log('Server shutdown complete');
        process.exit(0);
    });
});
