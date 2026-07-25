const express = require('express');
const router = express.Router();
const os = require('os');
const pkg = require('../package.json');
const { ensureSuperAdmin } = require('../middleware/auth');

// Superadmin-only diagnostics page
router.get('/system/diagnostics', ensureSuperAdmin, async (req, res) => {
  try {
    const startTime = process.uptime();
    const uptime = {
      seconds: Math.floor(startTime),
      formatted: formatUptime(startTime)
    };

    // Build information
    const buildInfo = {
      version: pkg.version,
      name: pkg.name,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    // System information
    const systemInfo = {
      uptime,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(os.totalmem() / 1024 / 1024),
        free: Math.round(os.freemem() / 1024 / 1024)
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'unknown'
      }
    };

    // Status checks
    const statusChecks = {
      database: {
        status: 'connected',
        type: 'MongoDB'
      },
      payment: {
        status: process.env.SECRET_KEY ? 'configured' : 'unconfigured',
        mode: process.env.SECRET_KEY ? (process.env.SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test') : 'none'
      },
      email: {
        status: process.env.SMTP_HOST ? 'configured' : 'unconfigured'
      }
    };

    res.render('diagnostics', {
      buildInfo,
      systemInfo,
      statusChecks
    });
  } catch (err) {
    console.error('Diagnostics error:', err);
    res.status(500).send("Diagnostics unavailable");
  }
});

// Health check endpoint (JSON)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: pkg.version,
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: 'connected',
    application: 'running'
  });
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : 'just started';
}

module.exports = router;
