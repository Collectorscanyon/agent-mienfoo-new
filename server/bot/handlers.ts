import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { handleCommand } from './commands';

// Import config to ensure type safety
import { NEYNAR_API_KEY, SIGNER_UUID } from '../config';

// Initialize Neynar client with v2 configuration
const config = new Configuration({
  apiKey: NEYNAR_API_KEY,
});

const neynar = new NeynarAPIClient(config);

// Skip our own casts to avoid loops
const BOT_USERNAME = process.env.BOT_USERNAME || 'mienfoo';

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

    // Skip our own casts to prevent loops
    if (username === process.env.BOT_USERNAME) {
      return;
    }

    // Process commands if present
    const isCommand = content.includes('add') || 
                     content.includes('show') || 
                     content.includes('collection');
    
    if (isCommand) {
      await handleCommand(cast, collections);
      return;
    }

    // Default friendly responses
    if (content.includes('hello') || content.includes('hi')) {
      await reply(cast.hash, 
        `Hey @${username}! 👋 I'm Mienfoo, your friendly collector companion! Tell me about your collection!`
      );
    } else {
      await reply(cast.hash,
        `@${username} Thanks for the mention! I love chatting about collections. Try:
• "add [item]" to track items
• "show collection" to see your items
What's your favorite piece? 🌟`
      );
    }

    // Always like mentions
    await likeCast(cast.hash);
  } catch (error) {
    console.error('Error handling mention:', error);
  }
}

export async function reply(parentHash: string, text: string) {
  try {
    await neynar.publishCast({
      signerUuid: SIGNER_UUID,
      text,
      parent: parentHash
    });
  } catch (error) {
    console.error('Error replying to cast:', error);
  }
}

export async function likeCast(castHash: string) {
  try {
    await neynar.publishReaction({
      signerUuid: SIGNER_UUID,
      reactionType: 'like',
      target: castHash
    });
  } catch (error) {
    console.error('Error liking cast:', error);
  }
}

export { collections };
