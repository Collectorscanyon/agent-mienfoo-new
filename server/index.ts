import express from 'express';
import type { Request, Response, NextFunction } from 'express';

interface ExtendedRequest extends Request {
    rawBody?: Buffer;
}

const app = express();

// Configure body parsing with raw body storage
app.use(express.json({
    verify: (req: ExtendedRequest, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
    }
}));

// Detailed request logging middleware
app.use((req: ExtendedRequest, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] Request:`, {
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length']
    });
    next();
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Webhook endpoint with proper error handling
app.post('/webhook', (req: ExtendedRequest, res: Response) => {
    try {
        // Log webhook details before processing
        console.log('Webhook received:', {
            timestamp: new Date().toISOString(),
            contentType: req.headers['content-type'],
            body: req.body,
            rawBody: req.rawBody?.toString()
        });

        // Send immediate success response
        res.status(200).json({ 
            status: 'ok',
            message: 'Webhook received',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Webhook error:', error);
        // Since we're catching parsing errors, we can send an error response
        res.status(400).json({ 
            error: 'Invalid request',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${new Date().toISOString()}] Server running on http://0.0.0.0:${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
