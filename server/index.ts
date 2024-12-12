import express from 'express';
import type { Request, Response, NextFunction } from 'express';

interface RawBodyRequest extends Request {
    rawBody?: string;
}

const app = express();

// Raw body collection middleware
app.use((req: RawBodyRequest, res: Response, next: NextFunction) => {
    let data = '';
    req.setEncoding('utf8');
    
    req.on('data', chunk => {
        data += chunk;
    });
    
    req.on('end', () => {
        req.rawBody = data;
        console.log('Raw request data:', {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            headers: req.headers,
            rawBody: data
        });
        next();
    });
});

// Health check
app.get('/', (_req: Request, res: Response) => {
    res.send('OK');
});

// Webhook handler - accept anything
app.post('/webhook', (_req: Request, res: Response) => {
    // Immediately send 200 OK
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
