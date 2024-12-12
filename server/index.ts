import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Parse JSON bodies
app.use(express.json());

// Debug middleware to log all requests
app.use((req: Request, res: Response, next) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    next();
});

// Root endpoint with debug logging
app.get('/', (req: Request, res: Response) => {
    console.log('Root endpoint hit');
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Webhook endpoint with detailed logging
app.post('/webhook', (req: Request, res: Response) => {
    console.log('Webhook endpoint hit');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Send immediate response
    res.status(200).json({
        status: 'ok',
        message: 'Webhook received',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 5000;

// Start server with detailed error handling
const server = app.listen(PORT, '0.0.0.0', (error?: Error) => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`[${new Date().toISOString()}] Server Details:`);
    console.log(`🚀 Running on port: ${PORT}`);
    console.log(`📍 Bound to: http://0.0.0.0:${PORT}`);
    console.log('✅ Ready to accept connections');
}).on('error', (error) => {
    console.error('[ERROR] Server error:', error);
    process.exit(1);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
