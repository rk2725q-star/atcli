#!/usr/bin/env node

import { AtcliMcpServer } from './server';

const server = new AtcliMcpServer();
server.run().catch((error) => {
    console.error("Fatal error starting ATCLI MCP Server:", error);
    process.exit(1);
});
