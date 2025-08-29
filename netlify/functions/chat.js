// filepath: d:\Programming\Web Development\Chatgpt\netlify\functions\chat.js
const fetch = require('node-fetch');

/**
 * This function is called only if the primary API fails.
 * It sends a special error event to the client's console, then sends a dummy response.
 * This allows for robust development even without a valid API key.
 */
async function dummyFallbackWithErrorEvent(originalError) {
    // Log the full error server-side for debugging in your terminal.
    console.error("PRIMARY API FAILED (server-side log):", originalError);

    // 1. Create a special error payload to send to the client's browser console.
    const errorPayload = {
        __error: {
            message: originalError.message || 'An unknown error occurred.',
            stack: originalError.stack,
        }
    };
    const errorEvent = `data: ${JSON.stringify(errorPayload)}\n\n`;

    // 2. Fetch a dummy response from a public API.
    try {
        const randomId = Math.floor(Math.random() * 100) + 1;
        const dummyResponse = await fetch(`https://jsonplaceholder.typicode.com/posts/${randomId}`);
        const dummyData = await dummyResponse.json();
        const nonsenseText = `(Dummy Fallback) ${dummyData.body.replace(/\n/g, ' ')}`;

        const geminiLikePayload = {
            candidates: [{ content: { parts: [{ text: nonsenseText }] } }]
        };
        const dataEvent = `data: ${JSON.stringify(geminiLikePayload)}\n\n`;

        // 3. Combine the error event and the dummy data event into one response.
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/event-stream', 'X-Fallback': 'true' },
            body: errorEvent + dataEvent,
        };
    } catch (dummyError) {
        console.error("CRITICAL: Dummy API fallback also failed:", dummyError);
        return { statusCode: 500, body: JSON.stringify({ error: 'All APIs failed.' }) };
    }
}

exports.handler = async function (event) {
    // Only allow POST requests.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { contents } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        // --- TEMPORARY DEBUGGING LOG ---
        // This will print to your `netlify dev` terminal, not the browser console.
        console.log(`[DEBUG] Using API Key starting with: ${apiKey ? apiKey.substring(0, 8) : 'Not Found'}`);
        // --- END DEBUGGING LOG ---

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set in environment variables.");
        }

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?alt=sse&key=${apiKey}`;

        const response = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: event.body,
        });

        // If the API gives an error (e.g., 400), trigger the fallback.
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API responded with status ${response.status}: ${errorBody}`);
        }

        // Success: Stream the real response back to the client.
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/event-stream', 'X-Fallback': 'false' },
            body: response.body,
            isBase64Encoded: false,
        };

    } catch (error) {
        // If any part of the `try` block fails, initiate the fallback.
        return dummyFallbackWithErrorEvent(error);
    }
};

const createNewChat = () => {
    // ...existing code...
};

const handleChat = async () => {
    const userMessage = chatInput.value.trim();
    if (!userMessage || !appState.currentChatId) return;

    const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
    
    const needsTitle = activeChat.title === "New Chat";

    activeChat.messages.push({ role: 'user', parts: [{ text: userMessage }] });
    
    const userMessageElement = createChatMessageElement(userMessage, "user");
    chatContainer.appendChild(userMessageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    chatInput.value = "";
    chatInput.style.height = "auto";
    sendButton.disabled = true;

    const aiMessageDiv = createChatMessageElement("", "ai");
    chatContainer.appendChild(aiMessageDiv);
    const aiMessageContent = aiMessageDiv.querySelector('.message');
    aiMessageContent.classList.add('streaming');

    try {
        const conversationHistory = activeChat.messages.slice(-20);
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: conversationHistory }),
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullAiResponse = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6).trim();
                    if (jsonStr) {
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (textPart) {
                                // NEW: Check for the dummy response flag
                                if (textPart.includes("(Dummy Response)")) {
                                    throw new Error("API key not configured. Please check server logs.");
                                }
                                fullAiResponse += textPart;
                                aiMessageContent.textContent = fullAiResponse;
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            }
                        } catch (e) { 
                            // If we get here from our custom error, re-throw it
                            if (e.message.includes("API key not configured")) throw e;
                        }
                    }
                }
            }
        }

        activeChat.messages.push({ role: 'model', parts: [{ text: fullAiResponse }] });

        if (needsTitle) {
            const firstUserMessage = activeChat.messages.find(m => m.role === 'user');
            if (firstUserMessage) {
                activeChat.title = firstUserMessage.parts[0].text.split(' ').slice(0, 5).join(' ') + '...';
                renderChatHistory();
            }
        }
        saveState();

    } catch (error) {
        // This will now catch our custom error and display it to the user
        aiMessageContent.textContent = `Error: ${error.message}`;
    } finally {
        renderMathInMessage(aiMessageContent);
        aiMessageContent.classList.remove('streaming');
        sendButton.disabled = false;
        chatInput.focus();
    }
};

// --- EVENT LISTENERS ---