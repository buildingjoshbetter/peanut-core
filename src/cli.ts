#!/usr/bin/env ts-node

// Peanut-1 CLI for testing

import PeanutCore from './index';
import * as path from 'path';
import * as readline from 'readline';

const DB_PATH = path.join(__dirname, '..', 'data', 'peanut.db');

async function main() {
  const peanut = new PeanutCore({ dbPath: DB_PATH });

  console.log('🥜 Peanut-1 CLI');
  console.log('================');
  console.log('');

  await peanut.initialize();

  const stats = await peanut.getStats();
  console.log('Database stats:');
  console.log(`  Entities: ${stats.entityCount}`);
  console.log(`  Messages: ${stats.messageCount}`);
  console.log(`  Assertions: ${stats.assertionCount}`);
  console.log(`  Graph edges: ${stats.edgeCount}`);
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('peanut> ', async (input) => {
      const trimmed = input.trim();

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log('Goodbye!');
        await peanut.close();
        rl.close();
        return;
      }

      if (trimmed === 'help') {
        console.log('Commands:');
        console.log('  search <query>     - Search messages');
        console.log('  find <name>        - Find entities by name');
        console.log('  entity <id>        - Get entity details');
        console.log('  graph <id>         - Get entity graph');
        console.log('  style              - Get user style profile');
        console.log('  stats              - Show database stats');
        console.log('  exit               - Exit CLI');
        prompt();
        return;
      }

      if (trimmed === 'stats') {
        const stats = await peanut.getStats();
        console.log(`Entities: ${stats.entityCount}`);
        console.log(`Messages: ${stats.messageCount}`);
        console.log(`Assertions: ${stats.assertionCount}`);
        console.log(`Graph edges: ${stats.edgeCount}`);
        prompt();
        return;
      }

      if (trimmed === 'style') {
        const style = await peanut.getUserStyle();
        console.log('User style profile:');
        console.log(`  Formality: ${style.formality.toFixed(2)}`);
        console.log(`  Verbosity: ${style.verbosity.toFixed(2)}`);
        console.log(`  Emoji density: ${style.emojiDensity.toFixed(2)}`);
        console.log(`  Avg message length: ${style.avgMessageLength}`);
        console.log(`  Greetings: ${style.greetingPatterns.join(', ') || '(none)'}`);
        console.log(`  Sign-offs: ${style.signoffPatterns.join(', ') || '(none)'}`);
        prompt();
        return;
      }

      if (trimmed.startsWith('search ')) {
        const query = trimmed.substring(7);
        try {
          const results = await peanut.search(query, { limit: 5 });
          if (results.length === 0) {
            console.log('No results found.');
          } else {
            console.log(`Found ${results.length} results:`);
            for (const result of results) {
              console.log(`  [${result.type}] ${result.id} (score: ${result.score.toFixed(3)})`);
            }
          }
        } catch (error) {
          console.log('Search error:', (error as Error).message);
        }
        prompt();
        return;
      }

      if (trimmed.startsWith('find ')) {
        const query = trimmed.substring(5);
        const entities = await peanut.findEntities(query);
        if (entities.length === 0) {
          console.log('No entities found.');
        } else {
          console.log(`Found ${entities.length} entities:`);
          for (const entity of entities) {
            console.log(`  [${entity.entityType}] ${entity.canonicalName} (${entity.id})`);
          }
        }
        prompt();
        return;
      }

      if (trimmed.startsWith('entity ')) {
        const id = trimmed.substring(7);
        const entity = await peanut.getEntity(id);
        if (!entity) {
          console.log('Entity not found.');
        } else {
          console.log(`Entity: ${entity.canonicalName}`);
          console.log(`  Type: ${entity.entityType}`);
          console.log(`  ID: ${entity.id}`);
          console.log(`  Attributes:`);
          for (const attr of entity.attributes) {
            console.log(`    ${attr.attributeType}: ${attr.attributeValue}`);
          }
        }
        prompt();
        return;
      }

      if (trimmed.startsWith('graph ')) {
        const id = trimmed.substring(6);
        const graph = await peanut.getEntityGraph(id);
        if (!graph) {
          console.log('Entity not found.');
        } else {
          console.log(`Graph for: ${graph.entity.canonicalName}`);
          console.log(`  Connections: ${graph.edges.length}`);
          for (const { edge, connectedEntity } of graph.edges) {
            console.log(`    --[${edge.edgeType}]--> ${connectedEntity.canonicalName}`);
          }
        }
        prompt();
        return;
      }

      if (trimmed) {
        console.log('Unknown command. Type "help" for available commands.');
      }

      prompt();
    });
  };

  console.log('Type "help" for available commands.');
  console.log('');
  prompt();
}

main().catch(console.error);
