import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response } from 'express';
import { handleWebhook } from './bot/handlers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Configure body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log('Request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook endpoint
app.post('/webhook', async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log('Webhook received:', {
    requestId,
    timestamp,
    method: req.method,
    path: req.path,
    body: req.body
  });

  // Check if the payload includes required fields
  const { type, data } = req.body;
  if (!type || !data) {
    console.log('Invalid webhook payload:', { requestId, timestamp, type, hasData: !!data });
    return res.status(400).send('Missing required fields in request body');
  }

  // Send immediate 200 OK response to acknowledge receipt
  res.status(200).send('Webhook event processed successfully!');

  try {
    if (type === 'cast.created' && data.text) {
      console.log('Processing cast:', {
        requestId,
        timestamp,
        text: data.text,
        hash: data.hash,
        author: data.author?.username
      });

      // Enhanced bot mention detection with username verification
      const botMentions = ['@mienfoo.eth'];
      if (process.env.BOT_USERNAME) {
        botMentions.push(`@${process.env.BOT_USERNAME}`);
      }
      
      const isBotMentioned = botMentions.some(mention => 
        data.text.toLowerCase().includes(mention.toLowerCase())
      );
      
      console.log('Mention detection:', {
        requestId,
        timestamp,
        isBotMentioned,
        botMentions,
        text: data.text
      });
      
      if (isBotMentioned) {
        console.log('Bot mention detected:', {
          requestId,
          timestamp,
          castHash: data.hash,
          author: data.author?.username
        });

        // Clean the message text by removing mentions
        const cleanedText = data.text.replace(/@[\w.]+/g, '').trim();
        console.log('Cleaned message:', {
          requestId,
          timestamp,
          original: data.text,
          cleaned: cleanedText
        });
        
        try {
          // Import and generate response using OpenAI
          const { generateBotResponse } = await import('./bot/openai');
          console.log('Calling OpenAI API:', {
            requestId,
            timestamp,
            prompt: cleanedText
          });
          
          const response = await generateBotResponse(cleanedText);
          console.log('OpenAI response received:', {
            requestId,
            timestamp,
            response
          });
          
          if (!response) {
            throw new Error('No response received from OpenAI');
          }
          
          // Format the full reply text
          const replyText = `@${data.author?.username || 'user'} ${response}`;
          console.log('Prepared reply:', {
            requestId,
            timestamp,
            castHash: data.hash,
            replyText
          });

          // Import and use handler to send reply
          const { handleWebhook } = await import('./bot/handlers');
          await handleWebhook({
            type: 'reply',
            data: {
              parentHash: data.hash,
              text: replyText,
              author: data.author
            }
          });
          
          console.log('Reply sent successfully:', {
            requestId,
            timestamp,
            parentHash: data.hash,
            replyText
          });
          
        } catch (error) {
          console.error('Error in response generation:', {
            requestId,
            timestamp,
            error: error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            } : error,
            castHash: data.hash,
            cleanedText
          });
        }
      } else {
        console.log('No bot mention detected:', {
          requestId,
          timestamp,
          castHash: data.hash,
          text: data.text
        });
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      type,
      data
    });
  }
});

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Convert Vercel's request to Express compatible format
  const expressReq = Object.assign(req, {
    get: (header: string) => req.headers[header],
    header: (header: string) => req.headers[header],
    accepts: () => true, // Simplified accepts implementation
  });
  
  return new Promise((resolve, reject) => {
    app(expressReq as any, res, (err?: any) => {
      if (err) {
        console.error('Express error:', err);
        reject(err);
      } else {
        resolve(undefined);
      }
    });
  });
}

// Start local server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  const port = parseInt(process.env.PORT || '5000', 10);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
    console.log('Bot configuration:', {
      username: process.env.BOT_USERNAME,
      fid: process.env.BOT_FID,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID
    });
  });
}