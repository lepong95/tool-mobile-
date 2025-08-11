// Global variables
let currentProjectId = null;
let calendar = null;
const STORAGE_KEY = 'projectData';
const API_KEY_STORAGE = 'groqApiKey'; // Switched to Groq
const ARCHIVE_KEY = 'projectArchive';
let chainingState = { active: false, firstTaskId: null };
let charts = { statusPie: null, monthlyCompletion: null };

// ==================
// COMMAND PALETTE
// ==================
const CommandPalette = {
    isOpen: false,
    selectedIndex: 0,
    commands: [],

    init() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }
            if (this.isOpen && e.key === 'Escape') {
                this.close();
            }
            if (this.isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
                e.preventDefault();
                this.navigate(e.key);
            }
        });

        const input = document.getElementById('commandPaletteInput');
        input.addEventListener('input', () => this.filter());

        document.getElementById('commandPaletteModal').addEventListener('click', (e) => {
            if (e.target.id === 'commandPaletteModal') {
                this.close();
            }
        });
    },

    toggle() {
        this.isOpen ? this.close() : this.open();
    },

    open() {
        this.isOpen = true;
        this.generateCommands();
        this.filter();
        openModal('commandPaletteModal');
        document.getElementById('commandPaletteInput').focus();
    },

    close() {
        this.isOpen = false;
        closeModal('commandPaletteModal');
        document.getElementById('commandPaletteInput').value = '';
    },

    generateCommands() {
        this.commands = [];
        // Add navigation commands
        document.querySelectorAll('.sidebar-link[data-view]').forEach(link => {
            this.commands.push({
                icon: link.querySelector('.sidebar-icon').textContent,
                title: `前往 ${link.textContent.trim()}`,
                path: '導航',
                action: () => {
                    link.click();
                    this.close();
                }
            });
        });
        // Add "New Task" command
        this.commands.push({
            icon: '➕',
            title: '新增任務',
            path: '操作',
            action: () => {
                addNewTask();
                this.close();
            }
        });
        // Add tasks from current project
        const project = getCurrentProject();
        if (project && project.tasks) {
            project.tasks.forEach(task => {
                this.commands.push({
                    icon: '🗂️',
                    title: `開啟任務: ${task.taskName}`,
                    path: `專案: ${project.name}`,
                    action: () => {
                        editTask(task.id);
                        this.close();
                    }
                });
            });
        }
    },

    filter() {
        const input = document.getElementById('commandPaletteInput').value.toLowerCase();
        const resultsContainer = document.getElementById('commandPaletteResults');
        let html = '';

        // Natural Language Task Creation Logic
        const naturalLanguageCommand = this.parseNaturalLanguage(input);
        if (naturalLanguageCommand) {
            html += `
                <div class="cp-item selected" data-index="0" data-natural="true">
                    <span class="cp-item-icon">🤖</span>
                    <div class="cp-item-details">
                        <div class="cp-item-title">使用 AI 創建任務: "${naturalLanguageCommand}"</div>
                        <div class="cp-item-path">按 Enter 執行</div>
                    </div>
                </div>
            `;
        }

        const filteredCommands = this.commands.filter(cmd => cmd.title.toLowerCase().includes(input) || cmd.path.toLowerCase().includes(input));

        if (filteredCommands.length === 0 && !naturalLanguageCommand) {
            resultsContainer.innerHTML = '<div class="cp-item">找不到結果。</div>';
            return;
        }

        this.selectedIndex = 0;
        html += filteredCommands.map((cmd, index) => `
            <div class="cp-item ${index === 0 && !naturalLanguageCommand ? 'selected' : ''}" data-index="${index}">
                <span class="cp-item-icon">${cmd.icon}</span>
                <div class="cp-item-details">
                    <div class="cp-item-title">${cmd.title}</div>
                    <div class="cp-item-path">${cmd.path}</div>
                </div>
            </div>
        `).join('');
        
        resultsContainer.innerHTML = html;

        resultsContainer.querySelectorAll('.cp-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectedIndex = parseInt(item.dataset.index);
                this.execute(item.dataset.natural === 'true');
            });
        });
    },
    
    navigate(key) {
        const items = document.querySelectorAll('#commandPaletteResults .cp-item');
        if (items.length === 0 || items[0].textContent === '找不到結果。') return;

        items[this.selectedIndex].classList.remove('selected');

        if (key === 'ArrowDown') {
            this.selectedIndex = (this.selectedIndex + 1) % items.length;
        } else if (key === 'ArrowUp') {
            this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        } else if (key === 'Enter') {
            const selectedItem = items[this.selectedIndex];
            this.execute(selectedItem.dataset.natural === 'true');
        }
        
        items[this.selectedIndex].classList.add('selected');
        items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    },

    execute(isNaturalLanguage = false) {
        if (isNaturalLanguage) {
            const input = document.getElementById('commandPaletteInput').value;
            this.handleNaturalLanguageTask(input);
            return;
        }

        const input = document.getElementById('commandPaletteInput').value.toLowerCase();
        const filteredCommands = this.commands.filter(cmd => cmd.title.toLowerCase().includes(input) || cmd.path.toLowerCase().includes(input));
        
        if (filteredCommands[this.selectedIndex]) {
            filteredCommands[this.selectedIndex].action();
        }
    },

    parseNaturalLanguage(text) {
        const keywords = ['create task', 'add task', 'new task', 'remind me to', '新增任務', '建立任務'];
        const lowerText = text.toLowerCase();
        if (keywords.some(kw => lowerText.startsWith(kw)) && text.length > 15) {
            return text;
        }
        return null;
    },

    async handleNaturalLanguageTask(text) {
        this.close();
        showNotification('🤖 正在使用 AI 解析您的指令...', 'info');

        const prompt = `
            Parse the following natural language text into a structured task JSON object.
            Today's date is ${new Date().toISOString().split('T')[0]}.
            Extract the task name, purpose, priority, and due date.
            - "taskName": A concise, formal name for the task.
            - "taskPurpose": A brief description of the task's goal.
            - "priority": Can be "low", "medium", "high", or "urgent". Infer from keywords.
            - "taskDueDate": Calculate the date if relative terms like "tomorrow" or "next Friday" are used.
            If any field cannot be determined, return an empty string for it.
            User Input: "${text}"
            
            You must respond with only a single, valid JSON object in the format: {"taskName": "...", "taskPurpose": "...", "priority": "...", "taskDueDate": "..."}
        `;

        const result = await callGroqAPI(prompt, true);

        if (result) {
            addNewTask(); // Open a blank task modal first
            // Now fill it with the AI's response
            document.getElementById('taskName').value = result.taskName || '';
            document.getElementById('taskPurpose').value = result.taskPurpose || '';
            document.getElementById('taskPriority').value = result.priority || 'medium';
            document.getElementById('taskDueDate').value = result.taskDueDate || '';
            showNotification('AI 已為您填寫任務！', 'success');
        } else {
            showNotification('AI 無法解析您的指令。', 'error');
        }
    }
};


// ==================
// AI ASSISTANT (Powered by Groq with Llama 3 70B)
// ==================

