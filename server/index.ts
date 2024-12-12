import express from 'express';
import type { Request, Response, NextFunction } from 'express';

interface ExtendedRequest extends Request {
    rawBody?: Buffer;
}

const app = express();

// Basic middleware for handling both JSON and raw bodies
app.use(express.json({
    verify: (req: ExtendedRequest, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
    }
}));
app.use(express.raw({ type: '*/*' }));

// Log all requests
app.use((req: ExtendedRequest, res: Response, next: NextFunction) => {
    console.log('Request received:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: req.body
    });
    next();
});

// Health check for ngrok
app.get('/', (_req: Request, res: Response) => {
    res.send('OK'); // Simple response for ngrok verification
});

// Webhook handler with immediate response
app.post('/webhook', (req: ExtendedRequest, res: Response) => {
    // Send immediate 200 response
    res.status(200).send('OK');
    
    // Process webhook after response
    try {
        // Log the webhook details
        console.log('Webhook processed:', {
            timestamp: new Date().toISOString(),
            contentType: req.headers['content-type'],
            body: req.body instanceof Buffer ? req.body.toString() : req.body,
            rawBody: req.rawBody?.toString()
        });
    } catch (error) {
        // Log error but don't send response (already sent 200)
        console.error('Error processing webhook:', {
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
