const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = '/Users/chongya/.openclaw/openclaw.json';
const STABLE_CONFIG_PATH = '/Users/chongya/.openclaw/openclaw.json.stable_v1';

// Security: API Token authentication
const API_TOKEN = process.env.DASHBOARD_API_TOKEN || 'openclaw-dashboard-' + Date.now();
console.log(`[Security] API Token: ${API_TOKEN.substring(0, 10)}...`);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// Auth middleware for sensitive endpoints
function authMiddleware(req, res, next) {
    const token = req.headers['x-api-token'] || req.query.token;
    if (token !== API_TOKEN) {
        console.warn(`[Security] Unauthorized access attempt from ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing API token' });
    }
    next();
}

// Helper to run shell commands
const runCommand = (cmd) => {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, output: stderr || error.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
};

// Config validation function
function validateConfig(config) {
    const errors = [];
    
    if (typeof config !== 'object' || config === null) {
        return { valid: false, errors: ['Config must be an object'] };
    }
    
    // Check required fields
    const required = ['gateway', 'agents'];
    for (const field of required) {
        if (!config[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    }
    
    // Validate gateway config
    if (config.gateway) {
        if (typeof config.gateway.port !== 'number') {
            errors.push('gateway.port must be a number');
        }
        if (!config.gateway.auth || !config.gateway.auth.token) {
            errors.push('gateway.auth.token is required');
        }
    }
    
    // Try to stringify to catch circular references
    try {
        JSON.stringify(config);
    } catch (e) {
        errors.push('Config contains circular references or invalid JSON');
    }
    
    return { valid: errors.length === 0, errors };
}

// Backup config before changes
function backupConfig() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${CONFIG_PATH}.bak.${timestamp}`;
    try {
        fs.copyFileSync(CONFIG_PATH, backupPath);
        // Keep only last 10 backups
        const backups = fs.readdirSync(path.dirname(CONFIG_PATH))
            .filter(f => f.startsWith('openclaw.json.bak.'))
            .sort()
            .reverse();
        if (backups.length > 10) {
            backups.slice(10).forEach(f => {
                fs.unlinkSync(path.join(path.dirname(CONFIG_PATH), f));
            });
        }
        return backupPath;
    } catch (e) {
        console.error('[Backup] Failed:', e);
        return null;
    }
}

// Get list of config backups
function getConfigBackups() {
    try {
        return fs.readdirSync(path.dirname(CONFIG_PATH))
            .filter(f => f.startsWith('openclaw.json.bak.'))
            .sort()
            .reverse()
            .slice(0, 10);
    } catch (e) {
        return [];
    }
}

// --- Watchdog Logic ---
let watchdogInterval = null;
const WATCHDOG_CHECK_MS = 30000;

async function checkSystemHealth() {
    console.log('[Watchdog] Checking system health...');
    
    const pgrep = await runCommand('pgrep -f "openclaw gateway"');
    if (!pgrep.success || !pgrep.output.trim()) {
        console.warn('[Watchdog] ⚠️ Gateway process NOT found!');
        return await attemptRecovery('Process not running');
    }

    try {
        JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.warn('[Watchdog] ⚠️ Config JSON is invalid!');
        return await attemptRecovery('Invalid Config JSON');
    }
    
    console.log('[Watchdog] System healthy.');
}

async function attemptRecovery(reason) {
    console.warn(`[Watchdog] 🚑 Initiating recovery. Reason: ${reason}`);
    
    if (!fs.existsSync(STABLE_CONFIG_PATH)) {
        console.error('[Watchdog] ❌ Stable config not found! Cannot recover.');
        return;
    }

    try {
        const backupPath = `${CONFIG_PATH}.corrupted.${Date.now()}`;
        fs.copyFileSync(CONFIG_PATH, backupPath);
        fs.copyFileSync(STABLE_CONFIG_PATH, CONFIG_PATH);
        console.log('[Watchdog] ✅ Restored stable configuration.');
        
        await runCommand('openclaw gateway restart');
        await runCommand('openclaw gateway start'); 
        
        console.log('[Watchdog] 🚀 Recovery sequence complete.');
        io.emit('system:recovery', { reason, time: new Date().toISOString() });
    } catch (e) {
        console.error('[Watchdog] Recovery failed:', e);
    }
}

watchdogInterval = setInterval(checkSystemHealth, WATCHDOG_CHECK_MS);

// API Endpoints

// Public endpoints (no auth required)
app.get('/api/status', async (req, res) => {
    try {
        const detailed = req.query.detailed === 'true';
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        const systemStats = {
            memory: {
                total: Math.round(totalMem / 1024 / 1024),
                used: Math.round(usedMem / 1024 / 1024),
                free: Math.round(freeMem / 1024 / 1024),
                percent: Math.round((usedMem / totalMem) * 100)
            },
            cpu: { load: os.loadavg() },
            uptime: os.uptime()
        };

        if (detailed) {
            const statusCmd = await runCommand('openclaw gateway status');
            res.json({ gateway: statusCmd, system: systemStats, mode: 'detailed' });
        } else {
            const checkCmd = await runCommand('pgrep -f "openclaw"');
            const isRunning = checkCmd.success && checkCmd.output.trim().length > 0;
            res.json({
                gateway: { success: true, running: isRunning, output: isRunning ? 'Active' : 'Inactive' },
                system: systemStats,
                mode: 'silent'
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Protected endpoints (require auth)
app.get('/api/sessions', authMiddleware, async (req, res) => {
    try {
        const result = await runCommand('openclaw sessions --json');
        let jsonStr = result.output;
        const firstBrace = jsonStr.indexOf('{');
        if (firstBrace > -1) jsonStr = jsonStr.substring(firstBrace);
        const data = JSON.parse(jsonStr);
        res.json({ success: true, sessions: data.sessions || [] });
    } catch (e) {
        res.json({ success: false, error: 'Parse error', raw: e.message });
    }
});

app.get('/api/cron', authMiddleware, async (req, res) => {
    try {
        const result = await runCommand('openclaw cron list --json');
        let jsonStr = result.output;
        const firstBrace = jsonStr.indexOf('{');
        if (firstBrace > -1) jsonStr = jsonStr.substring(firstBrace);
        const data = JSON.parse(jsonStr);
        res.json({ success: true, jobs: data.jobs || [] });
    } catch (e) {
        res.json({ success: false, error: 'Parse error', raw: e.message });
    }
});

app.post('/api/control', authMiddleware, async (req, res) => {
    const { action } = req.body;
    const validActions = ['restart', 'stop', 'start'];
    
    if (!validActions.includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    const cmd = `openclaw gateway ${action}`;
    const result = await runCommand(cmd);
    res.json(result);
});

// Config endpoints with validation and backup
app.get('/api/config', authMiddleware, async (req, res) => {
    try {
        const config = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(config);
        
        // Mask sensitive data for frontend
        if (parsed.gateway && parsed.gateway.auth && parsed.gateway.auth.token) {
            const token = parsed.gateway.auth.token;
            parsed.gateway.auth.token = token.substring(0, 8) + '********';
        }
        
        // Add backup list
        const backups = getConfigBackups();
        
        res.json({ 
            success: true, 
            config: parsed,
            backups: backups,
            raw: config // Send raw for editing
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/config', authMiddleware, async (req, res) => {
    try {
        const { config, verifyOnly = false } = req.body;
        
        // Validate
        const validation = validateConfig(config);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: 'Validation failed', 
                details: validation.errors 
            });
        }
        
        if (verifyOnly) {
            return res.json({ success: true, message: 'Config is valid' });
        }
        
        // Backup current config
        const backupPath = backupConfig();
        
        // Write new config
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
        
        // Verify write
        const verify = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        
        res.json({ 
            success: true, 
            message: 'Config saved successfully',
            backupPath: backupPath ? path.basename(backupPath) : null
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Config restore endpoint
app.post('/api/config/restore', authMiddleware, async (req, res) => {
    try {
        const { backupFile } = req.body;
        const backupPath = path.join(path.dirname(CONFIG_PATH), backupFile);
        
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup file not found' });
        }
        
        // Backup current first
        backupConfig();
        
        // Restore
        fs.copyFileSync(backupPath, CONFIG_PATH);
        
        res.json({ success: true, message: 'Config restored from ' + backupFile });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Logs endpoint
const getLatestLog = () => {
    const logDir = '/tmp/openclaw';
    if (!fs.existsSync(logDir)) return null;
    const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith('openclaw-') && f.endsWith('.log'))
        .sort()
        .reverse();
    return files.length ? path.join(logDir, files[0]) : null;
};

// WebSocket with reconnection support
io.on('connection', (socket) => {
    console.log('[Socket] Client connected');
    
    const logFile = getLatestLog();
    if (logFile) {
        socket.emit('system:connected', { logFile: path.basename(logFile) });
        
        const tail = spawn('tail', ['-f', '-n', '100', logFile]);
        let buffer = '';
        
        tail.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            lines.forEach(line => {
                if (line.trim()) socket.emit('log', line);
            });
        });
        
        tail.stderr.on('data', (data) => {
            socket.emit('log', JSON.stringify({ error: data.toString() }));
        });
        
        socket.on('disconnect', () => {
            console.log('[Socket] Client disconnected');
            tail.kill();
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Error]', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Global error handlers
process.on('uncaughtException', (err) => {
    console.error('[Fatal] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Fatal] Unhandled Rejection at:', promise, 'reason:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Dashboard running on http://0.0.0.0:${PORT}`);
    console.log(`🔐 API Token: ${API_TOKEN}`);
});
