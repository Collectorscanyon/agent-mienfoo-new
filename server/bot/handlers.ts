import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { handleCommand } from './commands';
import { config } from '../config';

// Initialize Neynar client with v2 configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY,
});

const neynar = new NeynarAPIClient(neynarConfig);

// Memory store for user collections
// Define proper types for Neynar SDK responses
interface Cast {
  hash: string;
  author: {
    username: string;
    fid: string;
  };
  text: string;
}

interface CollectionItem {
  item: string;
  added: string;
}

interface UserCollection {
  [userId: string]: CollectionItem[];
}

const collections: UserCollection = {};

export async function handleMention(cast: Cast) {
  try {
    const username = cast.author.username;
    const content = cast.text.toLowerCase();

    console.log(`Processing mention from @${username}: ${content}`);

    // Skip our own casts to prevent loops
    if (username.toLowerCase() === config.BOT_USERNAME.toLowerCase()) {
      console.log('Skipping own cast to prevent loops');
      return;
    }

    // Like the mention first thing
    try {
      console.log('Liking the mention cast');
      await likeCast(cast.hash);
    } catch (likeError) {
      console.error('Error liking cast:', likeError);
      // Continue with the rest of the processing even if like fails
    }

    // Process commands if present
    const isCommand = content.includes('add') || 
                     content.includes('show') || 
                     content.includes('collection');
    
    if (isCommand) {
      console.log('Handling command in mention');
      await handleCommand(cast, collections);
      return;
    }

    // Default friendly responses
    if (content.includes('hello') || content.includes('hi')) {
      console.log('Responding to greeting');
      await reply(cast.hash, 
        `Hey @${username}! 👋 I'm Mienfoo, your friendly collector companion! Tell me about your collection!`
      );
    } else {
      console.log('Sending default response');
      await reply(cast.hash,
        `@${username} Thanks for the mention! I love chatting about collections. Try:
• "add [item]" to track items
• "show collection" to see your items
What's your favorite piece? 🌟`
      );
    }
  } catch (error) {
    console.error('Error handling mention:', error);
    // Log the full error for debugging
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
  }
}

export async function reply(parentHash: string, text: string) {
  try {
    console.log('Attempting to reply to cast:', { parentHash, text });
    const response = await neynar.publishCast({
      signer_uuid: config.SIGNER_UUID,
      text,
      parent: parentHash
    });
    console.log('Reply sent successfully:', response);
  } catch (error) {
    console.error('Error replying to cast:', error);
    if (error instanceof Error) {
      console.error('Reply error details:', {
        message: error.message,
        stack: error.stack
      });
    }
    throw error; // Re-throw to handle at caller level if needed
  }
}

export async function likeCast(castHash: string) {
  try {
    console.log(`Attempting to like cast: ${castHash}`);
    const response = await neynar.reactToCast({
      signer_uuid: config.SIGNER_UUID,
      reaction_type: 'like',
      cast_hash: castHash
    });
    console.log('Successfully liked cast:', response);
  } catch (error) {
    console.error('Error liking cast:', error);
    if (error instanceof Error) {
      console.error('Like error details:', {
        message: error.message,
        stack: error.stack
      });
    }
    throw error; // Re-throw to handle at caller level if needed
  }
}

export { collections };
