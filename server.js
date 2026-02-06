const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const CONFIG_PATH = '/root/.openclaw/openclaw.json';
const STABLE_CONFIG_PATH = '/root/.openclaw/openclaw.json.stable_v1';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Helper to run shell commands
const runCommand = (cmd) => {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, output: stderr || error.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
};

// --- Watchdog Logic ---
let watchdogInterval = null;
const WATCHDOG_CHECK_MS = 30000; // Check every 30s

async function checkSystemHealth() {
    console.log('[Watchdog] Checking system health...');
    
    // 1. Check if process is running
    const pgrep = await runCommand('pgrep -f "openclaw gateway"');
    if (!pgrep.success || !pgrep.output.trim()) {
        console.warn('[Watchdog] ⚠️ Gateway process NOT found!');
        return await attemptRecovery('Process not running');
    }

    // 2. Check config validity (light check)
    try {
        JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.warn('[Watchdog] ⚠️ Config JSON is invalid!');
        return await attemptRecovery('Invalid Config JSON');
    }

    // 3. (Optional) Check logs for fatal errors?
    // This is harder to do reliably without false positives.
    // For now, process existence + config validity is a good baseline.
    
    console.log('[Watchdog] System healthy.');
}

async function attemptRecovery(reason) {
    console.warn(`[Watchdog] 🚑 Initiating recovery. Reason: ${reason}`);
    
    if (!fs.existsSync(STABLE_CONFIG_PATH)) {
        console.error('[Watchdog] ❌ Stable config not found! Cannot recover.');
        return;
    }

    // Restore stable config
    try {
        fs.copyFileSync(STABLE_CONFIG_PATH, CONFIG_PATH);
        console.log('[Watchdog] ✅ Restored stable configuration.');
        
        // Restart service
        console.log('[Watchdog] 🔄 Restarting gateway...');
        await runCommand('openclaw gateway restart'); // Or start if stopped
        // If restart fails (e.g. service wasn't running), try start
        await runCommand('openclaw gateway start'); 
        
        console.log('[Watchdog] 🚀 Recovery sequence complete.');
        io.emit('log', JSON.stringify({
            time: new Date().toISOString(),
            _meta: { logLevelName: 'WARN' },
            "0": `[Watchdog] System recovered from: ${reason}`
        }));
    } catch (e) {
        console.error('[Watchdog] Recovery failed:', e);
    }
}

// Start Watchdog
watchdogInterval = setInterval(checkSystemHealth, WATCHDOG_CHECK_MS);


// API Endpoints
app.get('/api/status', async (req, res) => {
    const detailed = req.query.detailed === 'true';
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuLoad = os.loadavg();
    
    const systemStats = {
        memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            percent: Math.round((usedMem / totalMem) * 100)
        },
        cpu: { load: cpuLoad },
        uptime: os.uptime()
    };

    if (detailed) {
        const statusCmd = await runCommand('openclaw gateway status');
        res.json({ gateway: statusCmd, system: systemStats, mode: 'detailed' });
    } else {
        const checkCmd = await runCommand('pgrep -f "openclaw"');
        const isRunning = checkCmd.success && checkCmd.output.trim().length > 0;
        res.json({
            gateway: { success: true, output: isRunning ? 'Active: active (silent check)' : 'Inactive' },
            system: systemStats,
            mode: 'silent'
        });
    }
});

app.get('/api/sessions', async (req, res) => {
    const result = await runCommand('openclaw sessions --json');
    try {
        let jsonStr = result.output;
        const firstBrace = jsonStr.indexOf('{');
        if(firstBrace > -1) jsonStr = jsonStr.substring(firstBrace);
        const data = JSON.parse(jsonStr);
        res.json({ success: true, sessions: data.sessions || [] });
    } catch(e) {
        res.json({ success: false, error: 'Parse error', raw: result.output });
    }
});

app.get('/api/cron', async (req, res) => {
    const result = await runCommand('openclaw cron list --json');
    try {
        let jsonStr = result.output;
        const firstBrace = jsonStr.indexOf('{');
        if(firstBrace > -1) jsonStr = jsonStr.substring(firstBrace);
        const data = JSON.parse(jsonStr);
        res.json({ success: true, jobs: data.jobs || [] });
    } catch(e) {
        res.json({ success: false, error: 'Parse error', raw: result.output });
    }
});

app.post('/api/control', async (req, res) => {
    const { action } = req.body;
    let cmd = '';
    switch(action) {
        case 'restart': cmd = 'openclaw gateway restart'; break;
        case 'stop': cmd = 'openclaw gateway stop'; break;
        case 'start': cmd = 'openclaw gateway start'; break;
        default: return res.status(400).json({ error: 'Invalid action' });
    }
    const result = await runCommand(cmd);
    res.json(result);
});

app.get('/api/config', async (req, res) => {
    try {
        const config = fs.readFileSync(CONFIG_PATH, 'utf8');
        res.json({ success: true, config: JSON.parse(config) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { config } = req.body;
        if (typeof config !== 'object') throw new Error('Invalid config format');
        // Use verify logic here if needed, for now just write
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
        res.json({ success: true, message: 'Config saved' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Logs
const getLatestLog = () => {
    const logDir = '/tmp/openclaw';
    if (!fs.existsSync(logDir)) return null;
    const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith('openclaw-') && f.endsWith('.log'))
        .sort()
        .reverse();
    return files.length ? path.join(logDir, files[0]) : null;
};

io.on('connection', (socket) => {
    const logFile = getLatestLog();
    if (logFile) {
        socket.emit('log', JSON.stringify({ "0": `Tailing log file: ${logFile}` }));
        
        const tail = spawn('tail', ['-f', logFile]);
        let buffer = '';
        tail.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); 
            lines.forEach(line => {
                if (line.trim()) socket.emit('log', line);
            });
        });
        tail.stderr.on('data', (data) => socket.emit('log', JSON.stringify({ "0": `ERR: ${data.toString()}`, _meta: { logLevelName: 'ERROR' } })));
        socket.on('disconnect', () => tail.kill());
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard running on http://0.0.0.0:${PORT}`);
});
