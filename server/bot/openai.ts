import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY
});

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
  } catch (error) {
    console.error('OpenAI Error:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    // Provide a personality-appropriate fallback response
    return "Ah, this old collector's mind needs a moment to focus! 🥋 Why don't you tell me about your latest find while I recharge? #CollectorsCanyonClub";
  }
}
