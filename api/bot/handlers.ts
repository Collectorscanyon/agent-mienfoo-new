import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Verify required environment variables
const requiredVars = ['NEYNAR_API_KEY', 'OPENAI_API_KEY', 'SIGNER_UUID', 'BOT_USERNAME'];
const missingVars = requiredVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Initialize API clients
const neynar = new NeynarAPIClient(process.env.NEYNAR_API_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize state tracking
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
  try {
    console.log('Generating response for:', text);
    
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

    let response = completion.choices[0]?.message?.content || 
      "I'm processing your request. Please try again shortly. /collectorscanyon";
    
    // Ensure response ends with /collectorscanyon
    if (!response.includes('/collectorscanyon')) {
      response += ' /collectorscanyon';
    }
    
    console.log('Generated response:', response);
    return response;
  } catch (error) {
    console.error('Error generating response:', error);
    return "I'm having trouble processing your request right now. Please try again later. /collectorscanyon";
  }
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
  const timestamp = new Date().toISOString();

  console.log('Webhook received:', {
    requestId,
    timestamp,
    type: event.body?.type,
    data: JSON.stringify(event.body?.data).substring(0, 200)
  });

  try {
    if (!event.body?.type || !event.body?.data) {
      console.error('Invalid webhook data structure:', {
        requestId,
        body: event.body
      });
      return;
    }

    const { type, data: cast } = event.body;
    
    if (type !== 'cast.created') {
      console.log('Ignoring non-cast event:', {
        requestId,
        type
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
    const isBotMentioned = cast.text?.toLowerCase().includes('@mienfoo.eth') ||
      cast.mentioned_profiles?.some((profile: any) => 
        profile.username?.toLowerCase() === process.env.BOT_USERNAME?.toLowerCase());

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

      try {
        // Like the mention first
        console.log('Attempting to like mention:', { castHash: cast.hash });
        await neynar.publishReaction({
          signerUuid: process.env.SIGNER_UUID!,
          reactionType: 'like',
          target: cast.hash
        });
        console.log('Successfully liked mention');

        // Generate response
        const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
        console.log('Generating response for:', { cleanedMessage });
        const response = await generateBotResponse(cleanedMessage);
        console.log('Generated response:', { response });
        
        // Post the reply
        console.log('Attempting to post reply:', { 
          response,
          parentHash: cast.hash,
          author: cast.author.username 
        });
        await postReply(response, cast.hash, cast.author.username);
        console.log('Successfully posted reply');

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
