#!/usr/bin/env node
// src/index.js — CLI entry point
'use strict';

const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./logger');
const DeepSeekAgent = require('./agent');

async function main() {
  const task = process.argv.slice(2).join(' ');
  if (!task) {
    console.log('Usage: node src/index.js "your task here"');
    process.exit(1);
  }

  logger.banner();
  const agent = new DeepSeekAgent({ saveLog: false });

  // اتصال رویدادها به لاگر کنسول
  agent.on('status', msg => logger.info(msg));
  agent.on('iteration', ({ current, max }) => logger.iteration(current, max));
  agent.on('thinking', text => logger.thinking(`Generating... (${text.length} chars)`));
  agent.on('tool_call', ({ name, args }) => logger.toolCall(name, args));
  agent.on('tool_result', ({ result, isError }) => logger.toolResult(result, isError));
  agent.on('final', text => {
    logger.clearLine();
    logger.finalOutput(text);
    process.exit(0);
  });
  agent.on('error', err => logger.error(err));

  try {
    await agent.init();
    await agent.run(task);
  } catch (err) {
    logger.error(`Fatal: ${err.message}`);
    await agent.shutdown();
    process.exit(1);
  }
}

main();