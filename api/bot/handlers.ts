import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';

// Initialize API clients with proper configuration
const neynarConfig = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      "x-neynar-experimental": true,
    },
  },
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Track processed mentions to prevent duplicates
const processedMentions = new Set<string>();

// Clean up old mentions every 10 minutes
setInterval(() => {
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

// Post response to Farcaster with retry logic
async function postReply(text: string, parentHash: string, authorUsername: string): Promise<void> {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const replyText = `@${authorUsername} ${text}`;
      console.log('Attempting to post reply:', {
        text: replyText,
        parentHash,
        attempt: i + 1
      });

      await neynar.publishCast(
        process.env.SIGNER_UUID!,
        replyText,
        { replyTo: parentHash }
      );
      
      console.log('Successfully posted reply');
      return;
    } catch (error) {
      lastError = error;
      console.error(`Error posting reply (attempt ${i + 1}):`, error);
      // Exponential backoff
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
  }

  throw lastError;
}

// Main webhook handler
export async function handleWebhook(event: any) {
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();

  console.log('Processing webhook:', {
    requestId,
    timestamp,
    body: event.body,
    headers: {
      'x-neynar-signature': event.headers['x-neynar-signature'] ? 
        `${event.headers['x-neynar-signature'].substring(0, 10)}...` : 'missing'
    }
  });

  try {
    const { body } = event;
    
    if (!body?.type || !body?.data) {
      console.log('Invalid webhook data:', { requestId, body });
      return;
    }

    if (body.type !== 'cast.created') {
      console.log('Ignoring non-cast event:', { requestId, type: body.type });
      return;
    }

    const cast = body.data;
    
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
      // Track this mention
      processedMentions.add(cast.hash);
      
      console.log('Bot mention detected:', {
        requestId,
        cast: {
          hash: cast.hash,
          text: cast.text,
          author: cast.author?.username
        }
      });

      try {
        // Like the mention
        await neynar.publishReaction({
          signerUuid: process.env.SIGNER_UUID!,
          reactionType: 'like',
          target: cast.hash
        });

        console.log('Successfully liked mention');

        // Generate and post response
        const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
        const response = await generateBotResponse(cleanedMessage);
        
        await postReply(response, cast.hash, cast.author.username);

        console.log('Successfully processed mention:', {
          requestId,
          hash: cast.hash,
          response
        });
      } catch (error) {
        console.error('Error processing mention:', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
          cast: cast.hash
        });
        throw error;
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
