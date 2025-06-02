const fs = require('fs');
const path = require('path');

// Pricing per 1M tokens (input/output) in USD
const MODEL_PRICING = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'whisper-1': { input: 0.006, output: 0 } // per minute, not per token
};

const COST_DATA_DIR = path.join(__dirname, 'cost_data');

// Safely ensure cost data directory exists
function ensureCostDataDir() {
    try {
        if (!fs.existsSync(COST_DATA_DIR)) {
            fs.mkdirSync(COST_DATA_DIR, { recursive: true });
        }
        return true;
    } catch (error) {
        console.warn('[CostTracker] Could not create cost_data directory:', error.message);
        return false;
    }
}

function calculateCost(model, inputTokens, outputTokens, audioMinutes = 0) {
    try {
        const pricing = MODEL_PRICING[model];
        if (!pricing) {
            console.warn(`[CostTracker] No pricing data for model: ${model}`);
            return 0;
        }

        let cost = 0;
        
        if (model === 'whisper-1') {
            // Whisper pricing is per minute
            cost = audioMinutes * pricing.input;
        } else {
            // Text models pricing per 1M tokens
            cost = (inputTokens * pricing.input / 1000000) + (outputTokens * pricing.output / 1000000);
        }
        
        return cost;
    } catch (error) {
        console.error('[CostTracker] Error calculating cost:', error.message);
        return 0;
    }
}

function saveCostData(chatId, model, inputTokens, outputTokens, cost, audioMinutes = 0, nameprompt = 'default') {
    try {
        if (!ensureCostDataDir()) {
            return; // Silently fail if can't create directory
        }

        const today = new Date().toISOString().split('T')[0];
        const costEntry = {
            timestamp: new Date().toISOString(),
            chatId: chatId.toString(),
            model,
            inputTokens,
            outputTokens,
            audioMinutes,
            cost,
            nameprompt
        };

        // Save to daily file
        const dailyFile = path.join(COST_DATA_DIR, `costs_${today}.json`);
        let dailyCosts = [];
        if (fs.existsSync(dailyFile)) {
            try {
                dailyCosts = JSON.parse(fs.readFileSync(dailyFile, 'utf8'));
            } catch (error) {
                console.warn('[CostTracker] Error reading daily cost file, starting fresh:', error.message);
                dailyCosts = [];
            }
        }
        
        dailyCosts.push(costEntry);
        fs.writeFileSync(dailyFile, JSON.stringify(dailyCosts, null, 2));

        // Save to chat-specific file
        const chatCostFile = path.join(COST_DATA_DIR, `chat_${chatId}_costs.json`);
        let chatCosts = [];
        if (fs.existsSync(chatCostFile)) {
            try {
                chatCosts = JSON.parse(fs.readFileSync(chatCostFile, 'utf8'));
            } catch (error) {
                console.warn('[CostTracker] Error reading chat cost file, starting fresh:', error.message);
                chatCosts = [];
            }
        }
        
        chatCosts.push(costEntry);
        fs.writeFileSync(chatCostFile, JSON.stringify(chatCosts, null, 2));

        console.log(`[CostTracker] ${nameprompt} - Chat ${chatId}: $${cost.toFixed(6)} (${model}, ${inputTokens}+${outputTokens} tokens)`);
    } catch (error) {
        console.error('[CostTracker] Error saving cost data:', error.message);
        // Don't throw error to maintain backward compatibility
    }
}

function getChatCosts(chatId) {
    try {
        if (!ensureCostDataDir()) {
            return { totalCost: 0, requests: 0, costs: [] };
        }

        const chatCostFile = path.join(COST_DATA_DIR, `chat_${chatId}_costs.json`);
        if (!fs.existsSync(chatCostFile)) {
            return { totalCost: 0, requests: 0, costs: [] };
        }

        const costs = JSON.parse(fs.readFileSync(chatCostFile, 'utf8'));
        const totalCost = costs.reduce((sum, entry) => sum + entry.cost, 0);
        return { totalCost, requests: costs.length, costs };
    } catch (error) {
        console.error('[CostTracker] Error reading chat costs:', error.message);
        return { totalCost: 0, requests: 0, costs: [] };
    }
}

function getDailyCosts(date = null) {
    try {
        if (!ensureCostDataDir()) {
            return { totalCost: 0, requests: 0, costs: [] };
        }

        const targetDate = date || new Date().toISOString().split('T')[0];
        const dailyFile = path.join(COST_DATA_DIR, `costs_${targetDate}.json`);
        
        if (!fs.existsSync(dailyFile)) {
            return { totalCost: 0, requests: 0, costs: [] };
        }

        const costs = JSON.parse(fs.readFileSync(dailyFile, 'utf8'));
        const totalCost = costs.reduce((sum, entry) => sum + entry.cost, 0);
        return { totalCost, requests: costs.length, costs };
    } catch (error) {
        console.error('[CostTracker] Error reading daily costs:', error.message);
        return { totalCost: 0, requests: 0, costs: [] };
    }
}

function getBotCostsSummary() {
    try {
        if (!ensureCostDataDir()) {
            return {};
        }

        const costFiles = fs.readdirSync(COST_DATA_DIR).filter(file => file.startsWith('costs_') && file.endsWith('.json'));
        const summary = {};

        for (const file of costFiles) {
            try {
                const costs = JSON.parse(fs.readFileSync(path.join(COST_DATA_DIR, file), 'utf8'));
                for (const entry of costs) {
                    const bot = entry.nameprompt || 'unknown';
                    if (!summary[bot]) {
                        summary[bot] = { totalCost: 0, requests: 0, chats: new Set() };
                    }
                    summary[bot].totalCost += entry.cost;
                    summary[bot].requests += 1;
                    summary[bot].chats.add(entry.chatId);
                }
            } catch (error) {
                console.warn(`[CostTracker] Error reading file ${file}:`, error.message);
            }
        }

        // Convert Set to count
        for (const bot in summary) {
            summary[bot].uniqueChats = summary[bot].chats.size;
            delete summary[bot].chats;
        }

        return summary;
    } catch (error) {
        console.error('[CostTracker] Error generating bot costs summary:', error.message);
        return {};
    }
}

module.exports = {
    calculateCost,
    saveCostData,
    getChatCosts,
    getDailyCosts,
    getBotCostsSummary,
    MODEL_PRICING
};
