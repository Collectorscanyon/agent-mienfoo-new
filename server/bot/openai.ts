import OpenAI from 'openai';
import { config } from '../config';

let openai: OpenAI;
try {
  openai = new OpenAI({
    apiKey: config.OPENAI_API_KEY
  });
  console.log('OpenAI client initialized successfully');
} catch (error) {
  console.error('Failed to initialize OpenAI client:', error);
  process.exit(1);
}

const BASE_PROMPT = `You are Mienfoo, the wise and enthusiastic collector bot and guardian of CollectorsCanyon.
Your personality:
- Grandpa-like wisdom about collecting
- Martial arts master (hence the 🥋 emoji)
- Warm and encouraging to fellow collectors
- Loves sharing stories and experiences

Your expertise covers:
- Trading cards (Pokemon, Magic, Sports)
- Comics and manga
- Action figures and toys
- Video games and retro gaming
- Collection preservation and display

Response style:
- Keep responses concise (max 280 chars)
- Use martial arts/wisdom metaphors occasionally
- Always be encouraging and supportive
- Include relevant emojis sparingly
- End responses with #CollectorsCanyonClub

Important:
- If someone asks "how are you", respond warmly and ask about their collection
- For collection questions, share brief wisdom or tips
- For greetings, be welcoming and invite collection discussion`;

export async function generateBotResponse(userMessage: string): Promise<string> {
  try {
    console.log('Generating response for message:', userMessage);
    
    // Clean and prepare the user message
    const cleanedMessage = userMessage.trim();
    console.log('Cleaned message:', cleanedMessage);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: BASE_PROMPT },
        { role: "system", content: "Remember to keep responses under 280 characters and maintain your grandpa collector personality." },
        { role: "user", content: cleanedMessage }
      ],
      max_tokens: 150,
      temperature: 0.8,
      presence_penalty: 0.6,
      frequency_penalty: 0.5
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response generated');
    }

    // Ensure response ends with hashtag if not present
    const formattedResponse = response.includes('#CollectorsCanyonClub') 
      ? response 
      : `${response} #CollectorsCanyonClub`;

    console.log('Generated response:', formattedResponse);
    return formattedResponse;
  } catch (error: any) {
    console.error('OpenAI Error:', {
      name: error.name,
      message: error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString()
    });

    // Create engaging fallback responses based on error type
    const fallbackResponses = {
      rateLimit: [
        "🥋 Even a wise collector needs rest! Tell me about your collection while I meditate. #CollectorsCanyonClub",
        "📜 Ancient wisdom says: take breaks to appreciate what you have! Share your latest find? #CollectorsCanyonClub",
        "⏳ Taking a brief pause to center my chi! What treasures have you discovered lately? #CollectorsCanyonClub"
      ],
      default: [
        "🎭 A collector's journey is full of surprises! What brings you to our canyon today? #CollectorsCanyonClub",
        "🌟 Every item tells a story! Care to share yours with this old collector? #CollectorsCanyonClub",
        "🏺 In my years of collecting, I've learned that conversation is the greatest treasure! #CollectorsCanyonClub"
      ]
    };

    // Select random response based on error type
    const responses = error.response?.status === 429 
      ? fallbackResponses.rateLimit 
      : fallbackResponses.default;
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Log the selected fallback response
    console.log('Using fallback response:', randomResponse);
    
    return randomResponse;
  }
}
