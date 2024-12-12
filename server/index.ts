import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// Detailed request logging
app.use((req: Request, res: Response, next) => {
    console.log('Request details:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        body: req.body
    });
    next();
});

// Parse JSON bodies (with less strict parsing)
app.use(bodyParser.json({ 
    strict: false,
    limit: '10mb'
}));

// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ 
    extended: true,
    limit: '10mb'
}));

// Error handling for parsing errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
        console.error('Parse error:', err);
        return res.status(200).json({ 
            status: 'error',
            message: 'Invalid request format'
        });
    }
    next(err);
});

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Webhook endpoint with enhanced logging and error handling
app.post('/webhook', (req: Request, res: Response) => {
    try {
        // Log the parsed request data
        console.log('Webhook received:', {
            timestamp: new Date().toISOString(),
            headers: {
                'content-type': req.headers['content-type'],
                'content-length': req.headers['content-length']
            },
            body: req.body
        });

        // Send successful response
        res.status(200).json({ 
            status: 'success',
            message: 'Webhook received successfully',
            receivedData: req.body
        });
    } catch (error) {
        console.error('Webhook error:', error);
        // Still return 200 to acknowledge receipt
        res.status(200).json({ 
            status: 'acknowledged',
            message: 'Webhook processed with errors'
        });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Ready to handle webhook requests');
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});
