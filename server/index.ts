import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Basic middleware
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Root endpoint for health check
app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Bare minimum webhook handler
app.post('/webhook', (req: Request, res: Response) => {
    // Log request received
    console.log('Webhook request received');
    
    // Send immediate response without any processing
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Listening on http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});

// Add graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
