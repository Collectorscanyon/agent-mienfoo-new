import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: '*/*' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log('Incoming request:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Webhook endpoint
app.post('/webhook', (req: Request, res: Response) => {
    try {
        console.log('Webhook received:', {
            timestamp: new Date().toISOString(),
            body: req.body,
            contentType: req.headers['content-type']
        });
        
        // Always respond with 200 OK
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        // Still send 200 OK to acknowledge receipt
        res.status(200).send('OK');
    }
});

// Parse errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
        console.error('Parse error:', err);
        return res.status(400).json({ error: 'Bad request' });
    }
    next(err);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Ready to handle webhook requests');
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
