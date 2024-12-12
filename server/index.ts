import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// Basic logging
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// Health check
app.get('/', (_req: Request, res: Response) => {
    res.send('OK');
});

// Most basic webhook handler possible
app.post('/webhook', (_req: Request, res: Response) => {
    // Immediately send 200 OK
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
