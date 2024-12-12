import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// Add logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.method === 'POST') {
        console.log('Headers:', req.headers);
        console.log('Body:', req.body);
    }
    next();
});

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    console.log('Health check endpoint hit');
    res.json({ status: 'ok', message: 'Server is running' });
});

// Add specific webhook logging
app.post('/webhook', (req: Request, res: Response) => {
    console.log('Webhook called:', {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body
    });
    
    // Send immediate response
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