async function callGroqAPI(prompt, isJson = false) {
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (!apiKey) {
        showNotification('請先在設定中輸入您的 Groq API Key。', 'error');
        return null;
    }

    const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

    const payload = {
        model: "llama3-70b-8192", 
        messages: [{ role: "user", content: prompt }],
    };

    if (isJson) {
        payload.response_format = { type: "json_object" };
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('API Error Response:', errorBody);
            throw new Error(`API request failed: ${errorBody.error.message}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        if (isJson) {
            return JSON.parse(content);
        }
        return content;

    } catch (error) {
        console.error('Error calling Groq API:', error);
        showNotification(`AI 功能出錯: ${error.message}`, 'error');
        return null;
    }
}

async function autofillTaskDetails() {
    const taskNameInput = document.getElementById('taskName');
    const taskName = taskNameInput.value.trim();
    if (!taskName) {
        showNotification('請先輸入任務名稱。', 'warning');
        return;
    }

    const button = document.getElementById('autofillTaskButton');
    button.disabled = true;
    button.textContent = '...';

    const prompt = `
        Analyze the following user input and return a JSON object with suggestions for "taskName", "taskPurpose", "priority", and "taskDueDate".
        The "taskName" should be a concise, formal version of the user's input.
        Today's date is ${new Date().toISOString().split('T')[0]}.
        Priorities can be "low", "medium", "high", or "urgent".
        If the input mentions a specific date or relative time (e.g., "next week", "end of month"), calculate the taskDueDate. Otherwise, suggest a reasonable due date (e.g., 7 days from today).
        User Input: "${taskName}"
        
        You must respond with only a single, valid JSON object in the format: {"taskName": "...", "taskPurpose": "...", "priority": "...", "taskDueDate": "YYYY-MM-DD"}
    `;

    const result = await callGroqAPI(prompt, true);

    if (result) {
        document.getElementById('taskName').value = result.taskName || taskName;
        document.getElementById('taskPurpose').value = result.taskPurpose || '';
        document.getElementById('taskPriority').value = result.priority || 'medium';
        document.getElementById('taskDueDate').value = result.taskDueDate || '';
        showNotification('AI 已自動填寫欄位！', 'success');
    }

    button.disabled = false;
    button.textContent = '✨';
}

async function generateActionPlan() {
    const taskName = document.getElementById('taskName').value.trim();
    if (!taskName) {
        showNotification('請先輸入任務名稱以生成行動計畫。', 'warning');
        return;
    }

    const container = document.getElementById('actionPlanContainer');
    container.innerHTML = '<div class="loading"></div>';

    const prompt = `
        Based on the task "${taskName}", generate a concise action plan with 3-7 simple, actionable steps.
        You must respond with only a single, valid JSON object with a single key "steps", which is an array of strings.
        Example format: {"steps": ["First step", "Second step", "Third step"]}
    `;
    
    const result = await callGroqAPI(prompt, true);

    if (result && result.steps) {
        const task = { actionPlan: result.steps.map(step => ({ text: step, completed: false })) };
        renderActionPlan(task);
    } else {
        container.innerHTML = '<p>無法生成行動計畫，請稍後再試。</p>';
    }
}

function renderActionPlan(task) {
    const container = document.getElementById('actionPlanContainer');
    if (!task.actionPlan || task.actionPlan.length === 0) {
        container.innerHTML = '<p>此任務沒有行動計畫。點擊按鈕以生成建議。</p>';
        return;
    }

    container.innerHTML = task.actionPlan.map(item => `
        <div class="action-plan-item">
            <input type="checkbox" ${item.completed ? 'checked' : ''}>
            <span>${escapeHtml(item.text)}</span>
        </div>
    `).join('');

    // Add event listeners for auto-saving when a checkbox is clicked
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            saveTask(); // Auto-save without closing the modal
            showNotification('進度已儲存', 'info');
        });
    });
}

async function estimateTaskTime() {
    const taskName = document.getElementById('taskName').value.trim();
    if (!taskName) {
        showNotification('請先輸入任務名称以估算時間。', 'warning');
        return;
    }

    const button = document.getElementById('estimateTimeButton');
    button.disabled = true;
    button.textContent = '...';

    const prompt = `
        Estimate the time required to complete the following task.
        Provide a short, realistic time estimate (e.g., "1-2 hours", "3 days", "Approx. 30 minutes").
        Task: "${taskName}"
        Return only the estimated time as a string.
    `;

    const result = await callGroqAPI(prompt);

    if (result) {
        document.getElementById('taskTimeEstimate').value = result;
        showNotification('AI 已估算時間！', 'success');
    }

    button.disabled = false;
    button.textContent = '⏱️';
}

async function assessTaskRisk() {
    const taskName = document.getElementById('taskName').value.trim();
    const priority = document.getElementById('taskPriority').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const dependencies = Array.from(document.querySelectorAll('#dependencySelector .dependency-item')).length;

    if (!taskName) {
        showNotification('請先輸入任務名稱以評估風險。', 'warning');
        return;
    }

    const button = document.getElementById('assessRiskButton');
    button.disabled = true;
    const resultDiv = document.getElementById('riskAssessmentResult');
    resultDiv.innerHTML = '<div class="loading"></div>';

    const prompt = `
        Assess the risk level of the following task based on its properties.
        Today's date is ${new Date().toISOString().split('T')[0]}.
        Task properties:
        - Name: "${taskName}"
        - Priority: "${priority}"
        - Due Date: "${dueDate}"
        - Number of dependencies: ${dependencies}

        Analyze these factors. A task with a high priority, an imminent due date, and multiple dependencies is high risk. A low priority task with a distant due date and no dependencies is low risk.
        You must respond with only a single, valid JSON object with two keys: "riskLevel" (a single word: "Low", "Medium", or "High") and "reason" (a brief, one-sentence explanation in Traditional Chinese).
        Example: {"riskLevel": "High", "reason": "此任務優先級高且有多個依賴項，延誤風險較大。"}
    `;

    const result = await callGroqAPI(prompt, true);

    if (result && result.riskLevel) {
        resultDiv.textContent = result.reason;
        resultDiv.className = 'risk-assessment-result'; // Reset classes
        resultDiv.classList.add(`risk-${result.riskLevel.toLowerCase()}`);
        
        // Also save this to the task object for persistence
        const taskId = document.getElementById('editingTaskId').value;
        if (taskId) {
            const project = getCurrentProject();
            const task = project.tasks.find(t => t.id == taskId);
            if (task) {
                task.riskAssessment = result;
                saveProject(project);
            }
        }
    } else {
        resultDiv.textContent = '無法評估風險，請稍後再試。';
    }

    button.disabled = false;
}

async function generateWeeklyReflection() {
    const container = document.getElementById('weeklyReflectionContainer');
    container.innerHTML = '<div class="loading">正在分析您過去一週的數據...</div>';

    const allProjects = getActiveProjects();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let weeklyData = {
        completedTasks: [],
        overdueTasks: [],
        createdTasks: 0
    };

    allProjects.forEach(project => {
        (project.tasks || []).forEach(task => {
            const createdDate = new Date(task.created);
            if (createdDate >= oneWeekAgo) {
                weeklyData.createdTasks++;
            }
            if (task.status === '已完成') {
                const completionDate = (task.history || []).find(h => h.note.includes('已完成'));
                if (completionDate && new Date(completionDate.date) >= oneWeekAgo) {
                    weeklyData.completedTasks.push(task.taskName);
                }
            } else if (task.taskDueDate && new Date(task.taskDueDate) < new Date()) {
                weeklyData.overdueTasks.push(task.taskName);
            }
        });
    });

    const prompt = `
        Analyze the following weekly performance data for a project manager and provide a concise, insightful reflection in Traditional Chinese (zh-TW).
        
        Data for the last 7 days:
        - New tasks created: ${weeklyData.createdTasks}
        - Tasks completed: ${weeklyData.completedTasks.length} (${weeklyData.completedTasks.join(', ')})
        - Tasks currently overdue: ${weeklyData.overdueTasks.length} (${weeklyData.overdueTasks.join(', ')})

        Structure your response into three short paragraphs:
        1.  **成就 (Accomplishments):** Start with a positive summary of what was completed.
        2.  **挑戰 (Challenges):** Point out any potential issues, like the number of overdue tasks, in a constructive way.
        3.  **建議 (Suggestions):** Offer one or two simple, actionable suggestions for the upcoming week based on the data.
    `;

    const result = await callGroqAPI(prompt);

    if (result) {
        container.innerHTML = `
            <h3 style="margin-bottom: 1rem;">本週回顧</h3>
            <div class="reflection-content">${result.replace(/\n/g, '<br>')}</div>
            <button id="generateReflectionButton" class="btn btn-primary" style="margin-top: 1rem;">重新產生</button>
        `;
    } else {
        container.innerHTML = `
            <p>無法產生反思報告，請稍後再試。</p>
            <button id="generateReflectionButton" class="btn btn-primary" style="margin-top: 1rem;">再試一次</button>
        `;
    }
    // Re-attach listener to the new button
    document.getElementById('generateReflectionButton').addEventListener('click', generateWeeklyReflection);
}
async function suggestDailyFocus() {
    const container = document.getElementById('myDayContainer');
    container.innerHTML = '<div class="loading">🤖 AI 正在分析您的任務並建議今日焦點...</div>';

    const allProjects = getActiveProjects();
    const today = new Date().toISOString().split('T')[0];
    let tasksForToday = [];

    allProjects.forEach(project => {
        (project.tasks || []).forEach(task => {
            const isDueToday = task.taskDueDate === today && task.status !== '已完成';
            const isOverdue = task.taskDueDate < today && task.status !== '已完成';
            if (isDueToday || isOverdue) {
                tasksForToday.push({ 
                    name: task.taskName, 
                    priority: task.priority, 
                    project: project.name,
                    isOverdue: isOverdue
                });
            }
        });
    });

    if (tasksForToday.length === 0) {
        container.innerHTML = '<div class="card"><p style="text-align: center;">🎉 今天沒有到期或逾期的任務！</p></div>';
        return;
    }

    const prompt = `
        As a helpful project assistant, analyze the following list of tasks for today (${today}) and suggest a prioritized focus plan.
        The user is a project manager in Hong Kong.

        Tasks: ${JSON.stringify(tasksForToday)}

        Your response should be in Traditional Chinese (zh-TW) and structured as follows:
        1.  Start with a brief, encouraging opening sentence.
        2.  Create a short, prioritized list of the top 3-5 most critical tasks.
        3.  For each task in the list, briefly explain *why* it's a priority (e.g., "這是緊急任務且已逾期").
        4.  End with a short, motivating closing sentence.
    `;

    const result = await callGroqAPI(prompt);

    if (result) {
        container.innerHTML = `
            <div class="card morning-briefing-card">
                <h2 class="briefing-header">今日焦點建議</h2>
                <p class="briefing-summary">${result.replace(/\n/g, '<br>')}</p>
            </div>
        `;
    } else {
        container.innerHTML = '<div class="card"><p>無法生成建議，請稍後再試。</p></div>';
    }
}

// ==================
// SETTINGS
// ==================
function openSettingsModal() {
    document.getElementById('apiKey').value = localStorage.getItem(API_KEY_STORAGE) || '';
    openModal('settingsModal');
}

function saveApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
        localStorage.setItem(API_KEY_STORAGE, apiKey);
        showNotification('API Key 已儲存！', 'success');
        closeModal('settingsModal');
    } else {
        showNotification('請輸入有效的 API Key。', 'warning');
    }
}


// ==================
// NOTIFICATIONS MANAGER
// ==================
const Notifications = {
    init() {
        if (!("Notification" in window)) {
            console.log("This browser does not support desktop notification");
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    console.log("Notification permission granted.");
                    this.checkAndSendDailyNotifications();
                }
            });
        }
    },

    checkAndSendDailyNotifications() {
        const today = new Date().toISOString().split('T')[0];
        const lastCheck = localStorage.getItem('lastNotificationCheck');

        if (lastCheck === today) {
            console.log("Daily notifications have already been checked today.");
            return;
        }

        console.log("Performing daily notification check...");
        const allProjects = getActiveProjects();
        let notificationsToSend = [];
        
        allProjects.forEach(project => {
            if (!project.tasks) return;
            
            const alerts = this.getAlertsForProject(project);
            alerts.followUpAlerts.forEach(alert => {
                notificationsToSend.push({
                    title: `跟進提醒: ${alert.task.taskName}`,
                    body: `應執行動作: ${alert.action}`,
                    projectId: project.id
                });
            });
            alerts.stalledTaskAlerts.forEach(alert => {
                notificationsToSend.push({
                    title: `靜止任務提醒: ${alert.task.taskName}`,
                    body: `此任務已超過 ${alert.days} 天沒有更新。`,
                    projectId: project.id
                });
            });
        });

        if (notificationsToSend.length > 0) {
            this.sendNotifications(notificationsToSend);
        }

        localStorage.setItem('lastNotificationCheck', today);
    },

    sendNotifications(notifications) {
        if (Notification.permission !== "granted") return;

        notifications.forEach((note, index) => {
            setTimeout(() => {
                const notification = new Notification(note.title, {
                    body: note.body,
                    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📊</text></svg>'
                });
                notification.onclick = () => {
                    window.focus();
                    switchToProject(note.projectId);
                };
            }, index * 1000); // Stagger notifications slightly
        });
    },
    
    // This is a helper that reuses the logic from the dashboard alerts
    getAlertsForProject(project) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let followUpAlerts = [];
        let stalledTaskAlerts = [];
        const STALLED_DAYS = 5;

        (project.tasks || []).forEach(task => {
            if (task.status === '已完成') return;
            // Use the creation date if no history exists
            const lastUpdateDate = (task.history && task.history.length > 0) 
                ? new Date(task.history[task.history.length - 1].date)
                : new Date(task.created);

            const daysSinceUpdate = (today - lastUpdateDate) / (1000 * 60 * 60 * 24);

            let hasActiveFollowUp = false;
            if (task.followUp && task.followUp.enabled) {
                task.followUp.chain.forEach(rule => {
                    if (daysSinceUpdate >= parseInt(rule.days)) {
                        followUpAlerts.push({ task, action: rule.action, project });
                        hasActiveFollowUp = true;
                    }
                });
            }

            const isWaitingStatus = ['待審批', '待製作'].includes(task.status);
            if (!hasActiveFollowUp && isWaitingStatus && daysSinceUpdate >= STALLED_DAYS) {
                stalledTaskAlerts.push({ task, days: Math.floor(daysSinceUpdate), project });
            }
        });
        return { followUpAlerts, stalledTaskAlerts };
    }
};


// ==================
// REPORTS
// ==================
const Reports = {
    render() {
        const project = getCurrentProject();
        if (!project || !project.tasks || project.tasks.length === 0) {
            document.getElementById('reportsView').innerHTML = `
                <h1 class="view-title">專案報告</h1>
                <p>沒有足夠的數據來生成報告。</p>
            `;
            return;
        }

        // Restore original HTML if it was replaced by the no-data message
        const reportsView = document.getElementById('reportsView');
        if (!reportsView.querySelector('canvas')) {
            reportsView.innerHTML = `
                <h1 class="view-title">專案報告</h1>
                 <div class="card">
                    <h2 class="section-title">AI 每週反思</h2>
                    <div id="weeklyReflectionContainer">
                        <p>分析您過去一週的工作效率、瓶頸和成就。</p>
                        <button id="generateReflectionButton" class="btn btn-primary" style="margin-top: 1rem;">產生本週反思</button>
                    </div>
                </div>
                <div class="grid grid-cols-2">
                    <div class="card">
                        <h3>任務狀態分佈</h3>
                        <canvas id="statusPieChart"></canvas>
                    </div>
                    <div class="card">
                        <h3>績效指標</h3>
                        <div id="performanceMetrics"></div>
                    </div>
                </div>
                <div class="card">
                    <h3>每月完成任務數量</h3>
                    <canvas id="monthlyCompletionChart"></canvas>
                </div>
            `;
        }
        document.getElementById('generateReflectionButton').addEventListener('click', generateWeeklyReflection);

        this.renderStatusPieChart(project.tasks);
        this.renderMonthlyCompletionChart(project.tasks);
        this.renderPerformanceMetrics(project.tasks);
    },

    renderStatusPieChart(tasks) {
        const ctx = document.getElementById('statusPieChart').getContext('2d');
        const statusCounts = tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {});

        const statusColors = {
            '待辦': '#f97316', '內容準備中': '#3b82f6', '設計中': '#8b5cf6',
            '待審批': '#eab308', '待製作': '#ef4444', '已完成': '#22c55e'
        };

        if (charts.statusPie) {
            charts.statusPie.destroy();
        }

        charts.statusPie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: Object.keys(statusCounts).map(status => statusColors[status] || '#6b7280'),
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                }
            }
        });
    },

    renderMonthlyCompletionChart(tasks) {
        const ctx = document.getElementById('monthlyCompletionChart').getContext('2d');
        const monthlyData = {};

        // Initialize last 12 months
        for (let i = 11; i >= 0; i--) {
            let d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = 0;
        }

        tasks.forEach(task => {
            if (task.status === '已完成' && task.taskDueDate) {
                const date = new Date(task.taskDueDate);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyData.hasOwnProperty(monthKey)) {
                    monthlyData[monthKey]++;
                }
            }
        });

        if (charts.monthlyCompletion) {
            charts.monthlyCompletion.destroy();
        }

        charts.monthlyCompletion = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(monthlyData),
                datasets: [{
                    label: '完成的任務',
                    data: Object.values(monthlyData),
                    backgroundColor: 'rgba(79, 70, 229, 0.6)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    },

    renderPerformanceMetrics(tasks) {
        const container = document.getElementById('performanceMetrics');
        const completedTasks = tasks.filter(t => t.status === '已完成' && t.taskStartDate && t.taskDueDate);

        let totalDuration = 0;
        completedTasks.forEach(task => {
            const start = new Date(task.taskStartDate);
            const end = new Date(task.taskDueDate);
            const duration = (end - start) / (1000 * 60 * 60 * 24);
            if (duration >= 0) {
                totalDuration += duration;
            }
        });

        const avgDuration = completedTasks.length > 0 ? (totalDuration / completedTasks.length).toFixed(1) : 0;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="number">${tasks.length}</div>
                    <div class="label">總任務數</div>
                </div>
                <div class="stat-card">
                    <div class="number">${completedTasks.length}</div>
                    <div class="label">已完成任務</div>
                </div>
                <div class="stat-card">
                    <div class="number">${avgDuration} 天</div>
                    <div class="label">平均完成時長</div>
                </div>
            </div>
        `;
    }
};

// ==================
// GLOBAL SEARCH
// ==================
const GlobalSearch = {
    debounceTimer: null,

    init() {
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const query = e.target.value.trim();
                    if (query.length > 1) {
                        this.performSearch(query);
                    } else {
                        // If search is cleared, go back to dashboard
                        const searchView = document.getElementById('searchResultsView');
                        if (searchView.classList.contains('active')) {
                           switchView(document.querySelector('[data-view="dashboard"]'), 'dashboard');
                        }
                    }
                }, 300); // Debounce for 300ms
            });
        }
    },

    performSearch(query) {
        const allProjects = getActiveProjects();
        let results = [];
        const lowerCaseQuery = query.toLowerCase();

        allProjects.forEach(project => {
            // Search tasks
            (project.tasks || []).forEach(task => {
                if (task.taskName.toLowerCase().includes(lowerCaseQuery) || (task.taskDescription && task.taskDescription.toLowerCase().includes(lowerCaseQuery))) {
                    results.push({ type: '任務', item: task, project: project });
                }
            });
            // Search files
            (project.files || []).forEach(file => {
                if (file.fileName.toLowerCase().includes(lowerCaseQuery)) {
                    results.push({ type: '檔案', item: file, project: project });
                }
            });
            // Search meetings
            (project.meetings || []).forEach(meeting => {
                if ((meeting.meetingNotes && meeting.meetingNotes.toLowerCase().includes(lowerCaseQuery)) || (meeting.meetingAttendees && meeting.meetingAttendees.toLowerCase().includes(lowerCaseQuery))) {
                    results.push({ type: '會議', item: meeting, project: project });
                }
            });
            // Search contacts
            (project.contacts || []).forEach(contact => {
                if (contact.contactName.toLowerCase().includes(lowerCaseQuery) || (contact.contactRole && contact.contactRole.toLowerCase().includes(lowerCaseQuery))) {
                    results.push({ type: '聯絡人', item: contact, project: project });
                }
            });
        });
        
        this.renderResults(results, query);
    },

    renderResults(results, query) {
        switchView(document.querySelector('[data-view="dashboard"]'), 'searchResultsView');
        const container = document.getElementById('searchResultsContainer');
        const title = document.querySelector('#searchResultsView .view-title');
        
        title.textContent = `搜索結果 "${query}"`;

        if (results.length === 0) {
            container.innerHTML = '<p>找不到符合條件的項目。</p>';
            return;
        }

        container.innerHTML = results.map(result => {
            let name = result.item.taskName || result.item.fileName || `會議於 ${result.item.meetingDate}` || result.item.contactName;
            let snippet = result.item.taskDescription || result.item.taskPurpose || result.item.meetingNotes || result.item.contactRole || '';
            
            // Create highlighted name and snippet
            const regex = new RegExp(`(${query})`, 'gi');
            const highlightedName = name.replace(regex, `<mark>$1</mark>`);
            const highlightedSnippet = snippet ? snippet.replace(regex, `<mark>$1</mark>`) : '';

            return `
                <div class="search-result-item">
                    <h3>${highlightedName}</h3>
                    <div class="search-result-meta">
                        在專案 <span class="project-name">${escapeHtml(result.project.name)}</span> 中找到的 <span class="item-type">${result.type}</span>
                    </div>
                    ${snippet ? `<p class="search-result-snippet">${highlightedSnippet}</p>` : ''}
                    <div class="search-result-actions">
                        <button class="btn btn-primary btn-small" onclick="goToSearchResult(${result.project.id}, ${result.item.id}, '${result.type}')">前往項目</button>
                    </div>
                </div>
            `;
        }).join('');
    }
};

function goToSearchResult(projectId, itemId, itemType) {
    // Switch to the correct project first
    switchToProject(projectId);

    // Use a timeout to ensure the project data has loaded before we try to open the modal
    setTimeout(() => {
        switch (itemType) {
            case '任務':
                editTask(itemId);
                break;
            case '檔案':
                editFile(itemId);
                break;
            case '會議':
                editMeeting(itemId);
                break;
            case '聯絡人':
                editContact(itemId);
                break;
        }
    }, 200);
}


// ==================
// DEPENDENCY MANAGER (Full Implementation)
// ==================
const DependencyManager = {
    init() {
        // Listener for the filter on the task board
        const dependencyFilter = document.getElementById('dependencyFilter');
        if (dependencyFilter) {
            dependencyFilter.addEventListener('change', renderTaskBoard);
        }
        // Listeners for buttons on the dependency view page
        document.getElementById('validateAllDependencies')?.addEventListener('click', () => this.validateDependencies(true));
        document.getElementById('autoScheduleAll')?.addEventListener('click', () => this.autoSchedule());
        document.getElementById('detectConflicts')?.addEventListener('click', () => this.validateDependencies(true));
    },

    // Checks if a task is blocked by any incomplete dependencies
    isBlocked(task, project) {
        if (!task.dependencies || task.dependencies.length === 0) {
            return false;
        }
        return task.dependencies.some(depId => {
            const dependencyTask = project.tasks.find(t => t.id == depId);
            return !dependencyTask || dependencyTask.status !== '已完成';
        });
    },

    // Gets tasks that this task depends on (prerequisites) and tasks that depend on this one (successors)
    getRelatedTasks(task, project) {
        const dependencies = (task.dependencies || []).map(id => project.tasks.find(t => t.id == id)).filter(Boolean);
        const dependents = project.tasks.filter(t => t.dependencies && t.dependencies.includes(task.id));
        return { dependencies, dependents };
    },
    
    // Updates the 'isBlocked' state on all tasks in a project
    updateAllTaskStates(project) {
        if (!project || !project.tasks) return;
        project.tasks.forEach(task => {
            task.isBlocked = this.isBlocked(task, project);
        });
        saveProject(project); // Save the updated states back to storage
    },

    // Comprehensive validation for all dependencies
    validateDependencies(showAlerts = false) {
        const project = getCurrentProject();
        if (!project || !project.tasks) return [];
        
        let conflicts = [];
        const taskMap = new Map(project.tasks.map(t => [t.id, t]));

        project.tasks.forEach(task => {
            if (!task.dependencies) return;

            // 1. Check for Orphaned Dependencies
            task.dependencies.forEach(depId => {
                if (!taskMap.has(depId)) {
                    conflicts.push({ type: '依賴丟失', description: `任務 "${task.taskName}" 依賴於一個已刪除的任務 (ID: ${depId})` });
                }
            });

            // 2. Check for Date Conflicts
            task.dependencies.forEach(depId => {
                const prereq = taskMap.get(depId);
                if (prereq && task.taskStartDate && prereq.taskDueDate) {
                    const prereqDueDate = new Date(prereq.taskDueDate);
                    const taskStartDate = new Date(task.taskStartDate);
                    const buffer = (prereq.bufferDays || 0) * 86400000;
                    if (taskStartDate < prereqDueDate.getTime() + buffer) {
                        conflicts.push({ type: '日期衝突', description: `任務 "${task.taskName}" (${task.taskStartDate}) 在其前置任務 "${prereq.taskName}" (${prereq.taskDueDate}) 完成前就開始了。` });
                    }
                }
            });
            
            // 3. Check for Circular Dependencies
            const path = [task.id];
            function findCycle(currentTaskId) {
                const currentTask = taskMap.get(currentTaskId);
                if (!currentTask || !currentTask.dependencies) return;

                for (const depId of currentTask.dependencies) {
                    if (path.includes(depId)) {
                        const cyclePath = [...path, depId].map(id => taskMap.get(id)?.taskName).join(' -> ');
                        const conflictExists = conflicts.some(c => c.description.includes(cyclePath));
                        if (!conflictExists) {
                             conflicts.push({ type: '循環依賴', description: `發現循環依賴: ${cyclePath}` });
                        }
                        return;
                    }
                    path.push(depId);
                    findCycle(depId);
                    path.pop();
                }
            }
            findCycle(task.id);
        });
        
        if (showAlerts) {
            const conflictList = document.getElementById('conflictList');
            if (conflicts.length > 0) {
                conflictList.innerHTML = conflicts.map(c => `
                    <div class="conflict-item">
                        <div class="conflict-type">${c.type}</div>
                        <div class="conflict-description">${c.description}</div>
                    </div>
                `).join('');
            } else {
                conflictList.innerHTML = '<p style="text-align:center; padding: 1rem;">✅ 未檢測到依賴衝突。</p>';
            }
            openModal('conflictModal');
        }
        return conflicts;
    },

    // Auto-schedule based on resolving date conflicts
    autoSchedule() {
        const project = getCurrentProject();
        let conflicts = this.validateDependencies(false);
        let dateConflicts = conflicts.filter(c => c.type === '日期衝突');

        if(dateConflicts.length === 0) {
            showNotification('沒有需要自動排程的日期衝突。', 'success');
            return;
        }

        let rescheduledCount = 0;
        project.tasks.forEach(task => {
            if (!task.dependencies || task.dependencies.length === 0) return;
            
            let latestPrereqDueDate = new Date(0);
            
            task.dependencies.forEach(depId => {
                const prereq = project.tasks.find(t => t.id == depId);
                if (prereq && prereq.taskDueDate) {
                    const prereqDueDate = new Date(prereq.taskDueDate);
                    const buffer = (prereq.bufferDays || 0) * 86400000;
                    const effectivePrereqDate = new Date(prereqDueDate.getTime() + buffer);
                    if (effectivePrereqDate > latestPrereqDueDate) {
                        latestPrereqDueDate = effectivePrereqDate;
                    }
                }
            });

            const taskStartDate = new Date(task.taskStartDate);
            if (taskStartDate <= latestPrereqDueDate) {
                const originalDuration = new Date(task.taskDueDate).getTime() - taskStartDate.getTime();
                
                const newStartDate = new Date(latestPrereqDueDate.getTime() + 86400000); // Start 1 day after
                const newDueDate = new Date(newStartDate.getTime() + originalDuration);

                task.taskStartDate = newStartDate.toISOString().split('T')[0];
                task.taskDueDate = newDueDate.toISOString().split('T')[0];
                rescheduledCount++;
            }
        });

        saveProject(project);
        renderTaskBoard();
        refreshCalendar();
        showNotification(`已自動重新排程 ${rescheduledCount} 個任務。`, 'success');
    }
};

