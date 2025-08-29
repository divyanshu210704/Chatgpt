document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const DOMElements = {
        sidebarToggle: document.querySelector(".sidebar-toggle"),
        themeToggle: document.querySelector(".theme-toggle"),
        newChatBtn: document.querySelector(".new-chat"),
        historyContainer: document.querySelector(".chathistory"),
        chatContainer: document.querySelector(".chat-container"),
        chatInput: document.querySelector(".input textarea"),
        sendButton: document.querySelector(".send-btn"),
        sidebar: document.querySelector(".sidebar"),
        overlay: document.querySelector(".overlay"),
        content: document.querySelector(".content"), // <-- FIX 1: This was missing
        deleteModal: document.getElementById("delete-modal"),
        confirmDeleteBtn: document.getElementById("confirm-delete-btn"),
        cancelDeleteBtn: document.getElementById("cancel-delete-btn"),
        clearAllModal: document.getElementById("clear-all-modal"),
        confirmClearAllBtn: document.getElementById("confirm-clear-all-btn"),
        cancelClearAllBtn: document.getElementById("cancel-clear-all-btn"),
        clearHistoryBtn: document.getElementById("clear-history-btn"),
        welcomeScreen: document.querySelector(".welcome-screen"),
        body: document.body,
        searchInput: document.querySelector(".sidebar input[type='search']"), // Also re-adding this for completeness
    };

    const API_URL = '/.netlify/functions/chat';

    // --- State Management ---
    let appState = { currentChatId: null, chats: [] };
    const saveState = () => localStorage.setItem("chatgpt-clone-state", JSON.stringify(appState));
    const loadState = () => {
        const savedState = localStorage.getItem("chatgpt-clone-state");
        if (savedState) appState = JSON.parse(savedState);
    };

    // --- UI Rendering ---
    const renderMathInElement = (el) => {
        if (window.renderMathInElement && el) {
            try {
                window.renderMathInElement(el, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                    ],
                    throwOnError: false,
                    ignoredTags: ["pre", "code", "strong"],
                });
            } catch (e) { console.warn("KaTeX rendering error:", e); }
        }
    };

    const parseInlineFormatting = (text) => {
        const fragment = document.createDocumentFragment();
        const boldRegex = /\*\*(.*?)\*\*/g; 
        let lastIndex = 0;
        let match;

        while ((match = boldRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
            }
            const strongEl = document.createElement('strong');
            strongEl.textContent = match[1];
            fragment.appendChild(strongEl);
            lastIndex = boldRegex.lastIndex;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        return fragment;
    };

    const formatMessageContent = (text) => {
        const fragment = document.createDocumentFragment();
        const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                const plainTextSegment = text.substring(lastIndex, match.index);
                fragment.appendChild(parseInlineFormatting(plainTextSegment));
            }

            const language = match[1] || 'plaintext';
            const codeContent = match[2].trim();
            const block = document.createElement('div');
            block.className = 'code-block';
            const header = document.createElement('div');
            header.className = 'code-header';
            const langSpan = document.createElement('span');
            langSpan.textContent = language;
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-button';
            copyBtn.textContent = 'Copy';
            copyBtn.dataset.content = codeContent;
            header.appendChild(langSpan);
            header.appendChild(copyBtn);
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.className = `language-${language}`;
            code.textContent = codeContent;
            pre.appendChild(code);
            block.appendChild(header);
            block.appendChild(pre);
            fragment.appendChild(block);
            lastIndex = codeBlockRegex.lastIndex;
        }

        if (lastIndex < text.length) {
            const remainingText = text.substring(lastIndex);
            fragment.appendChild(parseInlineFormatting(remainingText));
        }
        
        return fragment;
    };

    const createChatMessageElement = (text, sender) => {
        const wrapper = document.createElement("div");
        wrapper.className = `chat-message ${sender}`;
        const message = document.createElement("div");
        message.className = "message";

        const formattedContent = formatMessageContent(text);
        message.appendChild(formattedContent);

        renderMathInElement(message);
        wrapper.appendChild(message);
        return wrapper;
    };

    const renderChatHistory = () => {
        DOMElements.historyContainer.innerHTML = "";
        if (appState.chats.length === 0) {
            DOMElements.historyContainer.innerHTML = `<p class="empty-history-message">No chats yet.</p>`;
            return;
        }
        appState.chats.forEach(chat => {
            const item = document.createElement("div");
            item.className = `chatitem ${chat.id === appState.currentChatId ? "active" : ""}`;
            item.dataset.chatId = chat.id;
            item.innerHTML = `<span></span><button class="delete-chat-btn" aria-label="Delete chat">&times;</button>`;
            item.querySelector('span').textContent = chat.title;
            DOMElements.historyContainer.appendChild(item);
        });
    };

    const renderActiveChat = () => {
        const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
        DOMElements.chatContainer.innerHTML = "";
        if (!activeChat || activeChat.messages.length === 0) {
            DOMElements.chatContainer.style.display = 'none';
            DOMElements.welcomeScreen.style.display = 'flex';
        } else {
            DOMElements.chatContainer.style.display = 'flex';
            DOMElements.welcomeScreen.style.display = 'none';
            activeChat.messages.forEach(msg => {
                const sender = msg.role === 'model' ? 'ai' : 'user';
                const messageText = msg.parts?.[0]?.text || '';
                DOMElements.chatContainer.appendChild(createChatMessageElement(messageText, sender));
            });
            if (window.Prism) {
                Prism.highlightAllUnder(DOMElements.chatContainer);
            }
            DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
        }
    };

    const createNewChat = () => {
        const newChatId = `chat_${Date.now()}`;
        appState.chats.unshift({ id: newChatId, title: "New Chat", messages: [] });
        appState.currentChatId = newChatId;
        saveState();
        renderChatHistory();
        renderActiveChat();
        DOMElements.chatInput.focus();
    };

    const deleteChat = (chatIdToDelete) => {
        const wasActive = appState.currentChatId === chatIdToDelete;
        appState.chats = appState.chats.filter(c => c.id !== chatIdToDelete);

        if (wasActive) {
            if (appState.chats.length > 0) {
                appState.currentChatId = appState.chats[0].id;
                renderActiveChat();
            } else {
                createNewChat();
            }
        }
        
        saveState();
        renderChatHistory();
    };

    const handleChat = async () => {
        const userMessage = DOMElements.chatInput.value.trim();
        if (!userMessage || !appState.currentChatId) return;
        const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
        if (!activeChat) return;

        if (activeChat.messages.length === 0) {
            DOMElements.welcomeScreen.style.display = 'none';
            DOMElements.chatContainer.style.display = 'flex';
        }

        const needsTitle = activeChat.title === "New Chat";
        activeChat.messages.push({ role: 'user', parts: [{ text: userMessage }] });
        DOMElements.chatContainer.appendChild(createChatMessageElement(userMessage, "user"));
        DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
        
        DOMElements.chatInput.value = "";
        DOMElements.chatInput.style.height = "auto";
        DOMElements.sendButton.disabled = true;

        const aiMessageDiv = createChatMessageElement("", "ai");
        const aiMessageContent = aiMessageDiv.querySelector('.message');
        aiMessageContent.classList.add('streaming');
        DOMElements.chatContainer.appendChild(aiMessageDiv);
        DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: activeChat.messages.slice(-20) }),
            });
            if (!response.body) throw new Error("Response has no body.");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullAiResponse = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.substring(6).trim();
                    if (!jsonStr) continue;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textPart) {
                            fullAiResponse += textPart;
                            aiMessageContent.textContent = fullAiResponse;
                            DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
                        }
                    } catch (e) { /* Ignore partial JSON chunks */ }
                }
            }
            aiMessageContent.innerHTML = '';
            aiMessageContent.appendChild(formatMessageContent(fullAiResponse));
            if (window.Prism) {
                Prism.highlightAllUnder(aiMessageContent);
            }
            renderMathInElement(aiMessageContent);
            activeChat.messages.push({ role: 'model', parts: [{ text: fullAiResponse }] });
            if (needsTitle) {
                activeChat.title = userMessage.split(' ').slice(0, 5).join(' ');
                renderChatHistory();
            }
            saveState();
        } catch (error) {
            aiMessageContent.textContent = `Error: ${error.message}`;
        } finally {
            aiMessageContent.classList.remove('streaming');
            DOMElements.sendButton.disabled = false;
            DOMElements.chatInput.focus();
        }
    };

    // --- Event Listeners ---
    DOMElements.newChatBtn.addEventListener("click", createNewChat);
    DOMElements.sendButton.addEventListener("click", handleChat);
    DOMElements.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); }
    });
    DOMElements.chatInput.addEventListener("input", () => {
        DOMElements.chatInput.style.height = "auto";
        DOMElements.chatInput.style.height = `${DOMElements.chatInput.scrollHeight}px`;
        DOMElements.sendButton.disabled = DOMElements.chatInput.value.trim().length === 0;
    });

    DOMElements.chatContainer.addEventListener("click", (e) => {
        const copyButton = e.target.closest(".copy-button");
        if (copyButton) {
            navigator.clipboard.writeText(copyButton.dataset.content).then(() => {
                copyButton.textContent = 'Copied!';
                setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
            });
        }
    });

    DOMElements.historyContainer.addEventListener("click", (e) => {
        const chatItem = e.target.closest(".chatitem");
        if (!chatItem) return;
        const chatId = chatItem.dataset.chatId;
        if (e.target.closest(".delete-chat-btn")) {
            DOMElements.deleteModal.dataset.chatIdToDelete = chatId;
            DOMElements.deleteModal.classList.add("active");
        } else if (chatId !== appState.currentChatId) {
            appState.currentChatId = chatId;
            saveState();
            renderChatHistory();
            renderActiveChat();
        }
    });

    const setupModal = (modal, confirmBtn, cancelBtn, action) => {
        const closeModal = () => modal.classList.remove("active");
        confirmBtn.addEventListener("click", () => { action(); closeModal(); });
        cancelBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    };

    setupModal(DOMElements.deleteModal, DOMElements.confirmDeleteBtn, DOMElements.cancelDeleteBtn, () => {
        const chatId = DOMElements.deleteModal.dataset.chatIdToDelete;
        if (chatId) {
            deleteChat(chatId);
            delete DOMElements.deleteModal.dataset.chatIdToDelete;
        }
    });

    setupModal(DOMElements.clearAllModal, DOMElements.confirmClearAllBtn, DOMElements.cancelClearAllBtn, () => {
        appState.chats = [];
        appState.currentChatId = null;
        createNewChat();
    });

    DOMElements.clearHistoryBtn.addEventListener("click", () => {
        if (appState.chats.length > 0) DOMElements.clearAllModal.classList.add("active");
    });
    
    DOMElements.welcomeScreen.addEventListener("click", (e) => {
        const suggestionBtn = e.target.closest(".suggestion-btn");
        if (suggestionBtn) {
            DOMElements.chatInput.value = suggestionBtn.dataset.prompt;
            DOMElements.sendButton.disabled = false;
            handleChat();
        }
    });

    DOMElements.searchInput.addEventListener("input", (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll(".chathistory .chatitem").forEach(item => {
            item.style.display = item.textContent.toLowerCase().includes(searchTerm) ? "" : "none";
        });
    });

    // --- Theme & Sidebar ---
    const applyTheme = (theme) => {
        DOMElements.body.classList.toggle("dark-theme", theme === "dark");
        DOMElements.themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
        localStorage.setItem("theme", theme);
    };
    DOMElements.themeToggle.addEventListener("click", () => {
        applyTheme(DOMElements.body.classList.contains("dark-theme") ? "light" : "dark");
    });

    // <-- FIX 2: Reverting to the old, correct sidebar logic
    const isMobile = () => window.innerWidth <= 768;
    const toggleSidebar = () => {
        if (isMobile()) {
            DOMElements.sidebar.classList.toggle("active");
            DOMElements.overlay.classList.toggle("active");
        } else {
            DOMElements.sidebar.classList.toggle("collapsed");
            DOMElements.content.classList.toggle("full-width");
        }
    };
    DOMElements.sidebarToggle.addEventListener("click", toggleSidebar);
    DOMElements.overlay.addEventListener("click", toggleSidebar);
    window.addEventListener("resize", () => {
        if (!isMobile() && DOMElements.sidebar.classList.contains("active")) {
            DOMElements.sidebar.classList.remove("active");
            DOMElements.overlay.classList.remove("active");
        }
    });
    // End of fix

    // --- Initialization ---
    const initializeApp = () => {
        loadState();
        applyTheme(localStorage.getItem("theme") || "light");
        if (!appState.currentChatId || !appState.chats.find(c => c.id === appState.currentChatId)) {
            if (appState.chats.length > 0) {
                appState.currentChatId = appState.chats[0].id;
            } else {
                createNewChat();
                return;
            }
        }
        renderChatHistory();
        renderActiveChat();
    };

    initializeApp();
});