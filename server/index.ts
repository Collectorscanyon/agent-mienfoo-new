import express from 'express';
import bodyParser from 'body-parser';
import type { Request, Response } from 'express';

const app = express();
const PORT = 5000;

// Basic request logging
app.use((req: Request, res: Response, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`, {
        headers: req.headers,
        body: req.body
    });
    next();
});

// Middleware to parse JSON and form-urlencoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Health check endpoint
app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Webhook endpoint
app.post('/webhook', (req: Request, res: Response) => {
    try {
        console.log('Received webhook data:', req.body);
        res.status(200).json({ message: 'Webhook received successfully' });
    } catch (error) {
        console.error('Webhook error:', error);
        // Still send 200 OK to acknowledge receipt
        res.status(200).json({ message: 'Webhook acknowledged' });
    }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});