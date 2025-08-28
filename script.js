document.addEventListener("DOMContentLoaded", () => {
    const sidebarToggle = document.querySelector(".sidebar-toggle");
    const themeToggle = document.querySelector(".theme-toggle");
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".overlay");
    const content = document.querySelector(".content");
    const body = document.body;

    // --- CHATBOT API LOGIC ---
    const chatContainer = document.querySelector(".chat-container");
    const chatInput = document.querySelector(".input textarea");
    const sendButton = document.querySelector(".input button");

    const API_KEY = "YOUR_APIAIzaSyBcFtkw2fZWMPQKhvUuCrpu1Qc_4Qq3dIQ_KEY"; // <-- IMPORTANT: PASTE YOUR GEMINI API KEY HERE
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?alt=sse&key=AIzaSyBcFtkw2fZWMPQKhvUuCrpu1Qc_4Qq3dIQ`;

    let conversationHistory = []; // Array to store conversation context

    const createChatMessageElement = (message, sender) => {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("chat-message", sender);

        const avatar = document.createElement("div");
        avatar.classList.add("avatar");
        // Avatar text removed as requested

        const messageContent = document.createElement("div");
        messageContent.classList.add("message");
        messageContent.textContent = message;

        if (sender === "ai") {
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(messageContent);
        } else { // user
            messageDiv.appendChild(messageContent);
            messageDiv.appendChild(avatar);
        }

        return messageDiv;
    };

    const handleChat = async () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        // Reset textarea height and clear input
        chatInput.value = "";
        chatInput.style.height = "auto";
        sendButton.disabled = true;

        // Display user's message
        chatContainer.appendChild(createChatMessageElement(userMessage, "user"));
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Add user message to history for context
        conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });

        // --- CONTEXT LIMIT LOGIC ---
        const maxMessages = 20; // Keeps the last 10 user/AI message pairs
        if (conversationHistory.length > maxMessages) {
            // Slice the array to keep only the last `maxMessages` items
            conversationHistory = conversationHistory.slice(conversationHistory.length - maxMessages);
        }
        // --- END CONTEXT LIMIT LOGIC ---

        // Create AI message bubble to be filled by the stream
        const aiMessageDiv = createChatMessageElement("", "ai");
        chatContainer.appendChild(aiMessageDiv);
        const aiMessageContent = aiMessageDiv.querySelector('.message');
        aiMessageContent.classList.add('streaming');

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: conversationHistory }), // Send full history
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let fullAiResponse = ""; // To store the complete AI response

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.substring(6).trim();
                        if (jsonStr) {
                            try {
                                const chunk = JSON.parse(jsonStr);
                                const textPart = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (textPart) {
                                    fullAiResponse += textPart; // Append to full response
                                    aiMessageContent.textContent += textPart;
                                    chatContainer.scrollTop = chatContainer.scrollHeight;
                                }
                            } catch (e) {
                                console.warn("Could not parse JSON chunk:", jsonStr);
                            }
                        }
                    }
                }
            }
            // Add complete AI response to history for context
            conversationHistory.push({ role: 'model', parts: [{ text: fullAiResponse }] });

        } catch (error) {
            console.error("Streaming Error:", error);
            aiMessageContent.textContent = `Error: ${error.message}. Please check your API key and network connection.`;
        } finally {
            aiMessageContent.classList.remove('streaming');
            sendButton.disabled = false;
            chatInput.focus();
        }
    };

    // --- EVENT LISTENERS ---
    sendButton.addEventListener("click", handleChat);

    chatInput.addEventListener("keydown", (e) => {
        // Submit on Enter, but allow new line with Shift+Enter
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChat();
        }
    });

    chatInput.addEventListener("input", () => {
        // Auto-resize textarea
        chatInput.style.height = "auto";
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });


    // --- THEME TOGGLE LOGIC ---
    const applyTheme = (theme) => {
        if (theme === "dark") {
            body.classList.add("dark-theme");
            themeToggle.textContent = "☀️";
        } else {
            body.classList.remove("dark-theme");
            themeToggle.textContent = "🌙";
        }
    };

    themeToggle.addEventListener("click", () => {
        const currentTheme = body.classList.contains("dark-theme") ? "light" : "dark";
        localStorage.setItem("theme", currentTheme);
        applyTheme(currentTheme);
    });

    // Load saved theme
    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);

    // --- SIDEBAR LOGIC ---
    const isMobile = () => window.innerWidth <= 768;

    const toggleSidebar = () => {
        if (isMobile()) {
            // Mobile behavior: Toggle sidebar and overlay
            sidebar.classList.toggle("active");
            overlay.classList.toggle("active");
        } else {
            // Desktop behavior: Collapse sidebar and expand content
            sidebar.classList.toggle("collapsed");
            content.classList.toggle("full-width");
        }
    };

    // Set initial state on load and on resize
    const setInitialState = () => {
        if (isMobile()) {
            sidebar.classList.add("collapsed"); // Use 'collapsed' to hide
            sidebar.classList.remove("active");
            content.classList.remove("full-width");
            overlay.classList.remove("active");
        } else {
            sidebar.classList.remove("active");
            // Keep desktop collapsed state if it was set
            if (!sidebar.classList.contains("collapsed")) {
                content.classList.remove("full-width");
            }
            overlay.classList.remove("active");
        }
    };

    sidebarToggle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", toggleSidebar); // This will only trigger on mobile

    window.addEventListener("resize", setInitialState);
    setInitialState(); // Run on page load
});