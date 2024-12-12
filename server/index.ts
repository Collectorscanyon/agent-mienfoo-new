import express from 'express';
import type { Request, Response } from 'express';

const app = express();

// Accept any content type
app.use(express.raw({ type: '*/*' }));

// Health check
app.get('/', (_req: Request, res: Response) => {
    res.send('OK');
});

// Webhook handler - accept anything
app.post('/webhook', (req: Request, res: Response) => {
    console.log('Raw request data:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body instanceof Buffer ? req.body.toString() : req.body
    });
    
    // Immediately send 200 OK
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
