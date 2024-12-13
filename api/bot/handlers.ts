import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import { logger } from '../utils/logger';

// Initialize API clients
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_API_KEY!,
  apiSecret: process.env.NEYNAR_API_SECRET,
  signerUuid: process.env.SIGNER_UUID!
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize state tracking for deduplication
const processedMentions = new Set<string>();
const processedThreads = new Map<string, {
  lastResponseTime: number;
  responses: Set<string>;
}>();

// Cleanup old entries periodically
setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [threadHash, data] of processedThreads.entries()) {
    if (data.lastResponseTime < tenMinutesAgo) {
      processedThreads.delete(threadHash);
    }
  }
  // Also cleanup old mentions
  processedMentions.clear();
}, 10 * 60 * 1000);

// Helper function to generate bot response
async function generateBotResponse(text: string): Promise<string> {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      logger.info('Generating response:', {
        attempt: i + 1,
        text,
        timestamp: new Date().toISOString()
      });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are Mienfoo, a knowledgeable Pokémon card collector bot. 
Keep responses concise (max 280 chars), friendly, and focused on collecting advice. 
Always include /collectorscanyon in your responses.`
          },
          { role: "user", content: text }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      let response = completion.choices[0]?.message?.content;
      
      if (!response) {
        throw new Error('Empty response from OpenAI');
      }

      // Ensure response ends with /collectorscanyon
      if (!response.includes('/collectorscanyon')) {
        response += ' /collectorscanyon';
      }
      
      logger.info('Generated response:', {
        text: response,
        timestamp: new Date().toISOString()
      });
      return response;

    } catch (error) {
      lastError = error;
      logger.error('Error generating response:', {
        attempt: i + 1,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      });
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  return "I'm having trouble processing your request right now. Please try again later. /collectorscanyon";
}

// Post response to Farcaster with enhanced retry logic
async function postReply(text: string, parentHash: string, authorUsername: string): Promise<void> {
  const maxRetries = 3;
  let lastError;
  const requestId = Math.random().toString(36).substring(7);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const replyText = `@${authorUsername} ${text}`.trim();
      
      console.log('Posting reply:', {
        requestId,
        timestamp: new Date().toISOString(),
        attempt: i + 1,
        text: replyText.substring(0, 50) + '...',
        parentHash
      });

      // Add reaction (like) first
      try {
        await neynar.publishReaction({
          signerUuid: process.env.SIGNER_UUID!,
          reactionType: 'like',
          target: parentHash
        });
        console.log('Successfully liked parent cast');
      } catch (error) {
        console.error('Error liking parent cast:', error);
        // Continue with reply even if like fails
      }

      // Post the reply
      const response = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        text: replyText,
        parent: parentHash,
        channelId: 'collectorscanyon'
      });
      
      console.log('Reply posted successfully:', {
        requestId,
        replyHash: response.cast.hash,
        parentHash,
        timestamp: new Date().toISOString()
      });
      return;
    } catch (error) {
      lastError = error;
      console.error('Error posting reply:', {
        requestId,
        attempt: i + 1,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Exponential backoff
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Main webhook handler
export async function handleWebhook(event: any) {
  const requestId = Math.random().toString(36).substring(7);
  
  logger.info('Webhook received:', {
    requestId,
    type: event.body?.type,
    data: {
      hash: event.body?.data?.hash,
      text: event.body?.data?.text,
      author: event.body?.data?.author?.username
    }
  });

  try {
    const { type, data } = event.body;
    
    // Only handle cast.created events
    if (type !== 'cast.created') {
      logger.info('Ignoring non-cast event:', { type });
      return;
    }

    // Skip if already processed
    if (processedMentions.has(data.hash)) {
      logger.info('Skipping duplicate mention:', {
        requestId,
        hash: data.hash
      });
      return;
    }
    
    if (type !== 'cast.created') {
      logger.info('Ignoring non-cast event:', {
        requestId,
        timestamp: new Date().toISOString(),
        type,
        body: JSON.stringify(event.body).substring(0, 200)
      });
      return;
    }

    if (!event.body?.data?.text || !event.body?.data?.hash) {
      logger.error('Invalid cast data structure:', {
        requestId,
        timestamp: new Date().toISOString(),
        data: JSON.stringify(event.body?.data)
      });
      return;
    }

    // Create unique identifier for this cast
    const castKey = `${cast.hash}-${cast.thread_hash || 'nothread'}`;
    
    // Skip if already processed
    if (processedMentions.has(cast.hash)) {
      console.log('Skipping duplicate mention:', {
        requestId,
        hash: cast.hash
      });
      return;
    }

    // Check for bot mention
    if (!data.text.toLowerCase().includes('@mienfoo.eth')) {
      logger.info('Bot not mentioned:', { hash: data.hash });
      return;
    }

    logger.info('Bot mention detected:', {
      requestId,
      cast: {
        hash: data.hash,
        text: data.text,
        author: data.author?.username
      }
    });

    console.log('Mention check:', {
      requestId,
      text: cast.text,
      isBotMentioned,
      mentionedProfiles: cast.mentioned_profiles
    });

    if (isBotMentioned) {
      console.log('Bot mention detected:', {
        requestId,
        cast: {
          hash: cast.hash,
          text: cast.text,
          author: cast.author?.username
        }
      });

      // Generate response
      logger.info('Generating response:', {
        requestId,
        prompt: data.text
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are Mienfoo, a knowledgeable Pokémon card collector bot. 
Your responses should be concise (max 280 chars), friendly, and focus on collecting advice and Pokémon card knowledge. 
Always end your responses with /collectorscanyon`
          },
          { role: "user", content: data.text }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      let response = completion.choices[0].message.content;
      if (!response?.endsWith('/collectorscanyon')) {
        response = `${response} /collectorscanyon`;
      }

      logger.info('Posting response:', {
        requestId,
        response,
        parentHash: data.hash
      });

      // Post response
      await neynar.publishCast(
        process.env.SIGNER_UUID!,
        response,
        { replyTo: data.hash }
      );

        // Only mark as processed after successful handling
        processedMentions.add(cast.hash);
        
        console.log('Successfully processed mention:', {
          requestId,
          hash: cast.hash,
          response
        });
      } catch (error) {
        console.error('Error processing mention:', {
          requestId,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : String(error),
          cast: cast.hash
        });
        // Don't throw error - we want to acknowledge webhook receipt
      }
    }
  } catch (error) {
    console.error('Error in webhook handler:', {
      requestId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });
    throw error;
  }
}
