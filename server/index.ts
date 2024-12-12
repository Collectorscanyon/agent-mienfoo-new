import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// Basic body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging with body
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log('Request received:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        body: req.body
    });
    next();
});

// Health check
app.get('/', (_req: Request, res: Response) => {
    res.send('OK');
});

// Webhook handler with logging
app.post('/webhook', (req: Request, res: Response) => {
    // Log webhook details
    console.log('Webhook payload:', {
        timestamp: new Date().toISOString(),
        body: req.body,
        headers: {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length']
        }
    });
    
    // Immediately send 200 OK
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
