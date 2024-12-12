import express from 'express';
import type { Request, Response, NextFunction } from 'express';

interface ExtendedRequest extends Request {
    rawBody?: string;
}

const app = express();

// Accept all content types and collect raw data
app.use((req: ExtendedRequest, res: Response, next: NextFunction) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
        data += chunk;
    });
    req.on('end', () => {
        req.rawBody = data;
        next();
    });
});

// Log all requests
app.use((req: ExtendedRequest, _res: Response, next: NextFunction) => {
    console.log('Request received:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers: req.headers
    });
    next();
});

// Root endpoint for ngrok verification
app.get('/', (_req: Request, res: Response) => {
    res.send('OK');
});

// Accept any POST request to webhook
app.post('/webhook', (req: ExtendedRequest, res: Response) => {
    // Log request details
    console.log('Webhook received:', {
        timestamp: new Date().toISOString(),
        headers: req.headers,
        rawBody: req.rawBody
    });
    
    // Always respond with 200 OK
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