// ==================
// INITIALIZATION (FIXED ORDER)
// ==================

// All function definitions should come before this final execution block

function loadProjects() {
    let projects = getActiveProjects();
    const selector = document.getElementById('projectSelector');
    
    if (!selector) return;
    
    selector.innerHTML = '<option value="">選擇專案</option>';
    
    if (projects.length === 0) {
        const defaultProject = createDefaultProject();
        projects = [defaultProject];
    }
    
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        selector.appendChild(option);
    });
    
    if (!currentProjectId && projects.length > 0) {
        currentProjectId = projects[0].id;
        selector.value = currentProjectId;
        loadProjectData();
    } else if (currentProjectId) {
        selector.value = currentProjectId;
    }
}

function initializeApp() {
    console.log('Starting app initialization...');
    
    // Set up navigation FIRST and ONLY ONCE
    setupNavigation();
    
    // Load projects and current project data
    loadProjects();
    
    // Update date display
    updateCurrentDate();
    
    // Set up all other event listeners
    setupAllEventListeners();
    
    // Initialize calendar after a short delay
    setTimeout(() => {
        initializeCalendar();
    }, 200);
    
    // Initialize dependency manager
    DependencyManager.init();
    
    // Initialize Global Search
    GlobalSearch.init();

    // Initialize Notifications
    Notifications.init();

    // Initialize Command Palette
    CommandPalette.init();
    
    // Render initial views
    setTimeout(() => {
        renderDashboard();
    }, 100);
    
    console.log('App initialization complete');
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing app...');
    initializeApp();
});


// ==================
// NAVIGATION & DATA I/O
// ==================

function setupNavigation() {
    console.log('Setting up navigation...');
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    
    // Use event delegation on the original sidebar, no need to clone
    sidebar.addEventListener('click', function(event) {
        let target = event.target.closest('.sidebar-link');
        
        if (!target) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const targetView = target.getAttribute('data-view');
        const targetId = target.id;
        
        if (targetView) {
            switchView(target, targetView);
        } else if (targetId === 'importData') {
            importData();
        } else if (targetId === 'exportData') {
            exportData();
        } else if (targetId === 'resetData') {
            if (confirm('確定要重置所有數據嗎？這個操作無法復原。')) {
                resetAllData();
            }
        } else if (targetId === 'settings') {
            openSettingsModal();
        }
    });
    
    // Set dashboard as default active
    const dashboardLink = sidebar.querySelector('[data-view="dashboard"]');
    if (dashboardLink) {
        dashboardLink.classList.add('active');
        document.getElementById('dashboard').classList.add('active');
    }
}

function switchView(linkElement, viewName) {
    console.log('Switching to view:', viewName);
    
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.sidebar a.sidebar-link').forEach(a => a.classList.remove('active'));
    
    const viewElement = document.getElementById(viewName);
    if (viewElement) viewElement.classList.add('active');
    
    // Only add active class to nav links, not the search view itself
    if (linkElement && viewName !== 'searchResultsView') {
        linkElement.classList.add('active');
    }

    setTimeout(() => refreshViewContent(viewName), 100);
}

function refreshViewContent(viewName) {
    console.log('Refreshing content for view:', viewName);
    
    try {
        switch(viewName) {
            case 'taskBoard': renderTaskBoard(); break;
            case 'myDayView': renderMyDayView(); break;
            case 'reportsView': Reports.render(); break;
            case 'calendarView':
                if (calendar) {
                    setTimeout(() => {
                        calendar.updateSize();
                        calendar.refetchEvents();
                    }, 200);
                }
                break;
            case 'dashboard': renderDashboard(); break;
            case 'fileCenter': renderFileCenter(); break;
            case 'meetingRecords': renderMeetingRecords(); break;
            case 'contacts': renderContacts(); break;
            case 'dependencyView': updateDependencyView(); break;
            case 'designBrief': renderDesignBrief(); break;
            case 'projectManagement': renderProjectList('active'); break;
            default: console.log('No refresh handler for view:', viewName);
        }
    } catch (error) {
        console.error('Error refreshing view content:', error);
    }
}

// ==================
// HELPER FUNCTION FOR TAB SWITCHING (FIXED)
// ==================

function switchTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Update buttons
    const taskModal = document.getElementById('taskModal');
    taskModal.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = taskModal.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Update content
    taskModal.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const activeContent = taskModal.querySelector(`#${tabName}-tab`);
    if (activeContent) {
        activeContent.classList.add('active');
    }
}

// ==================
// CALENDAR REFRESH HELPER
// ==================

function refreshCalendar() {
    console.log('Refreshing calendar...');
    if (calendar) {
        try {
            calendar.refetchEvents();
            calendar.render();
            console.log('Calendar refreshed successfully');
        } catch (error) {
            console.error('Error refreshing calendar:', error);
        }
    } else {
        console.log('Calendar not initialized yet');
    }
}

// ==================
// EVENT LISTENERS FOR DYNAMIC CONTENT
// ==================

function setupAllEventListeners() {
    console.log('Setting up ALL event listeners...');
    // Sidebar Toggle (FIXED)
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });
    }
    // Project selector
    const projectSelector = document.getElementById('projectSelector');
    if (projectSelector) {
        projectSelector.addEventListener('change', function() {
            currentProjectId = this.value;
            loadProjectData();
            console.log('Project changed to:', this.value);
        });
    }
    
    // Use event delegation for ALL dynamic buttons and actions
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // Modal Close Buttons
        if (target.classList.contains('close-btn')) {
            e.preventDefault();
            const modal = target.closest('.modal-overlay');
            if (modal) closeModal(modal.id);
            return;
        }

        // Task Card Clicks (FIXED)
        const taskCard = target.closest('.card[data-task-id], .briefing-task-item[data-task-id]');
        if (taskCard && !target.closest('button')) { // Ensure not clicking a button inside the card
            e.preventDefault();
            const taskId = parseInt(taskCard.dataset.taskId);
            handleTaskCardClick(taskId);
            return;
        }
        
        // Add Task Button
        if (target.id === 'addNewTask') {
            e.preventDefault();
            addNewTask();
            return;
        }
        
        // Add File Button
        if (target.id === 'addNewFile') {
            e.preventDefault();
            openModal('fileModal');
            return;
        }
        
        // Add Meeting Button
        if (target.id === 'addNewMeeting') {
            e.preventDefault();
            openModal('meetingModal');
            return;
        }
        
        // Add Contact Button
        if (target.id === 'addNewContact') {
            e.preventDefault();
            openModal('contactModal');
            return;
        }
        
        // Add Project Button
        if (target.id === 'addProject') {
            e.preventDefault();
            addNewProject();
            return;
        }
        
        // Design Brief Export Button
        if (target.id === 'exportDesignBrief') {
            e.preventDefault();
            exportDesignBriefToWord();
            return;
        }
        
        // Save Design Brief Button
        if (target.id === 'saveDesignBrief') {
            e.preventDefault();
            saveDesignBriefData();
            return;
        }
        
        // Add Design Deliverable Button
        if (target.id === 'addDeliverable') {
            e.preventDefault();
            addDeliverable();
            return;
        }
        
        // Tab Buttons
        if (target.classList.contains('tab-btn')) {
            e.preventDefault();
            const tabName = target.dataset.tab;
            if (tabName) switchTab(tabName);
            return;
        }
        
        // Add Dependency Button in Task Modal
        if (target.id === 'addDependency') {
            e.preventDefault();
            showDependencyDropdown(target);
            return;
        }

        // Create Follow-up/Dependency Chain button
        if(target.id === 'createFollowUpChain') {
            e.preventDefault();
            toggleChainingMode(target);
            return;
        }

        // Handle Follow-up settings checkbox
        if (target.id === 'enableFollowUp') {
            document.getElementById('followUpSettings').style.display = target.checked ? 'block' : 'none';
        }

        // Project Archive Toggle Buttons
        if (target.id === 'showActiveProjects') {
            renderProjectList('active');
        }
        if (target.id === 'showArchivedProjects') {
            renderProjectList('archived');
        }
    });

    // AI Feature Buttons
    document.getElementById('autofillTaskButton')?.addEventListener('click', autofillTaskDetails);
    document.getElementById('suggestActionPlanButton')?.addEventListener('click', generateActionPlan);
    document.getElementById('estimateTimeButton')?.addEventListener('click', estimateTaskTime);
    document.getElementById('assessRiskButton')?.addEventListener('click', assessTaskRisk);
    document.getElementById('generateReflectionButton')?.addEventListener('click', generateWeeklyReflection);
    document.getElementById('suggestFocusButton')?.addEventListener('click', suggestDailyFocus);

    // Settings Modal Save Button (FIXED)
    document.getElementById('saveApiKey')?.addEventListener('click', saveApiKey);
    
    // Form submissions
    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form.id === 'taskForm') { e.preventDefault(); saveTask(e); }
        if (form.id === 'fileForm') { e.preventDefault(); saveFile(e); }
        if (form.id === 'meetingForm') { e.preventDefault(); saveMeeting(e); }
        if (form.id === 'contactForm') { e.preventDefault(); saveContact(e); }
    });
    
    console.log('All event listeners setup complete');
}

// ==================
// MY DAY VIEW (UPDATED AND ENHANCED)
// ==================

