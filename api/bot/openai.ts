import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define system prompt at the module level
const systemPrompt = `You are Mienfoo, a knowledgeable and enthusiastic Pokémon-themed collector bot with a deep passion for the Pokémon Trading Card Game.

Your core traits:
- Friendly and approachable, like a helpful Fighting-type Pokémon companion
- Expert in Pokémon cards, with deep knowledge of sets, rarities, and market values
- Gives practical advice about card collecting, preservation, and trading
- Always maintains a positive, encouraging tone like a supportive Pokémon trainer
- Makes playful references to Pokémon lore and your Fighting-type nature
- Shows enthusiasm for rare cards and special editions
- Helps collectors understand card conditions and grading

Keep responses concise (2-3 sentences max) but informative and always stay in character as Mienfoo, the collector's companion. When giving advice about card values or investments, maintain a balanced perspective and encourage collecting for enjoyment first.`;

// Verify OpenAI API key is present
if (!process.env.OPENAI_API_KEY) {
    console.error('OpenAI API key is not set in environment variables');
    throw new Error('Missing OpenAI API key');
}

// Initialize OpenAI with environment variables and configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 10000, // 10 second timeout
    maxRetries: 2,
});

interface OpenAIError extends Error {
    status?: number;
    code?: string;
}

export async function generateBotResponse(message: string): Promise<string> {
    const timestamp = new Date().toISOString();
    const requestId = Math.random().toString(36).substring(7);
    
    console.log('Starting response generation:', {
        requestId,
        timestamp,
        originalMessage: message,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        messageLength: message.length
    });

    try {
        // Clean and validate input
        const cleanedMessage = message.trim();
        if (!cleanedMessage) {
            console.warn('Empty message received:', { requestId, timestamp });
            return "I couldn't quite catch that. Could you please try asking your question again?";
        }

        // Enhanced logging for OpenAI call
        console.log('Making OpenAI API call:', {
            requestId,
            timestamp,
            model: 'gpt-3.5-turbo',
            maxTokens: 150,
            temperature: 0.7,
            cleanedMessage,
            systemPromptLength: systemPrompt.length,
            apiKeyConfigured: !!process.env.OPENAI_API_KEY
        });

        // Enhanced error checking for API key
        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
            console.error('OpenAI API key missing or invalid:', {
                requestId,
                timestamp,
                error: 'API_KEY_MISSING'
            });
            throw new Error('OpenAI API key is not properly configured');
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: cleanedMessage
                }
            ],
            temperature: 0.7,
            max_tokens: 150,
            presence_penalty: 0.6,
            frequency_penalty: 0.3
        });

        const response = completion.choices[0]?.message?.content?.trim();
        
        if (!response) {
            console.warn('Empty response from OpenAI:', {
                requestId,
                timestamp,
                message: cleanedMessage,
                completion
            });
            return "Like a rare Pokémon card, the right words seem to be eluding me. Could you rephrase your question?";
        }

        console.log('Successfully generated response:', {
            requestId,
            timestamp,
            originalMessage: cleanedMessage,
            response,
            usage: {
                promptTokens: completion.usage?.prompt_tokens,
                completionTokens: completion.usage?.completion_tokens,
                totalTokens: completion.usage?.total_tokens
            }
        });

        return response;

    } catch (error) {
        // Enhanced error logging
        const errorDetails = error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error;

        console.error('Error generating response:', {
            requestId,
            timestamp,
            error: errorDetails,
            originalMessage: message
        });

        // Check for specific error types
        if (error instanceof Error) {
            if (error.message.includes('Rate limit')) {
                return "Just like a Pokémon needs to rest between battles, I need a brief moment to recharge. Could you try again in a few seconds?";
            }
            if (error.message.includes('invalid_api_key')) {
                console.error('Invalid OpenAI API key detected:', {
                    requestId,
                    timestamp,
                    error: errorDetails
                });
                return "I'm having trouble accessing my Pokédex right now. Please try again later!";
            }
        }

        // Generic error message for other cases
        return "Just like a Pokémon needs to rest at a Pokémon Center, I need a moment to recharge. Could you try asking again in a bit?";
    }
}