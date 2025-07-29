#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { DocDownloader } from './downloader.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('docs-downloader')
  .description('Universal documentation downloader that converts docs sites to markdown')
  .version('1.0.0');

program
  .command('download')
  .description('Download documentation from a website')
  .requiredOption('-u, --url <url>', 'Documentation website URL to download')
  .option('-o, --output <dir>', 'Output directory', './downloads')
  .option('-d, --depth <number>', 'Maximum crawl depth', '3')
  .option('--force', 'Force re-download even if files exist')
  .option('--config <file>', 'Configuration file for site-specific settings')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 Starting documentation download...'));
      console.log(chalk.gray(`URL: ${options.url}`));
      console.log(chalk.gray(`Output: ${options.output}`));
      console.log(chalk.gray(`Max Depth: ${options.depth}`));
      
      const downloader = new DocDownloader({
        maxDepth: parseInt(options.depth),
        outputDir: options.output,
        force: options.force,
        configFile: options.config
      });
      
      await downloader.download(options.url);
      console.log(chalk.green('✅ Download completed successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('bulk')
  .description('Download multiple documentation sites from env.md')
  .option('-f, --file <file>', 'Environment file with URLs', '../env.md')
  .option('-o, --output <dir>', 'Output directory', './downloads')
  .option('-d, --depth <number>', 'Maximum crawl depth', '3')
  .option('--force', 'Force re-download even if files exist')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🚀 Starting bulk documentation download...'));
      
      const envContent = readFileSync(join(__dirname, options.file), 'utf-8');
      const urlMatches = envContent.match(/- Docs: \[.*?\]\((https?:\/\/[^\)]+)\)/g);
      
      if (!urlMatches) {
        console.log(chalk.yellow('⚠️ No documentation URLs found in env.md'));
        return;
      }
      
      const urls = urlMatches.map(match => {
        const urlMatch = match.match(/\((https?:\/\/[^\)]+)\)/);
        return urlMatch ? urlMatch[1] : null;
      }).filter(Boolean);
      
      console.log(chalk.gray(`Found ${urls.length} documentation sites to download`));
      
      const downloader = new DocDownloader({
        maxDepth: parseInt(options.depth),
        outputDir: options.output,
        force: options.force
      });
      
      for (const url of urls) {
        try {
          console.log(chalk.blue(`\n📄 Downloading: ${url}`));
          await downloader.download(url);
        } catch (error) {
          console.error(chalk.red(`❌ Failed to download ${url}:`), error.message);
        }
      }
      
      console.log(chalk.green('\n✅ Bulk download completed!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();