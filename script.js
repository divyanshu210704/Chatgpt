document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const DOMElements = {
        sidebarToggle: document.querySelector(".sidebar-toggle"),
        themeToggle: document.querySelector(".theme-toggle"),
        newChatBtn: document.querySelector(".new-chat"),
        searchInput: document.querySelector(".sidebar input[type='search']"),
        historyContainer: document.querySelector(".chathistory"),
        chatContainer: document.querySelector(".chat-container"),
        chatInput: document.querySelector(".input textarea"),
        sendButton: document.querySelector(".send-btn"),
        sidebar: document.querySelector(".sidebar"),
        overlay: document.querySelector(".overlay"),
        content: document.querySelector(".content"),
        body: document.body,
        deleteModal: document.getElementById("delete-modal"),
        confirmDeleteBtn: document.getElementById("confirm-delete-btn"),
        cancelDeleteBtn: document.getElementById("cancel-delete-btn"),
        clearHistoryBtn: document.getElementById("clear-history-btn"),
        clearAllModal: document.getElementById("clear-all-modal"),
        confirmClearAllBtn: document.getElementById("confirm-clear-all-btn"),
        cancelClearAllBtn: document.getElementById("cancel-clear-all-btn"),
        welcomeScreen: document.querySelector(".welcome-screen"),
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
        if (window.renderMathInElement) {
            try {
                window.renderMathInElement(el, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                    ],
                    throwOnError: false,
                });
            } catch (e) { console.warn("KaTeX rendering error:", e); }
        }
    };

    const createChatMessageElement = (text, sender) => {
        const wrapper = document.createElement("div");
        wrapper.className = `chat-message ${sender}`;
        const message = document.createElement("div");
        message.className = "message";
        message.textContent = text;
        // We render math after the text is set
        renderMathInElement(message);
        wrapper.appendChild(message);
        return wrapper;
    };

    const renderChatHistory = () => {
        DOMElements.historyContainer.innerHTML = "";
        if (appState.chats.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.textContent = 'No chats yet.';
            emptyMsg.className = 'empty-history-message';
            DOMElements.historyContainer.appendChild(emptyMsg);
            return;
        }
        appState.chats.forEach(chat => {
            const item = document.createElement("div");
            item.className = "chatitem";
            item.dataset.chatId = chat.id;
            item.innerHTML = `<span></span><button class="delete-chat-btn" aria-label="Delete chat">&times;</button>`;
            item.querySelector('span').textContent = chat.title;
            if (chat.id === appState.currentChatId) item.classList.add("active");
            DOMElements.historyContainer.appendChild(item);
        });
    };

    const renderActiveChat = () => {
        const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
        
        // Always clear the container first. This is the key fix.
        DOMElements.chatContainer.innerHTML = "";

        if (!activeChat || activeChat.messages.length === 0) {
            // Show welcome screen for new or empty chats
            DOMElements.chatContainer.style.display = 'none';
            DOMElements.welcomeScreen.style.display = 'flex';
            renderMathInElement(DOMElements.welcomeScreen);
        } else {
            // Show chat container and render messages for existing chats
            DOMElements.chatContainer.style.display = 'flex';
            DOMElements.welcomeScreen.style.display = 'none';
            activeChat.messages.forEach(msg => {
                const sender = msg.role === 'model' ? 'ai' : 'user';
                const messageText = msg.parts && msg.parts[0] ? msg.parts[0].text : '';
                DOMElements.chatContainer.appendChild(createChatMessageElement(messageText, sender));
            });
            DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
        }
    };

    // --- Core Chat Logic ---
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
            // If the active chat was deleted, switch to the next available chat or create a new one.
            if (appState.chats.length > 0) {
                appState.currentChatId = appState.chats[0].id;
                renderActiveChat();
            } else {
                // No chats left, create a fresh one.
                createNewChat();
            }
        }
        
        saveState();
        renderChatHistory(); // Re-render history regardless
    };

    const handleChat = async () => {
        const userMessage = DOMElements.chatInput.value.trim();
        if (!userMessage || !appState.currentChatId) return;

        const activeChat = appState.chats.find(c => c.id === appState.currentChatId);
        if (!activeChat) return;

        // If this is the first message, hide welcome screen and show chat
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
                        if (parsed.__error) {
                            console.error("SERVER-SIDE API ERROR:", parsed.__error);
                            continue;
                        }
                        const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (textPart) {
                            fullAiResponse += textPart;
                            aiMessageContent.textContent = fullAiResponse;
                            DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
                        }
                    } catch (e) { /* Ignore JSON parsing errors on partial chunks */ }
                }
            }

            if (fullAiResponse) {
                activeChat.messages.push({ role: 'model', parts: [{ text: fullAiResponse }] });
                if (needsTitle) {
                    activeChat.title = userMessage.split(' ').slice(0, 5).join(' ') + '...';
                    renderChatHistory();
                }
                saveState();
            }
        } catch (error) {
            aiMessageContent.textContent = `Error: ${error.message}`;
            console.error("Client-side fetch error:", error);
        } finally {
            aiMessageContent.classList.remove('streaming');
            renderMathInElement(aiMessageContent);
            DOMElements.sendButton.disabled = false;
            DOMElements.chatInput.focus();
        }
    };

    // --- Event Listeners ---
    DOMElements.newChatBtn.addEventListener("click", createNewChat);
    DOMElements.sendButton.addEventListener("click", handleChat);
    DOMElements.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleChat();
        }
    });
    DOMElements.chatInput.addEventListener("input", () => {
        DOMElements.chatInput.style.height = "auto";
        DOMElements.chatInput.style.height = `${DOMElements.chatInput.scrollHeight}px`;
        DOMElements.sendButton.disabled = DOMElements.chatInput.value.trim().length === 0;
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

    const closeModal = () => {
        DOMElements.deleteModal.classList.remove("active");
        delete DOMElements.deleteModal.dataset.chatIdToDelete;
    };
    DOMElements.confirmDeleteBtn.addEventListener("click", () => {
        const chatId = DOMElements.deleteModal.dataset.chatIdToDelete;
        if (chatId) deleteChat(chatId);
        closeModal();
    });
    DOMElements.cancelDeleteBtn.addEventListener("click", closeModal);
    DOMElements.deleteModal.addEventListener("click", (e) => {
        if (e.target === DOMElements.deleteModal) closeModal();
    });

    DOMElements.clearHistoryBtn.addEventListener("click", () => {
        if (appState.chats.length > 0) {
            DOMElements.clearAllModal.classList.add("active");
        }
    });
    const closeClearAllModal = () => DOMElements.clearAllModal.classList.remove("active");
    DOMElements.confirmClearAllBtn.addEventListener("click", () => {
        appState.chats = [];
        appState.currentChatId = null;
        createNewChat();
        closeClearAllModal();
    });
    DOMElements.cancelClearAllBtn.addEventListener("click", closeClearAllModal);
    DOMElements.clearAllModal.addEventListener("click", (e) => {
        if (e.target === DOMElements.clearAllModal) closeClearAllModal();
    });

    DOMElements.welcomeScreen.addEventListener("click", (e) => {
        const suggestionButton = e.target.closest(".suggestion-btn");
        if (suggestionButton) {
            const promptText = suggestionButton.dataset.prompt;
            if (promptText) {
                DOMElements.chatInput.value = promptText;
                DOMElements.sendButton.disabled = false;
                handleChat();
            }
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
    };
    DOMElements.themeToggle.addEventListener("click", () => {
        const newTheme = DOMElements.body.classList.contains("dark-theme") ? "light" : "dark";
        localStorage.setItem("theme", newTheme);
        applyTheme(newTheme);
    });

    const isMobile = () => window.innerWidth <= 768;
    const toggleSidebar = () => {
        const isCollapsed = DOMElements.sidebar.classList.contains("collapsed");
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

    // --- Initialization ---
    const initializeApp = () => {
        loadState();
        const preferredTheme = localStorage.getItem("theme") || "light";
        applyTheme(preferredTheme);

        if (!appState.currentChatId || !appState.chats.find(c => c.id === appState.currentChatId)) {
            if (appState.chats.length > 0) {
                appState.currentChatId = appState.chats[0].id;
            } else {
                createNewChat();
                return; // createNewChat handles rendering, so we exit here
            }
        }
        
        renderChatHistory();
        const waitForKaTeX = () => {
            if (window.renderMathInElement) {
                renderActiveChat();
            } else {
                setTimeout(waitForKaTeX, 50);
            }
        };
        waitForKaTeX();
        DOMElements.sendButton.disabled = DOMElements.chatInput.value.trim().length === 0;
    };

    initializeApp();
});