import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { handleCommand } from './commands';

// Initialize Neynar client
const neynar = new NeynarAPIClient(process.env.NEYNAR_API_KEY);

// Memory store for user collections
interface CollectionItem {
  item: string;
  added: string;
}

interface UserCollection {
  [userId: string]: CollectionItem[];
}

const collections: UserCollection = {};

export async function handleMention(cast: any) {
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
      signer_uuid: process.env.SIGNER_UUID,
      text,
      parent: parentHash
    });
  } catch (error) {
    console.error('Error replying to cast:', error);
  }
}

export async function likeCast(castHash: string) {
  try {
    await neynar.reactToCast({
      signer_uuid: process.env.SIGNER_UUID,
      reaction_type: 'like',
      cast_hash: castHash
    });
  } catch (error) {
    console.error('Error liking cast:', error);
  }
}

export { collections };
