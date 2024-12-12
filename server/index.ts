import express, { Request, Response, NextFunction } from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.method === 'POST') {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Server Error:', {
        timestamp: new Date().toISOString(),
        error: err.message,
        stack: err.stack,
        path: req.path
    });
    res.status(500).json({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString() 
    });
});

// Webhook endpoint
app.post('/webhook', (req: Request, res: Response) => {
    try {
        // Send immediate response to prevent timeouts
        res.status(200).json({ 
            status: 'ok',
            message: 'Webhook received',
            timestamp: new Date().toISOString()
        });

        // Process webhook asynchronously
        const { type, cast } = req.body;
        console.log('Webhook received:', { 
            timestamp: new Date().toISOString(),
            type, 
            cast 
        });

    } catch (error) {
        console.error('Webhook processing error:', {
            timestamp: new Date().toISOString(),
            error
        });
        // Already sent 200 OK, just log the error
    }
});

const PORT = process.env.PORT || 5000;

// Start server with proper error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] Server started:`);
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`📍 Bound to: http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server startup error:', error);
    process.exit(1);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server shutdown complete');
        process.exit(0);
    });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    server.close(() => {
        console.log('Server shutdown due to uncaught exception');
        process.exit(1);
    });
});
