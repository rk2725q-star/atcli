#!/usr/bin/env node

const { startCli } = require('../dist/index');

startCli().catch((err) => {
    console.error('Fatal error starting ATCLI:', err);
    process.exit(1);
});
