import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// Basic request logging
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
    console.log('Root endpoint hit');
    res.json({ status: 'ok', message: 'Server is running' });
});

// Webhook endpoint with immediate response
app.post('/webhook', (req: Request, res: Response) => {
    // Send 200 OK immediately
    res.status(200).send('OK');
    
    // Log after response sent
    console.log('Webhook hit:', {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        body: req.body
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
