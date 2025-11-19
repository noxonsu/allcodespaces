const fs = require('fs');
const path = require('path');

// Pricing per 1M tokens (input/output) in USD
const MODEL_PRICING = {
    // Latest GPT-4.1 models
    'gpt-4.1': { input: 2.00, output: 8.00 },
    'gpt-4.1-2025-04-14': { input: 2.00, output: 8.00 },
    'gpt-4.1-mini': { input: 0.40, output: 1.60 },
    'gpt-4.1-mini-2025-04-14': { input: 0.40, output: 1.60 },
    'gpt-4.1-nano': { input: 0.10, output: 0.40 },
    'gpt-4.1-nano-2025-04-14': { input: 0.10, output: 0.40 },
    'gpt-4.5-preview': { input: 75.00, output: 150.00 },
    'gpt-4.5-preview-2025-02-27': { input: 75.00, output: 150.00 },
    
    // GPT-4o models
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-2024-08-06': { input: 2.50, output: 10.00 },
    'gpt-4o-audio-preview': { input: 2.50, output: 10.00 },
    'gpt-4o-audio-preview-2024-12-17': { input: 2.50, output: 10.00 },
    'gpt-4o-realtime-preview': { input: 5.00, output: 20.00 },
    'gpt-4o-realtime-preview-2024-12-17': { input: 5.00, output: 20.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.60 },
    'gpt-4o-mini-audio-preview': { input: 0.15, output: 0.60 },
    'gpt-4o-mini-audio-preview-2024-12-17': { input: 0.15, output: 0.60 },
    'gpt-4o-mini-realtime-preview': { input: 0.60, output: 2.40 },
    'gpt-4o-mini-realtime-preview-2024-12-17': { input: 0.60, output: 2.40 },
    'gpt-4o-mini-search-preview': { input: 0.15, output: 0.60 },
    'gpt-4o-mini-search-preview-2025-03-11': { input: 0.15, output: 0.60 },
    'gpt-4o-search-preview': { input: 2.50, output: 10.00 },
    'gpt-4o-search-preview-2025-03-11': { input: 2.50, output: 10.00 },
    
    // o1 models
    'o1': { input: 15.00, output: 60.00 },
    'o1-2024-12-17': { input: 15.00, output: 60.00 },
    'o1-pro': { input: 150.00, output: 600.00 },
    'o1-pro-2025-03-19': { input: 150.00, output: 600.00 },
    'o1-mini': { input: 1.10, output: 4.40 },
    'o1-mini-2024-09-12': { input: 1.10, output: 4.40 },
    
    // o3 models
    'o3': { input: 10.00, output: 40.00 },
    'o3-2025-04-16': { input: 10.00, output: 40.00 },
    'o3-mini': { input: 1.10, output: 4.40 },
    'o3-mini-2025-01-31': { input: 1.10, output: 4.40 },
    
    // o4 models
    'o4-mini': { input: 1.10, output: 4.40 },
    'o4-mini-2025-04-16': { input: 1.10, output: 4.40 },
    
    // Other models
    'codex-mini-latest': { input: 1.50, output: 6.00 },
    'computer-use-preview': { input: 3.00, output: 12.00 },
    'computer-use-preview-2025-03-11': { input: 3.00, output: 12.00 },
    'gpt-image-1': { input: 5.00, output: 0 }, // No output pricing for image generation
    
    // Legacy models (keeping for backward compatibility)
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    
    // Non-OpenAI models
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
