#!/usr/bin/env node

const path = require('path');
const { startAeclDashboard } = require('../dist/cli/aecl');

startAeclDashboard().catch((err) => {
    console.error('Fatal error starting AECL dashboard:', err);
    process.exit(1);
});
