// netlify/functions/chat.js

// Fallback error response as an SSE stream
function dummyFallbackWithErrorEvent(error) {
  const fallbackEvent = `event: message\ndata: ${JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: `Error: ${error.message || "Unknown error"}\n\n(No API key or request failed)`
            }
          ]
        }
      }
    ]
  })}\n\n`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/event-stream" },
    body: fallbackEvent, // ✅ always a string
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { contents } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment variables.");

    const geminiApiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(geminiApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API responded with status ${response.status}: ${errorBody}`);
    }

    // 🔥 Collect the streaming response into a string
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    // ✅ Return as string for Lambda
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: result,
    };

  } catch (error) {
    return dummyFallbackWithErrorEvent(error);
  }
};
