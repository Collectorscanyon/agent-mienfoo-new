import { reply } from './handlers';

export async function handleCommand(cast: any, collections: any) {
  const content = cast.text.toLowerCase();
  const username = cast.author.username;
  const userId = cast.author.fid;

  try {
    if (content.includes('add')) {
      const item = extractItem(content);
      if (item) {
        await addToCollection(userId, item, collections);
        await reply(cast.hash, 
          `@${username} Added "${item}" to your collection! 🎉 Great addition!`
        );
      } else {
        await reply(cast.hash,
          `@${username} What would you like to add to your collection? Just say "add [item]" 📝`
        );
      }
    } else if (content.includes('show') || content.includes('collection')) {
      await showCollection(cast.hash, username, userId, collections);
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await reply(cast.hash,
      `@${username} Oops! Something went wrong. Please try again later! 😅`
    );
  }
}

function extractItem(content: string): string | null {
  const addMatch = content.match(/add\s+(.+)/i);
  return addMatch ? addMatch[1].trim() : null;
}

async function addToCollection(userId: string, item: string, collections: any) {
  if (!collections[userId]) {
    collections[userId] = [];
  }
  
  collections[userId].push({
    item,
    added: new Date().toISOString()
  });
}

async function showCollection(castHash: string, username: string, userId: string, collections: any) {
  const collection = collections[userId] || [];
  
  if (collection.length === 0) {
    await reply(castHash,
      `@${username} Your collection is empty! Start by adding items with "add [item]" 📝`
    );
    return;
  }

  // Show latest 3 items
  const recent = collection.slice(-3)
    .map(entry => entry.item)
    .join(', ');

  await reply(castHash,
    `@${username} Your latest additions: ${recent} (Total: ${collection.length} items) ✨`
  );
}
