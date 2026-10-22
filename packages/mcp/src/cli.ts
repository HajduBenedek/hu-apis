#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHuApisServer } from './server.js';

const server = createHuApisServer();
await server.connect(new StdioServerTransport());
