import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response } from 'express';

const app = express();
const PORT = 5000;

// Detailed request logging middleware
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

// Parse JSON bodies
app.use(bodyParser.json({ strict: false }));

// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ 
    extended: true,
    limit: '10mb'
}));

// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Webhook endpoint with enhanced logging
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
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('Ready to handle webhook requests');
});
