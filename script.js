document.addEventListener("DOMContentLoaded", () => {
    // --- DOM SELECTORS ---
    const sidebarToggle = document.querySelector(".sidebar-toggle");
    const themeToggle = document.querySelector(".theme-toggle");
    const newChatBtn = document.querySelector(".sidebar > button");
    const searchInput = document.querySelector(".sidebar > input[type='search']");
    const historyContainer = document.querySelector(".chathistory");
    const chatContainer = document.querySelector(".chat-container");
    const chatInput = document.querySelector(".input textarea");
    const sendButton = document.querySelector(".input button");
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".overlay");
    const content = document.querySelector(".content");
    const body = document.body;

    // --- API CONFIG ---
    const API_KEY = "AIzaSyDbU3nfGvL88AbZZT7l5GtCZnS5RBBh6eE"; // <-- IMPORTANT: PASTE YOUR GEMINI API KEY HERE
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?alt=sse&key=${API_KEY}`;

    // --- APP STATE & LOCAL STORAGE ---
    let appState = {
        currentChatId: null,
        chats: [],
    };

    const saveState = () => {
        localStorage.setItem("chatgpt-clone-state", JSON.stringify(appState));
    };

    const loadState = () => {
        const savedState = localStorage.getItem("chatgpt-clone-state");
        if (savedState) {
            appState = JSON.parse(savedState);
        }
    };

    // --- ENHANCED MATH RENDERING FUNCTION ---
    const renderMathInMessage = (element) => {
        // Wait for KaTeX to be fully loaded
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(element, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError: false,
                    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
                    ignoredClasses: ['katex-html']
                });
            } catch (error) {
                console.warn('KaTeX rendering error:', error);
            }
        }
    };

    // --- ENHANCED MESSAGE CREATION WITH LATEX SUPPORT ---
    const createChatMessageElement = (message, sender) => {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("chat-message", sender);
        const avatar = document.createElement("div");
        avatar.classList.add("avatar");
        const messageContent = document.createElement("div");
        messageContent.classList.add("message");
        
        // Set the text content and render math immediately
        messageContent.textContent = message;
        
        // Render math for both user and AI messages
        renderMathInMessage(messageContent);

        if (sender === "ai") {
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(messageContent);
        } else {
            messageDiv.appendChild(messageContent);
            messageDiv.appendChild(avatar);
        }
        return messageDiv;
    };

    // --- UI RENDERING ---
    const renderChatHistory = () => {
        historyContainer.innerHTML = "";
        appState.chats.forEach(chat => {
            const chatItem = document.createElement("div");
            chatItem.classList.add("chatitem");
            chatItem.dataset.chatId = chat.id;

            const titleSpan = document.createElement("span");
            titleSpan.textContent = chat.title;
            chatItem.appendChild(titleSpan);

            const deleteBtn = document.createElement("button");
            deleteBtn.classList.add("delete-chat-btn");
            deleteBtn.innerHTML = "&times;";
            chatItem.appendChild(deleteBtn);

            if (chat.id === appState.currentChatId) {
                chatItem.classList.add("active");
            }
            historyContainer.appendChild(chatItem);
        });
    };

    const renderActiveChat = () => {
        chatContainer.innerHTML = "";
        const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
        if (activeChat) {
            activeChat.messages.forEach(msg => {
                const role = msg.role === 'model' ? 'ai' : 'user';
                const messageElement = createChatMessageElement(msg.parts[0].text, role);
                chatContainer.appendChild(messageElement);
            });
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    };

    // --- CHAT FUNCTIONALITY ---
    const deleteChat = (chatIdToDelete) => {
        const wasActive = appState.currentChatId === chatIdToDelete;

        // Filter out the chat to be deleted
        appState.chats = appState.chats.filter(chat => chat.id !== chatIdToDelete);

        if (wasActive) {
            // If the active chat was deleted, create a new one and switch to it.
            createNewChat();
        } else {
            // If a background chat was deleted, just save the state and update the history list.
            saveState();
            renderChatHistory();
        }
    };

    const createNewChat = () => {
        const newChatId = `chat_${Date.now()}`;
        appState.chats.unshift({
            id: newChatId,
            title: "New Chat",
            messages: [],
        });
        appState.currentChatId = newChatId;
        saveState();
        renderChatHistory();
        renderActiveChat();
    };

    const handleChat = async () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage || !appState.currentChatId) return;

        const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
        
        // Check if the title still needs to be set from its default
        const needsTitle = activeChat.title === "New Chat";

        activeChat.messages.push({ role: 'user', parts: [{ text: userMessage }] });
        
        // Create and add user message with LaTeX support
        const userMessageElement = createChatMessageElement(userMessage, "user");
        chatContainer.appendChild(userMessageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        chatInput.value = "";
        chatInput.style.height = "auto";
        sendButton.disabled = true;

        // Create AI message element for streaming
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
                                    fullAiResponse += textPart;
                                    // During streaming, show raw text for responsiveness
                                    aiMessageContent.textContent = fullAiResponse;
                                    chatContainer.scrollTop = chatContainer.scrollHeight;
                                }
                            } catch (e) { /* Ignore parsing errors */ }
                        }
                    }
                }
            }

            activeChat.messages.push({ role: 'model', parts: [{ text: fullAiResponse }] });

            // Set title based on the FIRST user message in the chat history
            if (needsTitle) {
                const firstUserMessage = activeChat.messages.find(m => m.role === 'user');
                if (firstUserMessage) {
                    const titleText = firstUserMessage.parts[0].text;
                    activeChat.title = titleText.split(' ').slice(0, 5).join(' ') + '...';
                    renderChatHistory();
                }
            }
            saveState();

        } catch (error) {
            aiMessageContent.textContent = `Error: ${error.message}`;
        } finally {
            // After streaming is done, render the final message with math
            renderMathInMessage(aiMessageContent);
            aiMessageContent.classList.remove('streaming');
            sendButton.disabled = false;
            chatInput.focus();
        }
    };

    // --- EVENT LISTENERS ---
    newChatBtn.addEventListener("click", createNewChat);

    historyContainer.addEventListener("click", (e) => {
        const target = e.target;
        if (target.classList.contains("delete-chat-btn")) {
            e.stopPropagation();
            const chatItem = target.closest(".chatitem");
            const chatId = chatItem.dataset.chatId;
            if (confirm("Are you sure you want to delete this chat?")) {
                deleteChat(chatId);
            }
        } else if (target.closest(".chatitem")) {
            const chatItem = target.closest(".chatitem");
            const chatId = chatItem.dataset.chatId;
            if (chatId !== appState.currentChatId) {
                appState.currentChatId = chatId;
                saveState();
                renderChatHistory();
                renderActiveChat();
            }
        }
    });

    searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll(".chathistory .chatitem").forEach(item => {
            const title = item.textContent.toLowerCase();
            item.style.display = title.includes(searchTerm) ? "" : "none";
        });
    });

    sendButton.addEventListener("click", handleChat);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChat();
        }
    });
    chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = `${chatInput.scrollHeight}px`;
    });

    // --- THEME & SIDEBAR LOGIC ---
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

    const isMobile = () => window.innerWidth <= 768;
    const toggleSidebar = () => {
        if (isMobile()) {
            sidebar.classList.toggle("active");
            overlay.classList.toggle("active");
        } else {
            sidebar.classList.toggle("collapsed");
            content.classList.toggle("full-width");
        }
    };

    const setInitialState = () => {
        if (isMobile()) {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            content.classList.remove("full-width");
        } else {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            if (sidebar.classList.contains("collapsed")) {
                content.classList.add("full-width");
            } else {
                content.classList.remove("full-width");
            }
        }
    };

    sidebarToggle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", toggleSidebar);
    window.addEventListener("resize", setInitialState);

    // --- INITIALIZATION ---
    loadState();
    if (!appState.currentChatId || !appState.chats.find(c => c.id === appState.currentChatId)) {
        if (appState.chats.length > 0) {
            appState.currentChatId = appState.chats[0].id;
        } else {
            createNewChat();
        }
    }
    applyTheme(localStorage.getItem("theme") || "light");
    setInitialState();
    renderChatHistory();

    // Enhanced initialization to ensure KaTeX is ready
    const initializeChat = () => {
        if (window.renderMathInElement) {
            renderActiveChat();
        } else {
            // If KaTeX isn't ready yet, wait a bit longer
            setTimeout(initializeChat, 100);
        }
    };

    // Start initialization
    initializeChat();
});