function renderMyDayView() {
    console.log('Rendering My Day view with categories...');
    const container = document.getElementById('myDayContainer');
    if (!container) {
        console.error('My Day container not found!');
        return;
    }

    const allProjects = getActiveProjects();
    const today = new Date().toISOString().split('T')[0];
    
    let dueAndOverdueTasks = [];
    let allFollowUpAlerts = [];
    let allStalledTaskAlerts = [];
    let followUpTaskIds = new Set();

    // 1. Gather all data from all projects
    allProjects.forEach(project => {
        // Get tasks due today or overdue
        (project.tasks || []).forEach(task => {
            const isDueToday = task.taskDueDate === today && task.status !== '已完成';
            const isOverdue = task.taskDueDate < today && task.status !== '已完成';
            if (isDueToday || isOverdue) {
                dueAndOverdueTasks.push({ ...task, project });
            }
        });

        // Get alerts using the existing notification logic
        const { followUpAlerts, stalledTaskAlerts } = Notifications.getAlertsForProject(project);
        
        followUpAlerts.forEach(alert => {
            allFollowUpAlerts.push(alert);
            followUpTaskIds.add(alert.task.id);
        });
        
        stalledTaskAlerts.forEach(alert => {
             // Ensure we don't show a task in both follow-up and stalled
            if (!followUpTaskIds.has(alert.task.id)) {
                allStalledTaskAlerts.push(alert);
            }
        });
    });

    // 2. Sort the "Due & Overdue" tasks
    const priorityOrder = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
    dueAndOverdueTasks.sort((a, b) => {
        const aIsOverdue = a.taskDueDate < today;
        const bIsOverdue = b.taskDueDate < today;
        if (aIsOverdue !== bIsOverdue) return aIsOverdue ? -1 : 1;
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    });

    // 3. Build the HTML for each section
    let html = '';

    const renderSection = (title, items, renderItemFn) => {
        let sectionHtml = `<div class="my-day-section"><h2 class="my-day-section-header">${title}</h2>`;
        if (items.length === 0) {
            sectionHtml += '<p class="empty-section-message">這個類別中沒有項目。</p>';
        } else {
            sectionHtml += items.map(renderItemFn).join('');
        }
        sectionHtml += '</div>';
        return sectionHtml;
    };

    // Render "Due Today & Overdue"
    html += renderSection('🚨 今日到期及已逾期的任務', dueAndOverdueTasks, (taskItem) => {
        const isOverdue = taskItem.taskDueDate < today;
        const urgencyHTML = isOverdue
            ? `<div class="urgency-indicator overdue">⏰ 已逾期</div>`
            : `<div class="urgency-indicator due-soon">⏰ 今天到期</div>`;
        return `
            <div class="card my-day-task-card" data-task-id="${taskItem.id}" data-project-id="${taskItem.project.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h3 style="font-weight: 700;">${escapeHtml(taskItem.taskName)}</h3>
                    <span class="status-badge status-badge-${taskItem.status}">${taskItem.status}</span>
                </div>
                 <p class="project-context">專案: ${escapeHtml(taskItem.project.name)}</p>
                ${urgencyHTML}
            </div>
        `;
    });

    // Render "Planned Follow-ups"
    html += renderSection('🗓️ 計劃的跟進行動', allFollowUpAlerts, (alert) => `
        <div class="card my-day-task-card" data-task-id="${alert.task.id}" data-project-id="${alert.project.id}">
            <h3 style="font-weight: 700;">${escapeHtml(alert.task.taskName)}</h3>
            <p class="project-context">專案: ${escapeHtml(alert.project.name)}</p>
            <p style="color: #b45309; font-weight: 500;"><strong>應執行動作:</strong> ${escapeHtml(alert.action)}</p>
        </div>
    `);

    // Render "Stalled Tasks"
    html += renderSection('🚦 靜止任務 (Safety Net)', allStalledTaskAlerts, (alert) => `
        <div class="card my-day-task-card" data-task-id="${alert.task.id}" data-project-id="${alert.project.id}">
             <h3 style="font-weight: 700;">${escapeHtml(alert.task.taskName)}</h3>
             <p class="project-context">專案: ${escapeHtml(alert.project.name)}</p>
             <p style="color: #7f1d1d;">此任務已超過 ${alert.days} 天沒有任何進度更新，建議跟進。</p>
        </div>
    `);

    // 4. Handle the case where there's nothing to show at all
    if (dueAndOverdueTasks.length === 0 && allFollowUpAlerts.length === 0 && allStalledTaskAlerts.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 3rem;">
                <p style="font-size: 1.2rem; color: var(--text-secondary);">🎉 太棒了！今天一切順利。</p>
                <p style="margin-top: 1rem;">你可以放鬆一下，或者點擊下面的按鈕開始新任務。</p>
                <button onclick="document.querySelector('[data-view=\\'taskBoard\\']').click(); addNewTask();" class="btn btn-primary" style="margin-top: 1.5rem;">新增任務</button>
            </div>`;
    } else {
        container.innerHTML = html;
    }
}


// ==================
// PROJECT MANAGEMENT & ARCHIVING
// ==================

function getProjects() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading projects:', error);
        return [];
    }
}

function getArchivedProjects() {
    try {
        const data = localStorage.getItem(ARCHIVE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error loading archived projects:', error);
        return [];
    }
}

function getActiveProjects() {
    return getProjects(); // For now, they are the same. This function makes the code clearer.
}

function saveProjects(projects) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function saveArchivedProjects(projects) {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(projects));
}

function archiveProject(projectId) {
    let active = getActiveProjects();
    let archived = getArchivedProjects();
    const projectToArchive = active.find(p => p.id == projectId);

    if (projectToArchive) {
        active = active.filter(p => p.id != projectId);
        archived.push(projectToArchive);
        saveProjects(active);
        saveArchivedProjects(archived);
        showNotification(`專案 "${projectToArchive.name}" 已封存。`, 'success');
        renderProjectList('active'); // Refresh the view
    }
}

function unarchiveProject(projectId) {
    let active = getActiveProjects();
    let archived = getArchivedProjects();
    const projectToUnarchive = archived.find(p => p.id == projectId);

    if (projectToUnarchive) {
        archived = archived.filter(p => p.id != projectId);
        active.push(projectToUnarchive);
        saveProjects(active);
        saveArchivedProjects(archived);
        showNotification(`專案 "${projectToUnarchive.name}" 已取消封存。`, 'success');
        renderProjectList('archived'); // Refresh the view
    }
}

function saveProject(project) {
    try {
        const projects = getProjects();
        const index = projects.findIndex(p => p.id === project.id);
        
        if (index !== -1) {
            projects[index] = project;
        } else {
            projects.push(project);
        }
        
        saveProjects(projects);
        return true;
    } catch (error) {
        console.error('Error saving project:', error);
        return false;
    }
}

function getCurrentProject() {
    if (!currentProjectId) return null;
    const projects = getProjects();
    return projects.find(p => p.id == currentProjectId);
}

function createDefaultProject() {
    const defaultProject = {
        id: Date.now(),
        name: '預設專案',
        created: new Date().toISOString(),
        tasks: [
            {
                id: 1,
                taskName: '範例任務',
                taskPurpose: '展示系統功能',
                taskDescription: '這是一個範例任務，用於展示系統功能。',
                taskAssignee: '系統管理員',
                priority: 'medium',
                taskStartDate: new Date().toISOString().split('T')[0],
                taskDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: '待辦',
                dependencies: [],
                bufferDays: 0,
                created: new Date().toISOString()
            }
        ],
        files: [],
        meetings: [],
        contacts: [],
        briefs: [],
        // Design brief fields
        manager: '',
        strategy: '',
        mainGoal: '',
        targetAudience: '',
        coreMessage: '',
        designStyle: '',
        designItems: [],
        deliverables: []
    };
    
    saveProject(defaultProject);
    return defaultProject;
}

function loadProjectData() {
    const project = getCurrentProject();
    if (!project) return;
    
    renderTaskBoard();
    renderDashboard();
    renderFileCenter();
    renderMeetingRecords();
    renderContacts();
    updateDependencyView();
    
    // Refresh calendar when project data loads
    refreshCalendar();
}

function addNewProject() {
    const input = document.getElementById('newProjectName');
    const projectName = input.value.trim();
    
    if (!projectName) {
        showNotification('請輸入專案名稱', 'error');
        return;
    }
    
    const newProject = {
        id: Date.now(),
        name: projectName,
        created: new Date().toISOString(),
        tasks: [],
        files: [],
        meetings: [],
        contacts: [],
        briefs: [],
        // Design brief fields
        manager: '',
        strategy: '',
        mainGoal: '',
        targetAudience: '',
        coreMessage: '',
        designStyle: '',
        designItems: [],
        deliverables: []
    };
    
    saveProject(newProject);
    input.value = '';
    
    // Reload projects in dropdown
    loadProjects();
    
    // Update project list in project management tab
    renderProjectList('active');
    
    // Switch to new project
    currentProjectId = newProject.id;
    document.getElementById('projectSelector').value = currentProjectId;
    loadProjectData();
    
    showNotification('專案已創建', 'success');
}

function renderProjectList(viewMode = 'active') {
    const container = document.getElementById('projects-list');
    if (!container) return;

    // Update button styles
    document.getElementById('showActiveProjects').classList.toggle('active', viewMode === 'active');
    document.getElementById('showArchivedProjects').classList.toggle('active', viewMode === 'archived');

    const projects = viewMode === 'active' ? getActiveProjects() : getArchivedProjects();
    
    if (projects.length === 0) {
        container.innerHTML = `<div class="card"><p style="text-align: center; color: #6b7280; padding: 2rem;">沒有${viewMode === 'active' ? '進行中' : '已封存'}的專案。</p></div>`;
        return;
    }
    
    container.innerHTML = projects.map(project => {
        const totalTasks = project.tasks ? project.tasks.length : 0;
        const completedTasks = project.tasks ? project.tasks.filter(t => t.status === '已完成').length : 0;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const actionButton = viewMode === 'active'
            ? `<button onclick="archiveProject(${project.id})" class="btn btn-secondary btn-small" style="margin-left: 0.5rem;">封存</button>`
            : `<button onclick="unarchiveProject(${project.id})" class="btn btn-secondary btn-small" style="margin-left: 0.5rem;">取消封存</button>`;

        return `
            <div class="card ${viewMode === 'archived' ? 'archived-project-card' : ''}" style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700;">${escapeHtml(project.name)}</h3>
                        <p style="margin: 0.5rem 0 0 0; color: #6b7280; font-size: 0.875rem;">
                            建立日期: ${new Date(project.created).toLocaleDateString('zh-TW')} | ${totalTasks} 個任務
                        </p>
                    </div>
                    <div>
                        <button onclick="switchToProject(${project.id})" class="btn btn-primary btn-small">切換</button>
                        ${actionButton}
                        <button onclick="deleteProject(${project.id}, '${viewMode}')" class="btn btn-danger btn-small" style="margin-left: 0.5rem;">刪除</button>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-background">
                        <div class="progress-bar-fill" style="width: ${progress}%;">
                            <span class="progress-bar-label">${progress}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==================
// DASHBOARD & ALERTS
// ==================

function renderDashboard() {
    const dashboardContent = document.getElementById('dashboard-content');
    const toggleContainer = document.getElementById('dashboard-toggle-container');
    if (!dashboardContent || !toggleContainer) return;

    const currentHour = new Date().getHours();
    
    if (currentHour < 17) { // Before 5 PM
        toggleContainer.innerHTML = `
            <div class="view-toggle-buttons" style="margin-bottom: 1.5rem;">
                <button id="showMorningBriefing" class="btn btn-secondary">☀️ 每日簡報</button>
                <button id="showStandardDashboard" class="btn btn-secondary">📊 標準儀表板</button>
            </div>
        `;
        document.getElementById('showMorningBriefing').addEventListener('click', () => renderDashboardView('briefing'));
        document.getElementById('showStandardDashboard').addEventListener('click', () => renderDashboardView('standard'));
        renderDashboardView('briefing'); // Default to briefing
    } else { // 5 PM or later
        toggleContainer.innerHTML = `
            <div class="view-toggle-buttons" style="margin-bottom: 1.5rem;">
                <button id="showEodReview" class="btn btn-secondary">🌙 每日回顧</button>
                <button id="showStandardDashboard" class="btn btn-secondary">📊 標準儀表板</button>
            </div>
        `;
        document.getElementById('showEodReview').addEventListener('click', () => renderDashboardView('review'));
        document.getElementById('showStandardDashboard').addEventListener('click', () => renderDashboardView('standard'));
        renderDashboardView('review'); // Default to review
    }
}

function renderDashboardView(viewType) {
    // Update active button style
    const toggleContainer = document.getElementById('dashboard-toggle-container');
    toggleContainer.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    if (viewType === 'briefing') document.getElementById('showMorningBriefing')?.classList.add('active');
    if (viewType === 'review') document.getElementById('showEodReview')?.classList.add('active');
    if (viewType === 'standard') document.getElementById('showStandardDashboard')?.classList.add('active');

    // Render the selected content
    if (viewType === 'briefing') {
        renderMorningBriefing();
    } else if (viewType === 'review') {
        renderEndOfDayReview();
    } else {
        renderStandardDashboard();
    }
}


async function renderMorningBriefing() {
    const dashboardContent = document.getElementById('dashboard-content');
    dashboardContent.innerHTML = '<div class="loading">正在為您準備今日簡報...</div>';

    const allProjects = getActiveProjects();
    const todayStr = new Date().toISOString().split('T')[0];
    let criticalTasks = [];

    allProjects.forEach(project => {
        (project.tasks || []).forEach(task => {
            const isDueToday = task.taskDueDate === todayStr && task.status !== '已完成';
            const isOverdue = task.taskDueDate < todayStr && task.status !== '已完成';
            if (isDueToday || isOverdue) {
                criticalTasks.push({
                    name: task.taskName,
                    status: isOverdue ? 'Overdue' : 'Due Today',
                    priority: task.priority,
                    project: project.name,
                    id: task.id,
                    projectId: project.id
                });
            }
        });
    });

    const prompt = `
        As a helpful project assistant, provide a concise and encouraging morning briefing based on the following list of critical tasks for today, ${todayStr}.
        The user is a project manager in Hong Kong.
        
        Critical Tasks Data: ${JSON.stringify(criticalTasks)}

        Start with a friendly greeting.
        Summarize the situation in one or two sentences (e.g., how many tasks are due, how many are overdue).
        Then, list the top 3 most critical tasks to focus on. Prioritize "urgent" and "overdue" tasks first.
        For each of the top 3 tasks, mention its name and the project it belongs to.
        End with a short, motivating sentence.
        
        Keep the entire response in Traditional Chinese (zh-TW).
    `;

    const briefingText = await callGroqAPI(prompt);

    if (briefingText) {
        let briefingHTML = escapeHtml(briefingText).replace(/\n/g, '<br>');
        criticalTasks.forEach(task => {
            const regex = new RegExp(escapeHtml(task.name), "g");
            briefingHTML = briefingHTML.replace(regex, `<span class="briefing-task-item" data-task-id="${task.id}" data-project-id="${task.projectId}">${escapeHtml(task.name)}</span>`);
        });

        dashboardContent.innerHTML = `
            <div class="card morning-briefing-card">
                <h2 class="briefing-header">☀️ 早安！這是您的今日簡報</h2>
                <p class="briefing-summary">${briefingHTML}</p>
            </div>
        `;
    } else {
        dashboardContent.innerHTML = '<div class="card"><p>無法生成簡報，請檢查您的 API Key 設定。</p></div>';
    }
}

async function renderEndOfDayReview() {
    const dashboardContent = document.getElementById('dashboard-content');
    dashboardContent.innerHTML = '<div class="loading">正在為您準備每日回顧...</div>';

    const allProjects = getActiveProjects();
    const todayStr = new Date().toISOString().split('T')[0];
    let dailyData = {
        completedToday: [],
        remainingTasks: 0
    };

    allProjects.forEach(project => {
        (project.tasks || []).forEach(task => {
            if (task.status === '已完成') {
                const completionDateEntry = (task.history || []).find(h => h.note.includes('已完成') && h.date === todayStr);
                if (completionDateEntry) {
                    dailyData.completedToday.push(task.taskName);
                }
            } else {
                dailyData.remainingTasks++;
            }
        });
    });

    const prompt = `
        As a helpful project assistant, provide a concise and positive end-of-day review based on the user's activity today, ${todayStr}.
        The user is a project manager in Hong Kong.

        Today's Data:
        - Tasks completed today: ${dailyData.completedToday.length} (${dailyData.completedToday.join(', ')})
        - Total remaining (unfinished) tasks: ${dailyData.remainingTasks}

        Structure your response:
        1.  Start with a positive closing for the day (e.g., "辛苦了！").
        2.  Briefly summarize the day's accomplishments.
        3.  Offer a short, forward-looking statement for tomorrow.
        
        Keep the entire response in Traditional Chinese (zh-TW).
    `;

    const reviewText = await callGroqAPI(prompt);

    if (reviewText) {
        dashboardContent.innerHTML = `
            <div class="card eod-review-card">
                <h2 class="briefing-header">🌙 每日回顧</h2>
                <p class="briefing-summary">${reviewText.replace(/\n/g, '<br>')}</p>
            </div>
        `;
    } else {
        dashboardContent.innerHTML = '<div class="card"><p>無法生成回顧，請檢查您的 API Key 設定。</p></div>';
    }
}


function renderStandardDashboard() {
    const dashboardContent = document.getElementById('dashboard-content');
    dashboardContent.innerHTML = `
        <div class="grid grid-cols-2 mb-8">
            <div class="card">
                <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">今天日期</h2>
                <p id="currentDate" style="font-size: 1.125rem; color: #6b7280;"></p>
            </div>
            <div class="card">
                <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">任務進度 (當前專案)</h2>
                <div id="taskProgress">
                    <p style="color: #6b7280;">沒有符合篩選條件的項目。</p>
                </div>
            </div>
        </div>
        <div id="followUpAlerts"></div>
        <div id="stalledTaskAlerts"></div>
        <div class="card">
            <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">⚠️ 依賴提醒 (當前專案)</h2>
            <div id="dependencyAlerts">
                <p style="color: #6b7280;">暫無依賴相關提醒。</p>
            </div>
        </div>
    `;

    updateCurrentDate();
    
    const project = getCurrentProject();
    if (!project || !project.tasks) return;
    
    const progressDiv = document.getElementById('taskProgress');
    if (progressDiv) {
        const total = project.tasks.length;
        const completed = project.tasks.filter(t => t.status === '已完成').length;
        const inProgress = project.tasks.filter(t => t.status.includes('中')).length;
        const pending = project.tasks.filter(t => t.status === '待辦').length;
        
        progressDiv.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="number">${total}</div>
                    <div class="label">總任務數</div>
                </div>
                <div class="stat-card">
                    <div class="number">${pending}</div>
                    <div class="label">待辦</div>
                </div>
                <div class="stat-card">
                    <div class="number">${inProgress}</div>
                    <div class="label">進行中</div>
                </div>
                <div class="stat-card">
                    <div class="number">${completed}</div>
                    <div class="label">已完成</div>
                </div>
            </div>
        `;
    }
    
    updateDashboardAlerts();
}

function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const now = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        };
        dateElement.textContent = now.toLocaleDateString('zh-TW', options);
    }
}

function updateDashboardAlerts() {
    const allProjects = getActiveProjects();
    let allFollowUpAlerts = [];
    let allStalledTaskAlerts = [];

    allProjects.forEach(project => {
        const { followUpAlerts, stalledTaskAlerts } = Notifications.getAlertsForProject(project);
        allFollowUpAlerts.push(...followUpAlerts);
        allStalledTaskAlerts.push(...stalledTaskAlerts);
    });

    // Render Follow-up Alerts
    const followUpContainer = document.getElementById('followUpAlerts');
    if (followUpContainer) {
        if (allFollowUpAlerts.length > 0) {
            followUpContainer.innerHTML = `
                <div class="card" style="border-left: 4px solid var(--warning);">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">⚠️ 今日行動及跟進提醒</h2>
                    ${allFollowUpAlerts.map(alert => `
                        <div class="dashboard-alert-item">
                            <p><strong>任務:</strong> ${escapeHtml(alert.task.taskName)}</p>
                            <p style="color: #b45309;"><strong>應執行動作:</strong> ${escapeHtml(alert.action)}</p>
                            <p class="project-context">專案: ${escapeHtml(alert.project.name)}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            followUpContainer.innerHTML = '';
        }
    }

    // Render Safety Net Alerts
    const stalledContainer = document.getElementById('stalledTaskAlerts');
    if (stalledContainer) {
        const alertedTaskIds = new Set(allFollowUpAlerts.map(a => a.task.id));
        const filteredStalledTasks = allStalledTaskAlerts.filter(a => !alertedTaskIds.has(a.task.id));

        if (filteredStalledTasks.length > 0) {
            stalledContainer.innerHTML = `
                <div class="card" style="border-left: 4px solid var(--danger);">
                    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">🚨 靜止任務提醒 (Safety Net)</h2>
                    ${filteredStalledTasks.map(alert => `
                        <div class="dashboard-alert-item">
                            <p><strong>任務:</strong> ${escapeHtml(alert.task.taskName)}</p>
                            <p style="color: #7f1d1d;">此任務已超過 ${alert.days} 天沒有任何進度更新，建議跟進。</p>
                            <p class="project-context">專案: ${escapeHtml(alert.project.name)}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            stalledContainer.innerHTML = '';
        }
    }

    // Render Dependency Alerts for the CURRENT project only
    const dependencyAlertsContainer = document.getElementById('dependencyAlerts');
    if (dependencyAlertsContainer) {
        const currentProject = getCurrentProject();
        if (currentProject) {
            DependencyManager.updateAllTaskStates(currentProject);
            const blockedTasks = currentProject.tasks.filter(t => t.isBlocked);
            if (blockedTasks.length > 0) {
                dependencyAlertsContainer.innerHTML = blockedTasks.map(task => {
                    const blockingTasks = (task.dependencies || [])
                        .map(depId => currentProject.tasks.find(t => t.id == depId))
                        .filter(depTask => depTask && depTask.status !== '已完成')
                        .map(depTask => depTask.taskName)
                        .join(', ');
                    return `<div class="conflict-item" style="background: #fffbeb; border-left-color: var(--warning);"><div class="conflict-description" style="color: #92400e;">任務 <strong>"${escapeHtml(task.taskName)}"</strong> 被 <strong>${blockingTasks}</strong> 阻擋。</div></div>`;
                }).join('');
            } else {
                dependencyAlertsContainer.innerHTML = '<p style="color: #6b7280;">暫無依賴相關提醒。</p>';
            }
        }
    }
}



// ==================
// TASK MANAGEMENT
// ==================

function renderTaskBoard() {
    const project = getCurrentProject();
    const board = document.getElementById('kanban-board');
    if (!board || !project) return;
    
    DependencyManager.updateAllTaskStates(project);
    populateAssigneeFilter();

    const dependencyFilter = document.getElementById('dependencyFilter').value;
    const assigneeFilter = document.getElementById('assigneeFilter').value;

    const statuses = ['待辦', '內容準備中', '設計中', '待審批', '待製作', '已完成'];
    
    board.innerHTML = statuses.map(status => `
        <div class="kanban-column" data-status="${status}">
            <div class="kanban-column-header">
                <span>${status}</span>
                <span class="task-count"></span>
            </div>
            <div class="kanban-tasks">
                </div>
        </div>
    `).join('');

    let tasksToDisplay = project.tasks;
    
    if (dependencyFilter) {
        tasksToDisplay = tasksToDisplay.filter(t => {
            switch (dependencyFilter) {
                case 'blocked': return t.isBlocked;
                case 'ready': return !t.isBlocked && t.status !== '已完成';
                case 'has-dependencies': return t.dependencies && t.dependencies.length > 0;
                default: return true;
            }
        });
    }

    if (assigneeFilter) {
        tasksToDisplay = tasksToDisplay.filter(t => t.taskAssignee === assigneeFilter);
    }
    
    tasksToDisplay.forEach(task => {
        const column = board.querySelector(`.kanban-column[data-status="${task.status}"] .kanban-tasks`);
        if (column) {
            column.innerHTML += createTaskCard(task);
        }
    });

    // Update task counts in each column header
    board.querySelectorAll('.kanban-column').forEach(column => {
        const taskCount = column.querySelectorAll('.card').length;
        column.querySelector('.task-count').textContent = taskCount;
    });

    // Add drag and drop listeners
    addDragAndDropListeners();
}

function addDragAndDropListeners() {
    const tasks = document.querySelectorAll('.kanban-tasks .card');
    const columns = document.querySelectorAll('.kanban-tasks');

    tasks.forEach(task => {
        task.addEventListener('dragstart', () => {
            task.classList.add('dragging');
        });
        task.addEventListener('dragend', () => {
            task.classList.remove('dragging');
        });
    });

    columns.forEach(column => {
        column.addEventListener('dragover', e => {
            e.preventDefault();
            column.classList.add('drag-over');
        });
        column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });
        column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');
            const draggingTask = document.querySelector('.dragging');
            if (draggingTask) {
                const taskId = parseInt(draggingTask.dataset.taskId);
                const newStatus = column.parentElement.dataset.status;
                updateTaskStatus(taskId, newStatus);
            }
        });
    });
}

function updateTaskStatus(taskId, newStatus) {
    const project = getCurrentProject();
    const task = project.tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
        task.status = newStatus;
        // FIX: Ensure history array exists before pushing to it
        if (!task.history) {
            task.history = [];
        }
        task.history.push({
            date: new Date().toISOString().split('T')[0],
            note: `狀態更新為 "${newStatus}"`
        });
        saveProject(project);
        renderTaskBoard();
        showNotification(`任務狀態已更新為 "${newStatus}"`, 'success');
    }
}

function populateAssigneeFilter() {
    const project = getCurrentProject();
    const filter = document.getElementById('assigneeFilter');
    if (!filter || !project) return;

    const assignees = [...new Set(project.tasks.map(t => t.taskAssignee).filter(Boolean))];
    
    filter.innerHTML = '<option value="">所有負責人</option>';
    assignees.sort().forEach(assignee => {
        filter.innerHTML += `<option value="${escapeHtml(assignee)}">${escapeHtml(assignee)}</option>`;
    });

    filter.removeEventListener('change', renderTaskBoard); // Prevent duplicate listeners
    filter.addEventListener('change', renderTaskBoard);
}


function createTaskCard(task) {
    let cardClass = 'card';
    if (task.isBlocked) {
        cardClass += ' blocked-task';
    } else if (task.status !== '已完成') {
        cardClass += ' ready-task';
    }
    if (task.dependencies && task.dependencies.length > 0) {
        cardClass += ' has-dependencies';
    }

    const project = getCurrentProject();
    const { dependencies, dependents } = DependencyManager.getRelatedTasks(task, project);

    const latestUpdate = (task.history && task.history.length > 0) ? task.history[task.history.length - 1] : null;

    // Urgency logic
    let urgencyHTML = '';
    if (task.taskDueDate && task.status !== '已完成') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(task.taskDueDate);
        dueDate.setHours(0,0,0,0);
        const daysDiff = (dueDate - today) / (1000 * 60 * 60 * 24);

        if (daysDiff < 0) {
            urgencyHTML = `<div class="urgency-indicator overdue">⏰ 已逾期 ${Math.abs(daysDiff)} 天</div>`;
        } else if (daysDiff <= 3) {
            urgencyHTML = `<div class="urgency-indicator due-soon">⏰ ${daysDiff} 天後到期</div>`;
        }
    }

    let riskIndicatorHTML = '';
    if (task.riskAssessment && task.riskAssessment.riskLevel) {
        riskIndicatorHTML = `<span class="risk-indicator risk-${task.riskAssessment.riskLevel.toLowerCase()}" title="${task.riskAssessment.reason}"></span>`;
    }


    return `
        <div class="${cardClass}" data-task-id="${task.id}" draggable="true">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <h3 style="font-weight: 700; font-size: 1.125rem; margin: 0;">
                    ${escapeHtml(task.taskName)}
                    ${riskIndicatorHTML}
                </h3>
                <span class="status-badge status-badge-${task.status}">${task.status}</span>
            </div>
            
            ${urgencyHTML}

            <div>
                ${task.taskPurpose ? `<p style="color: #6b7280; font-size: 0.875rem; margin-bottom: 1rem;">${escapeHtml(task.taskPurpose)}</p>` : ''}
                
                ${dependencies.length > 0 ? `
                <div style="margin-top: 1rem; font-size: 0.75rem; line-height: 1.6;">
                    <strong>依賴於:</strong>
                    ${dependencies.map(d => `<span class="dependency-badge">${escapeHtml(d.taskName)}</span>`).join(' ')}
                </div>` : ''}
                
                ${dependents.length > 0 ? `
                <div style="margin-top: 0.5rem; font-size: 0.75rem; line-height: 1.6;">
                    <strong>阻擋了:</strong>
                    ${dependents.map(d => `<span class="dependent-badge">${escapeHtml(d.taskName)}</span>`).join(' ')}
                </div>` : ''}

                <div class="task-card-updates">
                    ${task.nextAction ? `
                        <div class="update-item next-action">
                            <span class="icon">➡️</span>
                            <span class="text">${escapeHtml(task.nextAction)}</span>
                        </div>` : ''}
                    ${latestUpdate ? `
                        <div class="update-item">
                            <span class="icon">🔄</span>
                            <span class="text"><strong>${latestUpdate.date}:</strong> ${escapeHtml(latestUpdate.note)}</span>
                        </div>` : ''}
                </div>

                ${task.taskStartDate || task.taskDueDate ? `
                    <div style="font-size: 0.75rem; color: #6b7280; line-height: 1.5; margin-top: 1rem; border-top: 1px solid #f3f4f6; padding-top: 1rem;">
                        ${task.taskStartDate ? `📅 開始: ${task.taskStartDate}<br>` : ''} 
                        ${task.taskDueDate ? `⏰ 到期: ${task.taskDueDate}` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function addNewTask() {
    console.log('Adding new task');
    
    const form = document.getElementById('taskForm');
    if (form) form.reset();
    
    document.getElementById('editingTaskId').value = '';
    document.getElementById('taskModalTitle').textContent = '新增任務';
    
    populateAssigneeDropdown();
    
    document.getElementById('dependencySelector').innerHTML = '';
    document.getElementById('bufferDays').value = 0;

    document.getElementById('taskNextAction').value = '';
    document.getElementById('taskNewUpdate').value = '';
    document.getElementById('taskHistoryLog').innerHTML = '<p>尚無歷史紀錄。</p>';

    document.getElementById('enableFollowUp').checked = false;
    document.getElementById('followUpSettings').style.display = 'none';

    // Reset Action Plan tab
    document.getElementById('actionPlanContainer').innerHTML = '<p>點擊按鈕以使用 AI 生成建議的步驟清單。</p>';
    
    // Reset Time Estimate and Risk Assessment
    document.getElementById('taskTimeEstimate').value = '';
    const riskResult = document.getElementById('riskAssessmentResult');
    riskResult.textContent = '點擊按鈕進行評估...';
    riskResult.className = 'risk-assessment-result';


    openModal('taskModal');
}

function editTask(taskId) {
    console.log('Editing task:', taskId);
    const project = getCurrentProject();
    if (!project) return;
    
    const task = project.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    document.getElementById('editingTaskId').value = task.id;
    document.getElementById('taskName').value = task.taskName || '';
    document.getElementById('taskPurpose').value = task.taskPurpose || '';
    document.getElementById('taskDescription').value = task.taskDescription || '';
    
    populateAssigneeDropdown(task.taskAssignee);

    document.getElementById('taskStartDate').value = task.taskStartDate || '';
    document.getElementById('taskDueDate').value = task.taskDueDate || '';
    document.getElementById('taskStatus').value = task.status || '待辦';
    document.getElementById('taskPriority').value = task.priority || 'medium';
    
    // New fields
    document.getElementById('taskTimeEstimate').value = task.timeEstimate || '';
    const riskResult = document.getElementById('riskAssessmentResult');
    if (task.riskAssessment) {
        riskResult.textContent = task.riskAssessment.reason;
        riskResult.className = 'risk-assessment-result'; // Reset
        riskResult.classList.add(`risk-${task.riskAssessment.riskLevel.toLowerCase()}`);
    } else {
        riskResult.textContent = '點擊按鈕進行評估...';
        riskResult.className = 'risk-assessment-result';
    }


    populateDependencyTab(task, project);
    populateUpdatesTab(task);
    populateFollowUpTab(task);
    renderActionPlan(task); // Render the saved action plan

    document.getElementById('taskModalTitle').textContent = '編輯任務';
    openModal('taskModal');
}

function saveTask(e) {
    if (e) e.preventDefault();
    console.log('Saving task...');
    
    const project = getCurrentProject();
    if (!project) {
        showNotification('請先選擇專案', 'error');
        return;
    }
    
    const taskId = document.getElementById('editingTaskId').value;
    const isEditing = !!taskId;
    
    const dependencyItems = document.querySelectorAll('#dependencySelector .dependency-item');
    const dependencies = Array.from(dependencyItems).map(item => parseInt(item.dataset.taskId));
    const bufferDays = parseInt(document.getElementById('bufferDays').value) || 0;
    
    const followUpEnabled = document.getElementById('enableFollowUp').checked;
    let followUp = null;
    if(followUpEnabled) {
        followUp = {
            enabled: true,
            chain: [
                { days: document.getElementById('followUp1Days').value, action: document.getElementById('followUp1Action').value },
                { days: document.getElementById('followUp2Days').value, action: document.getElementById('followUp2Action').value },
                { days: document.getElementById('followUp3Days').value, action: document.getElementById('followUp3Action').value }
            ]
        };
    }

    // Save action plan state
    const actionPlanItems = document.querySelectorAll('#actionPlanContainer .action-plan-item');
    const actionPlan = Array.from(actionPlanItems).map(item => ({
        text: item.querySelector('span').textContent,
        completed: item.querySelector('input[type="checkbox"]').checked
    }));

    const taskData = {
        id: isEditing ? parseInt(taskId) : Date.now(),
        taskName: document.getElementById('taskName').value.trim(),
        taskPurpose: document.getElementById('taskPurpose').value.trim(),
        taskDescription: document.getElementById('taskDescription').value.trim(),
        taskAssignee: document.getElementById('taskAssignee').value,
        taskStartDate: document.getElementById('taskStartDate').value,
        taskDueDate: document.getElementById('taskDueDate').value,
        status: document.getElementById('taskStatus').value,
        priority: document.getElementById('taskPriority')?.value || 'medium',
        dependencies: dependencies,
        bufferDays: bufferDays,
        followUp: followUp,
        nextAction: document.getElementById('taskNextAction').value.trim(),
        actionPlan: actionPlan,
        timeEstimate: document.getElementById('taskTimeEstimate').value.trim()
        // riskAssessment is saved directly in its function
    };

    if (!taskData.taskName) {
        showNotification('請輸入任務名稱', 'error');
        return;
    }
    
    if (taskData.taskStartDate && taskData.taskDueDate) {
        if (new Date(taskData.taskDueDate) < new Date(taskData.taskStartDate)) {
            showNotification('結束日期不能早於開始日期', 'error');
            return;
        }
    }
    
    let taskToUpdate;
    if (isEditing) {
        const index = project.tasks.findIndex(t => t.id == taskId);
        if (index !== -1) {
            // Preserve history and risk assessment when updating
            const existingHistory = project.tasks[index].history || [];
            const existingRisk = project.tasks[index].riskAssessment;
            project.tasks[index] = { ...project.tasks[index], ...taskData };
            taskToUpdate = project.tasks[index];
            taskToUpdate.history = existingHistory;
            if (existingRisk) taskToUpdate.riskAssessment = existingRisk;
        }
    } else {
        taskData.created = new Date().toISOString();
        taskData.history = [];
        project.tasks.push(taskData);
        taskToUpdate = taskData;
    }

    const newUpdateNote = document.getElementById('taskNewUpdate').value.trim();
    if (newUpdateNote) {
        if (!taskToUpdate.history) taskToUpdate.history = [];
        taskToUpdate.history.push({
            date: new Date().toISOString().split('T')[0],
            note: newUpdateNote
        });
        document.getElementById('taskNewUpdate').value = ''; // Clear after adding
    }
    
    saveProject(project);
    
    DependencyManager.updateAllTaskStates(getCurrentProject());

    // Only close modal if triggered by form submission event
    if (e) {
        closeModal('taskModal');
    }
    
    renderTaskBoard();
    renderDashboard();
    refreshCalendar();
    
    if (e) {
        switchToTab('taskBoard');
        showNotification(isEditing ? '任務已更新！' : '任務已創建！', 'success');
    }
}

// ==================
// TASK MODAL - TABS LOGIC
// ==================
function populateAssigneeDropdown(selectedAssignee = '') {
    const project = getCurrentProject();
    const dropdown = document.getElementById('taskAssignee');
    if (!dropdown || !project) return;
    
    dropdown.innerHTML = '<option value="">未分配</option>';
    
    (project.contacts || []).forEach(contact => {
        const option = document.createElement('option');
        option.value = contact.contactName;
        option.textContent = contact.contactName;
        if (contact.contactName === selectedAssignee) {
            option.selected = true;
        }
        dropdown.appendChild(option);
    });
}


function populateDependencyTab(task, project) {
    const selector = document.getElementById('dependencySelector');
    selector.innerHTML = '';
    document.getElementById('bufferDays').value = task.bufferDays || 0;

    (task.dependencies || []).forEach(depId => {
        const depTask = project.tasks.find(t => t.id == depId);
        if (depTask) {
            addDependencyToSelector(depTask.id, depTask.taskName);
        }
    });
}

function populateUpdatesTab(task) {
    document.getElementById('taskNextAction').value = task.nextAction || '';
    document.getElementById('taskNewUpdate').value = ''; // Always clear for a new update

    const historyLog = document.getElementById('taskHistoryLog');
    if (task.history && task.history.length > 0) {
        // Sort history descending by date
        const sortedHistory = [...task.history].sort((a, b) => new Date(b.date) - new Date(a.date));
        historyLog.innerHTML = sortedHistory.map(item => `
            <div class="history-item">
                <div class="history-date">${item.date}</div>
                <div class="history-note">${escapeHtml(item.note)}</div>
            </div>
        `).join('');
    } else {
        historyLog.innerHTML = '<p>尚無歷史紀錄。</p>';
    }
}

function populateFollowUpTab(task) {
    const followUp = task.followUp;
    const enableCheckbox = document.getElementById('enableFollowUp');
    const settingsDiv = document.getElementById('followUpSettings');

    if (followUp && followUp.enabled) {
        enableCheckbox.checked = true;
        settingsDiv.style.display = 'block';
        document.getElementById('followUp1Days').value = followUp.chain[0]?.days || '3';
        document.getElementById('followUp1Action').value = followUp.chain[0]?.action || '溫和提醒';
        document.getElementById('followUp2Days').value = followUp.chain[1]?.days || '7';
        document.getElementById('followUp2Action').value = followUp.chain[1]?.action || '正式跟進';
        document.getElementById('followUp3Days').value = followUp.chain[2]?.days || '10';
        document.getElementById('followUp3Action').value = followUp.chain[2]?.action || '上報主管';
    } else {
        enableCheckbox.checked = false;
        settingsDiv.style.display = 'none';
    }
}


function showDependencyDropdown(button) {
    const oldDropdown = document.getElementById('dependency-dropdown');
    if (oldDropdown) oldDropdown.remove();

    const project = getCurrentProject();
    const editingTaskId = parseInt(document.getElementById('editingTaskId').value);

    const existingDepIds = Array.from(document.querySelectorAll('#dependencySelector .dependency-item'))
        .map(item => parseInt(item.dataset.taskId));

    const availableTasks = project.tasks.filter(t => t.id !== editingTaskId && !existingDepIds.includes(t.id));

    if (availableTasks.length === 0) {
        showNotification('沒有可用的依賴任務', 'info');
        return;
    }

    const dropdown = document.createElement('select');
    dropdown.id = 'dependency-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.marginTop = '8px';
    dropdown.innerHTML = `<option value="">選擇一個任務...</option>` +
        availableTasks.map(t => `<option value="${t.id}">${escapeHtml(t.taskName)}</option>`).join('');

    dropdown.addEventListener('change', function() {
        const selectedId = parseInt(this.value);
        if (selectedId) {
            const selectedTask = project.tasks.find(t => t.id === selectedId);
            addDependencyToSelector(selectedTask.id, selectedTask.taskName);
        }
        this.remove();
    });

    button.parentNode.appendChild(dropdown);
    dropdown.focus();
    
    document.addEventListener('click', (e) => {
        if (e.target !== button && e.target !== dropdown) {
            dropdown.remove();
        }
    }, { once: true });
}

function addDependencyToSelector(taskId, taskName) {
    const selector = document.getElementById('dependencySelector');
    if (document.querySelector(`.dependency-item[data-task-id="${taskId}"]`)) return;

    const item = document.createElement('div');
    item.className = 'dependency-item';
    item.dataset.taskId = taskId;
    item.innerHTML = `
        <span>${escapeHtml(taskName)}</span>
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()">&times;</button>
    `;
    selector.appendChild(item);
}

// ==================
// CHAINING MODE LOGIC
// ==================

function toggleChainingMode(button) {
    chainingState.active = !chainingState.active;
    
    if (chainingState.active) {
        chainingState.firstTaskId = null;
        button.textContent = '🔗 選擇第一個任務 (Prerequisite)';
        button.classList.remove('btn-secondary');
        button.classList.add('btn-primary');
        showNotification('鏈接模式已啟用：請選擇第一個任務。', 'info');
    } else {
        button.textContent = '建立追蹤鏈';
        button.classList.remove('btn-primary');
        button.classList.add('btn-secondary');
        showNotification('鏈接模式已取消。', 'warning');
    }
}

function handleTaskCardClick(taskId) {
    // This function now handles clicks from ANY task card
    const taskCardElement = document.querySelector(`.card[data-task-id="${taskId}"], .briefing-task-item[data-task-id="${taskId}"]`);
    if(!taskCardElement) return;

    // Special handling for cards on My Day view, which might belong to another project
    const cardProjectId = taskCardElement.dataset.projectId;
    if (cardProjectId && cardProjectId != currentProjectId) {
        switchToProject(cardProjectId);
        // Use a timeout to ensure project switch is complete before opening task
        setTimeout(() => editTask(taskId), 200);
        return;
    }

    if (!chainingState.active) {
        editTask(taskId); // Normal behavior
        return;
    }
    
    const button = document.getElementById('createFollowUpChain');
    
    if (!chainingState.firstTaskId) {
        chainingState.firstTaskId = taskId;
        const task = getCurrentProject().tasks.find(t => t.id === taskId);
        button.textContent = `🔗 選擇依賴於 "${task.taskName}" の任務`;
        showNotification(`已選擇 "${task.taskName}"。現在請選擇第二個任務。`, 'info');
    } else {
        const secondTaskId = taskId;
        if (chainingState.firstTaskId === secondTaskId) {
            showNotification('不能將任務鏈接到自身。', 'error');
            return;
        }

        const project = getCurrentProject();
        const firstTask = project.tasks.find(t => t.id === chainingState.firstTaskId);
        const secondTask = project.tasks.find(t => t.id === secondTaskId);

        if (!secondTask.dependencies) {
            secondTask.dependencies = [];
        }
        if (secondTask.dependencies.includes(firstTask.id)) {
            showNotification(`任務 "${secondTask.taskName}" 已經依賴於 "${firstTask.taskName}"。`, 'warning');
        } else {
            secondTask.dependencies.push(firstTask.id);
            saveProject(project);
            showNotification(`成功！現在 "${secondTask.taskName}" 依賴於 "${firstTask.taskName}"。`, 'success');
        }

        toggleChainingMode(button);
        renderTaskBoard();
    }
}


// ==================
// DEPENDENCY VIEW PAGE
// ==================

function updateDependencyView() {
    console.log('Updating dependency view...');
    const project = getCurrentProject();
    if (!project) return;
    
    DependencyManager.updateAllTaskStates(project);

    // Update stats
    const tasks = project.tasks || [];
    const tasksWithDeps = tasks.filter(t => t.dependencies && t.dependencies.length > 0);
    const blockedTasks = tasks.filter(t => t.isBlocked);
    const readyTasks = tasks.filter(t => !t.isBlocked && t.status !== '已完成');

    document.getElementById('totalTasks').textContent = tasks.length;
    document.getElementById('tasksWithDeps').textContent = tasksWithDeps.length;
    document.getElementById('blockedTasks').textContent = blockedTasks.length;
    document.getElementById('readyTasks').textContent = readyTasks.length;

    // Render the new Enhanced List View
    const container = document.getElementById('dependencyMatrix');
    
    const tasksInvolvedInDependencies = tasks.filter(task => {
        const { dependencies, dependents } = DependencyManager.getRelatedTasks(task, project);
        return dependencies.length > 0 || dependents.length > 0;
    });

    if (tasksInvolvedInDependencies.length === 0) {
        container.innerHTML = '<p>目前沒有任何任務存在依賴關係。</p>';
        return;
    }
    
    container.innerHTML = tasksInvolvedInDependencies.map(task => {
        const { dependencies, dependents } = DependencyManager.getRelatedTasks(task, project);
        return `
            <div class="dependency-list-item">
                <h3>${escapeHtml(task.taskName)}</h3>
                <div class="dependency-relations">
                    ${dependencies.length > 0 ? `
                        <div class="relations-group">
                            <strong>⬅️ 依賴於:</strong>
                            ${dependencies.map(d => `<span class="dependency-badge">${escapeHtml(d.taskName)}</span>`).join(' ')}
                        </div>
                    ` : ''}
                    ${dependents.length > 0 ? `
                        <div class="relations-group">
                            <strong>➡️ 阻擋了:</strong>
                            ${dependents.map(d => `<span class="dependent-badge">${escapeHtml(d.taskName)}</span>`).join(' ')}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}


// ==================
// FILE, MEETING, CONTACT MANAGEMENT (Unchanged)
// ==================
function renderFileCenter() {
    const project = getCurrentProject();
    const tableBody = document.getElementById('fileTableBody');
    
    if (!tableBody) return;
    
    if (!project || !project.files || project.files.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #6b7280;">沒有檔案資料</td></tr>';
        return;
    }
    
    tableBody.innerHTML = project.files.map(file => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 0.75rem;">${escapeHtml(file.fileName)}</td>
            <td style="padding: 0.75rem;">${escapeHtml(file.fileCategory || '-')}</td>
            <td style="padding: 0.75rem;">${file.fileUrl ? `<a href="${file.fileUrl}" target="_blank" style="color: #3b82f6;">開啟連結</a>` : '-'}</td>
            <td style="padding: 0.75rem;">
                <button onclick="editFile(${file.id})" class="btn btn-small" style="background: #3b82f6; color: white; margin-right: 0.5rem;">編輯</button>
                <button onclick="deleteFile(${file.id})" class="btn btn-small" style="background: #ef4444; color: white;">刪除</button>
            </td>
        </tr>
    `).join('');
}

function saveFile(e) {
    e.preventDefault();
    
    const project = getCurrentProject();
    if (!project) {
        showNotification('請先選擇專案', 'error');
        return;
    }
    
    const fileId = document.getElementById('editingFileId').value;
    const isEditing = !!fileId;
    
    const fileData = {
        id: isEditing ? parseInt(fileId) : Date.now(),
        fileName: document.getElementById('fileName').value,
        fileCategory: document.getElementById('fileCategory').value,
        fileUrl: document.getElementById('fileUrl').value,
        created: isEditing ? null : new Date().toISOString()
    };
    
    if (!fileData.fileName.trim()) {
        showNotification('請輸入檔案名稱', 'error');
        return;
    }
    
    if (!project.files) project.files = [];
    
    if (isEditing) {
        const index = project.files.findIndex(f => f.id == fileId);
        if (index !== -1) {
            project.files[index] = fileData;
        }
    } else {
        project.files.push(fileData);
    }
    
    saveProject(project);
    closeModal('fileModal');
    renderFileCenter();
    
    switchToTab('fileCenter');
    
    showNotification(isEditing ? '檔案已更新' : '檔案已添加', 'success');
}

function renderMeetingRecords() {
    const project = getCurrentProject();
    const container = document.getElementById('meeting-container');
    
    if (!container) return;
    
    if (!project || !project.meetings || project.meetings.length === 0) {
        container.innerHTML = '<div class="card"><div style="text-align: center; padding: 3rem; color: #6b7280;">沒有會議記錄</div></div>';
        return;
    }
    
    container.innerHTML = project.meetings.map(meeting => `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700;">會議記錄 - ${meeting.meetingDate}</h3>
                <div>
                    <button onclick="editMeeting(${meeting.id})" class="btn btn-small" style="background: #3b82f6; color: white; margin-right: 0.5rem;">編輯</button>
                    <button onclick="deleteMeeting(${meeting.id})" class="btn btn-small" style="background: #ef4444; color: white;">刪除</button>
                </div>
            </div>
            ${meeting.meetingAttendees ? `<p style="margin-bottom: 0.5rem;"><strong>與會者:</strong> ${escapeHtml(meeting.meetingAttendees)}</p>` : ''}
            ${meeting.meetingNotes ? `<p><strong>重點:</strong> ${escapeHtml(meeting.meetingNotes)}</p>` : ''}
        </div>
    `).join('');
}

function saveMeeting(e) {
    e.preventDefault();
    
    const project = getCurrentProject();
    if (!project) {
        showNotification('請先選擇專案', 'error');
        return;
    }
    
    const meetingId = document.getElementById('editingMeetingId').value;
    const isEditing = !!meetingId;
    
    const meetingData = {
        id: isEditing ? parseInt(meetingId) : Date.now(),
        meetingDate: document.getElementById('meetingDate').value,
        meetingAttendees: document.getElementById('meetingAttendees').value,
        meetingNotes: document.getElementById('meetingNotes').value,
        created: isEditing ? null : new Date().toISOString()
    };
    
    if (!meetingData.meetingDate) {
        showNotification('請選擇會議日期', 'error');
        return;
    }
    
    if (!project.meetings) project.meetings = [];
    
    if (isEditing) {
        const index = project.meetings.findIndex(m => m.id == meetingId);
        if (index !== -1) {
            project.meetings[index] = meetingData;
        }
    } else {
        project.meetings.push(meetingData);
    }
    
    saveProject(project);
    closeModal('meetingModal');
    renderMeetingRecords();
    
    switchToTab('meetingRecords');
    
    showNotification(isEditing ? '會議記錄已更新' : '會議記錄已添加', 'success');
}

function renderContacts() {
    const project = getCurrentProject();
    const grid = document.getElementById('contacts-grid');
    
    if (!grid) return;
    
    if (!project || !project.contacts || project.contacts.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1;" class="card"><div style="text-align: center; padding: 3rem; color: #6b7280;">沒有聯絡人資料</div></div>';
        return;
    }
    
    grid.innerHTML = project.contacts.map(contact => `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <h3 style="margin: 0; font-size: 1.125rem; font-weight: 700;">${escapeHtml(contact.contactName)}</h3>
                <div>
                    <button onclick="editContact(${contact.id})" class="btn btn-small" style="background: #3b82f6; color: white; margin-right: 0.5rem;">編輯</button>
                    <button onclick="deleteContact(${contact.id})" class="btn btn-small" style="background: #ef4444; color: white;">刪除</button>
                </div>
            </div>
            ${contact.contactRole ? `<p style="margin-bottom: 0.5rem;"><strong>角色:</strong> ${escapeHtml(contact.contactRole)}</p>` : ''}
            ${contact.contactInfo ? `<p><strong>聯絡方式:</strong> ${escapeHtml(contact.contactInfo)}</p>` : ''}
        </div>
    `).join('');
}

function saveContact(e) {
    e.preventDefault();
    
    const project = getCurrentProject();
    if (!project) {
        showNotification('請先選擇專案', 'error');
        return;
    }
    
    const contactId = document.getElementById('editingContactId').value;
    const isEditing = !!contactId;
    
    const contactData = {
        id: isEditing ? parseInt(contactId) : Date.now(),
        contactName: document.getElementById('contactName').value,
        contactRole: document.getElementById('contactRole').value,
        contactInfo: document.getElementById('contactInfo').value,
        created: isEditing ? null : new Date().toISOString()
    };
    
    if (!contactData.contactName.trim()) {
        showNotification('請輸入聯絡人姓名', 'error');
        return;
    }
    
    if (!project.contacts) project.contacts = [];
    
    if (isEditing) {
        const index = project.contacts.findIndex(c => c.id == contactId);
        if (index !== -1) {
            project.contacts[index] = contactData;
        }
    } else {
        project.contacts.push(contactData);
    }
    
    saveProject(project);
    closeModal('contactModal');
    renderContacts();
    
    switchToTab('contacts');
    
    showNotification(isEditing ? '聯絡人已更新' : '聯絡人已添加', 'success');
}


// ==================
// DESIGN BRIEF MANAGEMENT (Unchanged)
// ==================

function renderDesignBrief() {
    const project = getCurrentProject();
    const container = document.querySelector('#designBrief');
    
    if (!container || !project) return;
    
    container.innerHTML = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h2 style="margin: 0; font-size: 1.5rem; font-weight: 700;">🎨 設計簡報</h2>
                <div>
                    <button id="saveDesignBrief" class="btn btn-secondary" style="margin-right: 1rem;">💾 儲存簡報</button>
                    <button id="exportDesignBrief" class="btn btn-primary">📄 匯出 Word 文件</button>
                </div>
            </div>
            
            <div class="design-section" style="margin-bottom: 2rem;">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">📋 專案概覽</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label for="projectTitle">專案名稱</label>
                        <input type="text" id="projectTitle" value="${project.name}" class="design-input">
                    </div>
                    <div class="form-group">
                        <label for="projectManager">專案經理</label>
                        <input type="text" id="projectManager" value="${project.manager || ''}" placeholder="輸入專案經理姓名" class="design-input">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="clientName">客戶名稱</label>
                        <input type="text" id="clientName" value="${project.clientName || ''}" placeholder="輸入客戶名稱" class="design-input">
                    </div>
                    <div class="form-group">
                        <label for="projectDeadline">專案截止日期</label>
                        <input type="date" id="projectDeadline" value="${project.projectDeadline || ''}" class="design-input">
                    </div>
                </div>
                <div class="form-group">
                    <label for="projectDescription">專案描述</label>
                    <textarea id="projectDescription" rows="3" placeholder="簡述專案背景與目的" class="design-input">${project.projectDescription || ''}</textarea>
                </div>
            </div>

            <div class="design-section" style="margin-bottom: 2rem;">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">🎯 專案目標</h3>
                <div class="form-group">
                    <label for="mainObjective">主要目標</label>
                    <textarea id="mainObjective" rows="2" placeholder="專案的主要目標是什麼？" class="design-input">${project.mainObjective || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="secondaryObjectives">次要目標</label>
                    <textarea id="secondaryObjectives" rows="3" placeholder="列出其他重要目標（每行一個）" class="design-input">${project.secondaryObjectives || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="successMetrics">成功指標</label>
                    <textarea id="successMetrics" rows="2" placeholder="如何衡量專案成功？" class="design-input">${project.successMetrics || ''}</textarea>
                </div>
            </div>

            <div class="design-section" style="margin-bottom: 2rem;">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">👥 目標觀眾</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label for="primaryAudience">主要觀眾</label>
                        <input type="text" id="primaryAudience" value="${project.primaryAudience || ''}" placeholder="例如：25-35歲專業人士" class="design-input">
                    </div>
                    <div class="form-group">
                        <label for="secondaryAudience">次要觀眾</label>
                        <input type="text" id="secondaryAudience" value="${project.secondaryAudience || ''}" placeholder="次要目標群體" class="design-input">
                    </div>
                </div>
                <div class="form-group">
                    <label for="audiencePain">觀眾痛點</label>
                    <textarea id="audiencePain" rows="3" placeholder="目標觀眾面臨什麼問題？" class="design-input">${project.audiencePain || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="audienceBehavior">行為特徵</label>
                    <textarea id="audienceBehavior" rows="2" placeholder="目標觀眾の行為模式、偏好" class="design-input">${project.audienceBehavior || ''}</textarea>
                </div>
            </div>

            <div class="design-section" style="margin-bottom: 2rem;">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">📢 品牌與訊息</h3>
                <div class="form-group">
                    <label for="brandPersonality">品牌性格</label>
                    <input type="text" id="brandPersonality" value="${project.brandPersonality || ''}" placeholder="例如：專業、創新、友善" class="design-input">
                </div>
                <div class="form-group">
                    <label for="coreMessage">核心訊息</label>
                    <textarea id="coreMessage" rows="2" placeholder="想要傳達的主要訊息" class="design-input">${project.coreMessage || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="valueProposition">價值主張</label>
                    <textarea id="valueProposition" rows="2" placeholder="為什麼選擇我們？獨特價值是什麼？" class="design-input">${project.valueProposition || ''}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="toneOfVoice">語調風格</label>
                        <select id="toneOfVoice" class="design-input">
                            <option value="">選擇語調</option>
                            <option value="專業正式" ${project.toneOfVoice === '專業正式' ? 'selected' : ''}>專業正式</option>
                            <option value="友善親切" ${project.toneOfVoice === '友善親切' ? 'selected' : ''}>友善親切</option>
                            <option value="創新前衛" ${project.toneOfVoice === '創新前衛' ? 'selected' : ''}>創新前衛</option>
                            <option value="溫暖感性" ${project.toneOfVoice === '溫暖感性' ? 'selected' : ''}>溫暖感性</option>
                            <option value="簡潔直接" ${project.toneOfVoice === '簡潔直接' ? 'selected' : ''}>簡潔直接</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="communicationStyle">溝通風格</label>
                        <select id="communicationStyle" class="design-input">
                            <option value="">選擇風格</option>
                            <option value="圖像為主" ${project.communicationStyle === '圖像為主' ? 'selected' : ''}>圖像為主</option>
                            <option value="文字為主" ${project.communicationStyle === '文字為主' ? 'selected' : ''}>文字為主</option>
                            <option value="圖文並重" ${project.communicationStyle === '圖文並重' ? 'selected' : ''}>圖文並重</option>
                            <option value="影片動畫" ${project.communicationStyle === '影片動畫' ? 'selected' : ''}>影片動畫</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="design-section" style="margin-bottom: 2rem;">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">🎨 設計需求</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label for="designStyle">設計風格</label>
                        <select id="designStyle" class="design-input">
                            <option value="">選擇風格</option>
                            <option value="現代簡約" ${project.designStyle === '現代簡約' ? 'selected' : ''}>現代簡約</option>
                            <option value="經典優雅" ${project.designStyle === '經典優雅' ? 'selected' : ''}>經典優雅</option>
                            <option value="創意前衛" ${project.designStyle === '創意前衛' ? 'selected' : ''}>創意前衛</option>
                            <option value="溫馨親和" ${project.designStyle === '溫馨親和' ? 'selected' : ''}>溫馨親和</option>
                            <option value="商務專業" ${project.designStyle === '商務專業' ? 'selected' : ''}>商務專業</option>
                            <option value="年輕活潑" ${project.designStyle === '年輕活潑' ? 'selected' : ''}>年輕活潑</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="colorPreference">色彩偏好</label>
                        <input type="text" id="colorPreference" value="${project.colorPreference || ''}" placeholder="例如：藍色系、暖色調" class="design-input">
                    </div>
                </div>
                <div class="form-group">
                    <label for="designInspiration">設計靈感</label>
                    <textarea id="designInspiration" rows="3" placeholder="參考網站、品牌或設計風格（提供連結更佳）" class="design-input">${project.designInspiration || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="mustHaveElements">必要元素</label>
                    <textarea id="mustHaveElements" rows="2" placeholder="必須包含的設計元素（Logo、特定內容等）" class="design-input">${project.mustHaveElements || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="avoidElements">避免元素</label>
                    <textarea id="avoidElements" rows="2" placeholder="不希望包含的設計元素或風格" class="design-input">${project.avoidElements || ''}</textarea>
                </div>
            </div>

            <div class="design-section" style="margin-bottom: 2rem;">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">📦 交付內容</h3>
                <div id="deliverables-container">
                    ${renderDeliverables(project)}
                </div>
                <button type="button" id="addDeliverable" class="btn btn-secondary btn-small">+ 新增交付項目</button>
            </div>

            <div class="design-section">
                <h3 style="color: var(--accent); border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1rem;">📝 其他備註</h3>
                <div class="form-group">
                    <label for="additionalNotes">補充說明</label>
                    <textarea id="additionalNotes" rows="4" placeholder="任何其他重要資訊、特殊要求或備註" class="design-input">${project.additionalNotes || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="contactInformation">聯絡資訊</label>
                    <textarea id="contactInformation" rows="2" placeholder="專案相關聯絡人與聯絡方式" class="design-input">${project.contactInformation || ''}</textarea>
                </div>
            </div>
        </div>
    `;
    
    // Setup event listeners for design brief
    setupDesignBriefListeners();
}

function renderDeliverables(project) {
    if (!project.deliverables || project.deliverables.length === 0) {
        return `
            <div class="deliverable-item" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 1rem; align-items: center; margin-bottom: 1rem; padding: 1rem; background: #f9fafb; border-radius: 8px;">
                <input type="text" placeholder="交付項目名稱（例如：Logo 設計）" class="design-input deliverable-name" value="Logo 設計">
                <input type="text" placeholder="規格（例如：300x300px）" class="design-input deliverable-spec" value="300x300px, PNG/SVG">
                <input type="text" placeholder="數量" class="design-input deliverable-quantity" value="3個版本">
                <button type="button" onclick="removeDeliverable(this)" class="btn btn-danger btn-small">刪除</button>
            </div>
        `;
    }
    
    return project.deliverables.map(item => `
        <div class="deliverable-item" style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 1rem; align-items: center; margin-bottom: 1rem; padding: 1rem; background: #f9fafb; border-radius: 8px;">
            <input type="text" placeholder="交付項目名稱" class="design-input deliverable-name" value="${item.name || ''}">
            <input type="text" placeholder="規格" class="design-input deliverable-spec" value="${item.spec || ''}">
            <input type="text" placeholder="數量" class="design-input deliverable-quantity" value="${item.quantity || ''}">
            <button type="button" onclick="removeDeliverable(this)" class="btn btn-danger btn-small">刪除</button>
        </div>
    `).join('');
}

function setupDesignBriefListeners() {
    // Auto-save on input changes
    document.querySelectorAll('.design-input').forEach(input => {
        input.addEventListener('blur', autoSaveDesignBrief);
    });
}

function addDeliverable() {
    const container = document.getElementById('deliverables-container');
    const newItem = document.createElement('div');
    newItem.className = 'deliverable-item';
    newItem.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 1rem; align-items: center; margin-bottom: 1rem; padding: 1rem; background: #f9fafb; border-radius: 8px;';
    newItem.innerHTML = `
        <input type="text" placeholder="交付項目名稱" class="design-input deliverable-name">
        <input type="text" placeholder="規格" class="design-input deliverable-spec">
        <input type="text" placeholder="數量" class="design-input deliverable-quantity">
        <button type="button" onclick="removeDeliverable(this)" class="btn btn-danger btn-small">刪除</button>
    `;
    container.appendChild(newItem);
}

function removeDeliverable(button) {
    if (confirm('確定要刪除這個交付項目嗎？')) {
        button.closest('.deliverable-item').remove();
        autoSaveDesignBrief();
    }
}

function autoSaveDesignBrief() {
    saveDesignBriefData(false); // Silent save
}

function saveDesignBriefData(showNotificationFlag = true) {
    const project = getCurrentProject();
    if (!project) return;
    
    // Collect all form data
    const briefData = {
        manager: document.getElementById('projectManager')?.value || '',
        clientName: document.getElementById('clientName')?.value || '',
        projectDeadline: document.getElementById('projectDeadline')?.value || '',
        projectDescription: document.getElementById('projectDescription')?.value || '',
        mainObjective: document.getElementById('mainObjective')?.value || '',
        secondaryObjectives: document.getElementById('secondaryObjectives')?.value || '',
        successMetrics: document.getElementById('successMetrics')?.value || '',
        primaryAudience: document.getElementById('primaryAudience')?.value || '',
        secondaryAudience: document.getElementById('secondaryAudience')?.value || '',
        audiencePain: document.getElementById('audiencePain')?.value || '',
        audienceBehavior: document.getElementById('audienceBehavior')?.value || '',
        brandPersonality: document.getElementById('brandPersonality')?.value || '',
        coreMessage: document.getElementById('coreMessage')?.value || '',
        valueProposition: document.getElementById('valueProposition')?.value || '',
        toneOfVoice: document.getElementById('toneOfVoice')?.value || '',
        communicationStyle: document.getElementById('communicationStyle')?.value || '',
        designStyle: document.getElementById('designStyle')?.value || '',
        colorPreference: document.getElementById('colorPreference')?.value || '',
        designInspiration: document.getElementById('designInspiration')?.value || '',
        mustHaveElements: document.getElementById('mustHaveElements')?.value || '',
        avoidElements: document.getElementById('avoidElements')?.value || '',
        additionalNotes: document.getElementById('additionalNotes')?.value || '',
        contactInformation: document.getElementById('contactInformation')?.value || ''
    };
    
    // Collect deliverables
    const deliverableItems = document.querySelectorAll('.deliverable-item');
    briefData.deliverables = Array.from(deliverableItems).map(item => ({
        name: item.querySelector('.deliverable-name')?.value || '',
        spec: item.querySelector('.deliverable-spec')?.value || '',
        quantity: item.querySelector('.deliverable-quantity')?.value || ''
    }));
    
    // Merge with project data
    Object.assign(project, briefData);
    
    // Save to storage
    saveProject(project);
    
    if (showNotificationFlag) {
        showNotification('設計簡報已儲存', 'success');
    }
}

function exportDesignBriefToWord() {
    const project = getCurrentProject();
    if (!project) {
        showNotification('請先選擇專案', 'error');
        return;
    }
    
    console.log('Starting Word export...');
    
    // Save current state first
    saveDesignBriefData(false);
    
    // Create structured HTML for Word export
    const htmlContent = generateDesignBriefHTML(project);
    
    try {
        // Check if required libraries are available
        if (typeof htmlDocx !== 'undefined' && typeof saveAs !== 'undefined') {
            console.log('Libraries available, converting to Word...');
            
            // Convert HTML to Word document blob
            const converted = htmlDocx.asBlob(htmlContent, {
                orientation: 'portrait',
                margins: { top: 720, bottom: 720, left: 720, right: 720 }
            });
            
            // Download the Word file
            const fileName = `設計簡報_${project.name}_${new Date().toISOString().split('T')[0]}.docx`;
            saveAs(converted, fileName);
            
            showNotification('✅ Microsoft Word 文件已成功匯出！', 'success');
            console.log('Word export successful');
            
        } else {
            console.warn('Required libraries not available, falling back to HTML export');
            exportFallbackHTML(htmlContent, project.name);
        }
    } catch (error) {
        console.error('Word export error:', error);
        showNotification('Word 匯出失敗，改為匯出 HTML 格式', 'warning');
        exportFallbackHTML(htmlContent, project.name);
    }
}

function exportFallbackHTML(htmlContent, projectName) {
    try {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `設計簡報_${projectName}_${new Date().toISOString().split('T')[0]}.html`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('📄 HTML 文件已匯出！請用 Microsoft Word 開啟並另存為 .docx', 'info');
        
        // Show instructions in a popup
        setTimeout(() => {
            alert(`📝 使用說明：
            
1. 開啟下載的 HTML 檔案
2. 用 Microsoft Word 開啟此檔案
3. 在 Word 中點選「檔案」→「另存新檔」
4. 選擇檔案格式為「Word 文件 (.docx)」
5. 儲存即可獲得完整的 Word 設計簡報文件

這樣可以保持所有格式和排版完整！`);
        }, 1000);
        
    } catch (error) {
        console.error('HTML export error:', error);
        showNotification('匯出失敗，請檢查瀏覽器設定', 'error');
    }
}

function generateDesignBriefHTML(project) {
    const today = new Date();
    const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('zh-TW') : '待定';
    
    return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>設計簡報 - ${project.name}</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        
        body { 
            font-family: 'Microsoft YaHei', '微軟雅黑', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif; 
            line-height: 1.8; 
            color: #333;
            font-size: 14px;
            max-width: 210mm;
            margin: 0 auto;
            background: white;
            padding: 20px;
        }
        
        .header { 
            text-align: center; 
            margin-bottom: 40px; 
            border-bottom: 4px solid #4f46e5; 
            padding-bottom: 30px; 
            page-break-after: avoid;
        }
        
        .header h1 { 
            color: #4f46e5; 
            font-size: 32px; 
            margin: 0 0 15px 0; 
            font-weight: bold;
            letter-spacing: 2px;
        }
        
        .header .subtitle { 
            color: #666; 
            font-size: 18px; 
            margin: 10px 0;
            font-weight: 500;
        }
        
        .header .date {
            color: #888;
            font-size: 14px;
            margin-top: 15px;
        }
        
        .section { 
            margin-bottom: 35px; 
            page-break-inside: avoid; 
        }
        
        .section h2 { 
            color: #4f46e5; 
            font-size: 20px; 
            border-bottom: 2px solid #e5e7eb; 
            padding-bottom: 10px; 
            margin-bottom: 20px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .section h3 { 
            color: #374151; 
            font-size: 16px; 
            margin: 25px 0 15px 0;
            font-weight: bold;
            border-left: 4px solid #4f46e5;
            padding-left: 15px;
        }
        
        .info-grid { 
            display: grid; 
            grid-template-columns: 180px 1fr; 
            gap: 15px; 
            margin-bottom: 20px; 
            align-items: start;
        }
        
        .info-label { 
            font-weight: bold; 
            color: #4b5563; 
            padding: 12px 0;
            background: #f8fafc;
            padding-left: 15px;
            border-radius: 6px;
        }
        
        .info-value { 
            padding: 12px 15px; 
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            background: white;
            min-height: 20px;
        }
        
        .deliverable-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0; 
            font-size: 13px;
        }
        
        .deliverable-table th, .deliverable-table td { 
            border: 1px solid #d1d5db; 
            padding: 15px 12px; 
            text-align: left; 
            vertical-align: top;
        }
        
        .deliverable-table th { 
            background-color: #4f46e5; 
            color: white;
            font-weight: bold; 
            font-size: 14px;
        }
        
        .deliverable-table tr:nth-child(even) { 
            background-color: #f9fafb; 
        }
        
        .highlight-box { 
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); 
            border-left: 6px solid #3b82f6; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 0 12px 12px 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .objective-list {
            background: #f0f9ff;
            border-radius: 12px;
            padding: 20px;
            margin: 15px 0;
        }
        
        .objective-list ul {
            margin: 0;
            padding-left: 25px;
        }
        
        .objective-list li {
            margin-bottom: 8px;
            line-height: 1.6;
        }
        
        .footer { 
            margin-top: 60px; 
            text-align: center; 
            color: #9ca3af; 
            font-size: 12px; 
            border-top: 2px solid #e5e7eb; 
            padding-top: 30px;
            page-break-inside: avoid;
        }
        
        .footer .logo {
            font-size: 16px;
            font-weight: bold;
            color: #4f46e5;
            margin-bottom: 10px;
        }
        
        @media print {
            body { 
                margin: 0; 
                padding: 15px;
                font-size: 12px; 
            }
            .section { 
                page-break-inside: avoid; 
            }
            .header {
                page-break-after: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎨 專業設計簡報</h1>
        <div class="subtitle">${project.name}</div>
        <div class="date">製表日期：${today.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'long', 
            day: 'numeric',
            weekday: 'long'
        })}</div>
    </div>

    <div class="section">
        <h2>📋 專案概覽</h2>
        <div class="info-grid">
            <div class="info-label">專案名稱</div>
            <div class="info-value">${project.name}</div>
            <div class="info-label">專案經理</div>
            <div class="info-value">${project.manager || '待指派'}</div>
            <div class="info-label">客戶名稱</div>
            <div class="info-value">${project.clientName || '待填寫'}</div>
            <div class="info-label">專案截止日期</div>
            <div class="info-value">${formatDate(project.projectDeadline)}</div>
        </div>
        ${project.projectDescription ? `
            <h3>專案描述</h3>
            <div class="highlight-box">${project.projectDescription.replace(/\n/g, '<br>')}</div>
        ` : ''}
    </div>

    ${project.mainObjective || project.secondaryObjectives || project.successMetrics ? `
        <div class="section">
            <h2>🎯 專案目標與成功指標</h2>
            ${project.mainObjective ? `
                <h3>主要目標</h3>
                <div class="highlight-box">${project.mainObjective.replace(/\n/g, '<br>')}</div>
            ` : ''}
            ${project.secondaryObjectives ? `
                <h3>次要目標</h3>
                <div class="objective-list">
                    <ul>
                        ${project.secondaryObjectives.split('\n').filter(line => line.trim()).map(goal => `<li>${goal.trim()}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${project.successMetrics ? `
                <h3>成功指標</h3>
                <div class="highlight-box">${project.successMetrics.replace(/\n/g, '<br>')}</div>
            ` : ''}
        </div>
    ` : ''}

    ${project.primaryAudience || project.audiencePain || project.audienceBehavior ? `
        <div class="section">
            <h2>👥 目標觀眾分析</h2>
            <div class="info-grid">
                <div class="info-label">主要觀眾</div>
                <div class="info-value">${project.primaryAudience || '待定義'}</div>
                <div class="info-label">次要觀眾</div>
                <div class="info-value">${project.secondaryAudience || '待定義'}</div>
            </div>
            ${project.audiencePain ? `
                <h3>觀眾痛點與需求</h3>
                <div class="highlight-box">${project.audiencePain.replace(/\n/g, '<br>')}</div>
            ` : ''}
            ${project.audienceBehavior ? `
                <h3>行為特徵與偏好</h3>
                <div class="highlight-box">${project.audienceBehavior.replace(/\n/g, '<br>')}</div>
            ` : ''}
        </div>
    ` : ''}

    ${project.brandPersonality || project.coreMessage || project.valueProposition ? `
        <div class="section">
            <h2>📢 品牌策略與核心訊息</h2>
            <div class="info-grid">
                <div class="info-label">品牌性格</div>
                <div class="info-value">${project.brandPersonality || '待定義'}</div>
                <div class="info-label">語調風格</div>
                <div class="info-value">${project.toneOfVoice || '待選擇'}</div>
                <div class="info-label">溝通風格</div>
                <div class="info-value">${project.communicationStyle || '待選擇'}</div>
            </div>
            ${project.coreMessage ? `
                <h3>核心訊息</h3>
                <div class="highlight-box">${project.coreMessage.replace(/\n/g, '<br>')}</div>
            ` : ''}
            ${project.valueProposition ? `
                <h3>價值主張</h3>
                <div class="highlight-box">${project.valueProposition.replace(/\n/g, '<br>')}</div>
            ` : ''}
        </div>
    ` : ''}

    ${project.designStyle || project.colorPreference || project.designInspiration ? `
        <div class="section">
            <h2>🎨 設計需求與規範</h2>
            <div class="info-grid">
                <div class="info-label">設計風格</div>
                <div class="info-value">${project.designStyle || '待選擇'}</div>
                <div class="info-label">色彩偏好</div>
                <div class="info-value">${project.colorPreference || '待定義'}</div>
            </div>
            ${project.designInspiration ? `
                <h3>設計靈感與參考</h3>
                <div class="highlight-box">${project.designInspiration.replace(/\n/g, '<br>')}</div>
            ` : ''}
            ${project.mustHaveElements ? `
                <h3>✅ 必要設計元素</h3>
                <div class="highlight-box" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left-color: #22c55e;">${project.mustHaveElements.replace(/\n/g, '<br>')}</div>
            ` : ''}
            ${project.avoidElements ? `
                <h3>❌ 避免設計元素</h3>
                <div class="highlight-box" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left-color: #ef4444;">${project.avoidElements.replace(/\n/g, '<br>')}</div>
            ` : ''}
        </div>
    ` : ''}

    ${project.deliverables && project.deliverables.length > 0 ? `
        <div class="section">
            <h2>📦 交付內容清單</h2>
            <table class="deliverable-table">
                <thead>
                    <tr>
                        <th style="width: 40%;">交付項目</th>
                        <th style="width: 35%;">規格要求</th>
                        <th style="width: 25%;">交付數量</th>
                    </tr>
                </thead>
                <tbody>
                    ${project.deliverables.filter(item => item.name && item.name.trim()).map(item => `
                        <tr>
                            <td><strong>${item.name || '待定義'}</strong></td>
                            <td>${item.spec || '待定義'}</td>
                            <td>${item.quantity || '待定義'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    ` : ''}

    ${project.additionalNotes || project.contactInformation ? `
        <div class="section">
            <h2>📝 補充資訊與聯絡方式</h2>
            ${project.additionalNotes ? `
                <h3>補充說明</h3>
                <div class="highlight-box">${project.additionalNotes.replace(/\n/g, '<br>')}</div>
            ` : ''}
            ${project.contactInformation ? `
                <h3>專案聯絡資訊</h3>
                <div class="highlight-box">${project.contactInformation.replace(/\n/g, '<br>')}</div>
            ` : ''}
        </div>
    ` : ''}

    <div class="footer">
        <div class="logo">綜合項目管家系統</div>
        <p>本設計簡報由綜合項目管家系統自動生成</p>
        <p>生成時間：${today.toLocaleString('zh-TW')} | 文件版本：v2.0</p>
        <p style="margin-top: 15px; font-style: italic;">「優質設計，始於清晰的簡報」</p>
    </div>
</body>
</html>`;
}


// ==================
// CALENDAR (Unchanged)
// ==================
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.log('Calendar element not found');
        return;
    }
    
    console.log('Initializing calendar...');
    
    try {
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            height: 650,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            editable: true,
            events: getCalendarEvents,
            
            eventClick: function(info) {
                const taskId = info.event.id;
                if (taskId) {
                    editTask(parseInt(taskId));
                }
            },
            
            locale: 'zh-tw',
            buttonText: {
                today: '今天',
                month: '月',
                week: '週', 
                day: '日'
            }
        });
        
        calendar.render();
        console.log('Calendar initialized successfully');
        
    } catch (error) {
        console.error('Error initializing calendar:', error);
    }
}

function getCalendarEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const project = getCurrentProject();
        if (!project || !project.tasks) {
            console.log('No project or tasks to show on calendar.');
            successCallback([]); // Pass an empty array to the callback
            return;
        }

        console.log(`Getting calendar events for project: "${project.name}", Tasks found: ${project.tasks.length}`);

        const events = project.tasks
            .filter(task => {
                const hasStartDate = task.taskStartDate && task.taskStartDate.trim();
                const hasDueDate = task.taskDueDate && task.taskDueDate.trim();
                const hasName = task.taskName && task.taskName.trim();
                
                // A task must have a name and both dates to be displayed
                return hasStartDate && hasDueDate && hasName;
            })
            .map(task => {
                // Create a valid event object for FullCalendar
                const event = {
                    id: task.id.toString(),
                    title: task.taskName,
                    start: task.taskStartDate,
                    end: new Date(new Date(task.taskDueDate).getTime() + 86400000).toISOString().split('T')[0], // Add 1 day to make the end date inclusive
                    backgroundColor: getTaskColor(task.status),
                    borderColor: getTaskColor(task.status),
                    textColor: '#ffffff',
                    allDay: true // Explicitly mark as an all-day event
                };
                return event;
            });

        console.log('Total calendar events being rendered:', events.length);
        successCallback(events); // Use the successCallback to pass the formatted events
    } catch (error) {
        console.error("Error fetching calendar events:", error);
        failureCallback(error); // Use the failureCallback to report errors
    }
}

function getTaskColor(status) {
    const colors = {
        '待辦': '#f97316',
        '內容準備中': '#3b82f6',
        '設計中': '#8b5cf6',
        '待審批': '#eab308', 
        '待製作': '#ef4444',
        '已完成': '#22c55e'
    };
    return colors[status] || '#6b7280';
}

// ==================
// MODAL & UTILITY FUNCTIONS
// ==================
function openModal(modalId) {
    console.log('Opening modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        // Reset form if it exists
        const form = modal.querySelector('form');
        if (form && !['taskModal', 'conflictModal'].includes(modalId)) {
            form.reset();
        }
        // Set default tab for task modal
        if (modalId === 'taskModal') {
            switchTab('basic');
        }
    }
}

function closeModal(modalId) {
    console.log('Closing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.zIndex = '10001';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 4000);
    
    console.log(`Notification (${type}): ${message}`);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================
// DATA IMPORT / EXPORT
// ==================

function exportData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
        showNotification('沒有數據可匯出。', 'warning');
        return;
    }
    
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const date = new Date().toISOString().split('T')[0];
    const fileName = `綜合項目管家_備份_${date}.json`;
    
    // Use FileSaver.js if available, otherwise fallback
    if (typeof saveAs !== 'undefined') {
        saveAs(blob, fileName);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    showNotification('數據已成功匯出！', 'success');
}

function importData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const jsonContent = event.target.result;
                processImportedData(jsonContent);
            } catch (error) {
                console.error('Error reading or parsing file:', error);
                showNotification('匯入失敗：無效的檔案格式。', 'error');
            }
        };
        reader.readAsText(file);
    };
    
    fileInput.click();
}

function processImportedData(jsonContent) {
    try {
        const importedData = JSON.parse(jsonContent);
        let projectsArray = null;

        // Smartly find the projects array, whether it's the root object or nested
        if (Array.isArray(importedData)) {
            projectsArray = importedData;
        } else if (importedData && typeof importedData === 'object' && Array.isArray(importedData.projects)) {
            projectsArray = importedData.projects;
        }
        
        if (!projectsArray) {
            showNotification('匯入失敗：JSON 檔案不是有效的專案陣列。', 'error');
            return;
        }

        const migratedProjects = migrateOldData(projectsArray);
        
        if (migratedProjects.length === 0) {
            showNotification('未在檔案中找到可匯入的有效專案數據。', 'warning');
            return;
        }
        
        const existingProjects = getProjects();
        const mergedProjects = [...existingProjects, ...migratedProjects];
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedProjects));
        
        showNotification(`成功匯入 ${migratedProjects.length} 個專案！`, 'success');
        
        // Reload the application state
        loadProjects();
        if (migratedProjects.length > 0) {
            currentProjectId = migratedProjects[0].id; // Switch to the first imported project
            document.getElementById('projectSelector').value = currentProjectId;
            loadProjectData();
        }
    } catch (error) {
        console.error('Import processing error:', error);
        showNotification('匯入失敗：解析數據時發生錯誤。', 'error');
    }
}

function migrateOldData(oldData) {
    const newProjects = [];
    
    const statusMap = {
        'todo': '待辦',
        'in progress': '設計中',
        'review': '待審批',
        'done': '已完成',
        'completed': '已完成',
        '待辦': '待辦',
        '內容準備中': '內容準備中',
        '設計中': '設計中',
        '待審批': '待審批',
        '待製作': '待製作',
        '已完成': '已完成'
    };

    oldData.forEach(oldProject => {
        const newProject = {
            id: Date.now() + Math.random(),
            name: oldProject.name || oldProject.projectName || `匯入的專案 ${new Date().toLocaleDateString()}`,
            created: oldProject.created || new Date().toISOString(),
            tasks: [],
            files: oldProject.files || [],
            meetings: oldProject.meetings || [],
            contacts: oldProject.contacts || [],
            briefs: oldProject.briefs || []
        };
        
        // Handle old data where "collaterals" was used for tasks
        const tasksToMigrate = oldProject.tasks || oldProject.collaterals;

        if (Array.isArray(tasksToMigrate)) {
            tasksToMigrate.forEach(oldTask => {
                const dueDate = oldTask.taskDueDate || oldTask.dueDate;
                let startDate = oldTask.taskStartDate || oldTask.startDate;

                if (!startDate && dueDate) {
                    const d = new Date(dueDate);
                    d.setDate(d.getDate() - 7);
                    startDate = d.toISOString().split('T')[0];
                } else if (!startDate) {
                    startDate = new Date().toISOString().split('T')[0];
                }

                const newTask = {
                    id: Date.now() + Math.random(),
                    taskName: oldTask.taskName || oldTask.name || oldTask.title || '無標題任務',
                    taskPurpose: oldTask.taskPurpose || oldTask.application || '',
                    taskDescription: oldTask.copy || '', // Only copy goes to description now
                    taskAssignee: oldTask.taskAssignee || oldTask.owner || '',
                    priority: oldTask.priority || 'medium',
                    status: statusMap[oldTask.status?.toLowerCase()] || '待辦',
                    dependencies: [],
                    bufferDays: oldTask.bufferDays || 0,
                    followUp: oldTask.followUp || null,
                    created: oldTask.created || new Date().toISOString(),
                    taskStartDate: startDate,
                    taskDueDate: dueDate || new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    nextAction: oldTask.nextAction || '',
                    history: oldTask.history || []
                };
                newProject.tasks.push(newTask);
            });
        }
        newProjects.push(newProject);
    });
    
    return newProjects;
}


function resetAllData() { 
    localStorage.removeItem(STORAGE_KEY);
    showNotification('所有數據已重置', 'success');
    setTimeout(() => location.reload(), 1000);
}


// ==================
// GLOBAL ONCLICK HANDLERS
// ==================
window.editFile = function(id) { 
    console.log('Edit file:', id);
    const project = getCurrentProject();
    if (!project) return;
    
    const file = project.files.find(f => f.id == id);
    if (!file) return;
    
    // Populate form fields
    document.getElementById('editingFileId').value = file.id;
    document.getElementById('fileName').value = file.fileName || '';
    document.getElementById('fileCategory').value = file.fileCategory || '';
    document.getElementById('fileUrl').value = file.fileUrl || '';
    
    // Open modal
    openModal('fileModal');
};

window.editMeeting = function(id) { 
    console.log('Edit meeting:', id);
    const project = getCurrentProject();
    if (!project) return;
    
    const meeting = project.meetings.find(m => m.id == id);
    if (!meeting) return;
    
    // Populate form fields
    document.getElementById('editingMeetingId').value = meeting.id;
    document.getElementById('meetingDate').value = meeting.meetingDate || '';
    document.getElementById('meetingAttendees').value = meeting.meetingAttendees || '';
    document.getElementById('meetingNotes').value = meeting.meetingNotes || '';
    
    // Open modal
    openModal('meetingModal');
};

window.editContact = function(id) { 
    console.log('Edit contact:', id);
    const project = getCurrentProject();
    if (!project) return;
    
    const contact = project.contacts.find(c => c.id == id);
    if (!contact) return;
    
    // Populate form fields
    document.getElementById('editingContactId').value = contact.id;
    document.getElementById('contactName').value = contact.contactName || '';
    document.getElementById('contactRole').value = contact.contactRole || '';
    document.getElementById('contactInfo').value = contact.contactInfo || '';
    
    // Open modal
    openModal('contactModal');
};

window.deleteFile = function(id) { 
    if (confirm('確定要刪除這個檔案嗎？')) {
        const project = getCurrentProject();
        if (project && project.files) {
            project.files = project.files.filter(f => f.id != id);
            saveProject(project);
            renderFileCenter();
            showNotification('檔案已刪除', 'success');
        }
    }
};

window.deleteMeeting = function(id) { 
    if (confirm('確定要刪除這個會議記錄嗎？')) {
        const project = getCurrentProject();
        if (project && project.meetings) {
            project.meetings = project.meetings.filter(m => m.id != id);
            saveProject(project);
            renderMeetingRecords();
            showNotification('會議記錄已刪除', 'success');
        }
    }
};

window.deleteContact = function(id) { 
    if (confirm('確定要刪除這個聯絡人嗎？')) {
        const project = getCurrentProject();
        if (project && project.contacts) {
            project.contacts = project.contacts.filter(c => c.id != id);
            saveProject(project);
            renderContacts();
            showNotification('聯絡人已刪除', 'success');
        }
    }
};

window.switchToProject = function(projectId) {
    currentProjectId = projectId;
    document.getElementById('projectSelector').value = projectId;
    loadProjectData();
    showNotification('已切換專案', 'success');
};

window.deleteProject = function(projectId, viewMode) {
    if (confirm('確定要永久刪除此專案嗎？這個操作無法復原。')) {
        if (viewMode === 'active') {
            let projects = getActiveProjects();
            projects = projects.filter(p => p.id != projectId);
            saveProjects(projects);
        } else {
            let projects = getArchivedProjects();
            projects = projects.filter(p => p.id != projectId);
            saveArchivedProjects(projects);
        }
        
        if (currentProjectId == projectId) {
            currentProjectId = null;
        }
        
        loadProjects();
        renderProjectList(viewMode);
        showNotification('專案已永久刪除', 'success');
    }
};

window.removeDeliverable = removeDeliverable;
console.log('Complete script loaded with ALL features implemented!');

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Add PWA install prompt handling
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('PWA install prompt available');
  e.preventDefault();
  deferredPrompt = e;
  showInstallPromotion();
});

function showInstallPromotion() {
  // You can add a custom install button here
  console.log('PWA can be installed');
}
// Mobile Menu Functionality
function initializeMobileMenu() {
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  
  if (!mobileToggle || !sidebar || !mobileOverlay) return;
  
  // Toggle mobile menu
  mobileToggle.addEventListener('click', function() {
    const isOpen = sidebar.classList.contains('mobile-open');
    
    if (isOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });
  
  // Close menu when clicking overlay
  mobileOverlay.addEventListener('click', closeMobileMenu);
  
  // Close menu when clicking a navigation link
  sidebar.addEventListener('click', function(e) {
    if (e.target.closest('.sidebar-link')) {
      // Small delay to allow navigation to complete
      setTimeout(closeMobileMenu, 100);
    }
  });
  
  // Close menu when window is resized to desktop
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      closeMobileMenu();
    }
  });
}

function openMobileMenu() {
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  
  sidebar.classList.add('mobile-open');
  mobileOverlay.classList.add('active');
  mobileToggle.classList.add('active');
  
  // Prevent body scroll when menu is open
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  const mobileToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  const mobileOverlay = document.getElementById('mobileOverlay');
  
  sidebar.classList.remove('mobile-open');
  mobileOverlay.classList.remove('active');
  mobileToggle.classList.remove('active');
  
  // Restore body scroll
  document.body.style.overflow = '';
}

// Add to your existing initializeApp function
function initializeApp() {
  console.log('Starting app initialization...');
  
  setupNavigation();
  loadProjects();
  updateCurrentDate();
  setupAllEventListeners();
  
  // Add this line
  initializeMobileMenu();
  
  setTimeout(() => {
    initializeCalendar();
  }, 200);
  
  DependencyManager.init();
  GlobalSearch.init();
  Notifications.init();
  CommandPalette.init();
  
  setTimeout(() => {
    renderDashboard();
  }, 100);
  
  console.log('App initialization complete');
}

