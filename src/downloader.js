import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import fs from 'fs-extra';
import path from 'path';
import { URL } from 'url';
import chalk from 'chalk';

export class DocDownloader {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 3;
    this.outputDir = options.outputDir || './downloads';
    this.force = options.force || false;
    this.configFile = options.configFile;
    this.includeMetadata = options.includeMetadata || false;
    this.visited = new Set();
    this.queue = [];
    this.siteConfig = {};
    
    // Initialize Turndown service for HTML to Markdown conversion
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
    
    // Custom rules for better markdown conversion
    this.turndown.addRule('codeBlock', {
      filter: ['pre'],
      replacement: function (content, node) {
        const codeElement = node.querySelector('code');
        if (codeElement) {
          const lang = codeElement.className.match(/language-(\w+)/);
          const language = lang ? lang[1] : '';
          return '\n```' + language + '\n' + codeElement.textContent + '\n```\n';
        }
        return '\n```\n' + content + '\n```\n';
      }
    });
    
    // Load site-specific configuration if provided
    if (this.configFile) {
      this.loadConfig();
    }
  }
  
  loadConfig() {
    try {
      const configData = fs.readFileSync(this.configFile, 'utf-8');
      this.siteConfig = JSON.parse(configData);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not load config file: ${error.message}`));
    }
  }
  
  async download(startUrl) {
    const baseUrl = new URL(startUrl);
    const siteName = this.getSiteName(baseUrl.hostname);
    const siteDir = path.join(this.outputDir, siteName);
    
    await fs.ensureDir(siteDir);
    
    // Reset state for new download
    this.visited.clear();
    this.queue = [{url: startUrl, depth: 0}];
    
    console.log(chalk.blue(`📁 Output directory: ${siteDir}`));
    
    while (this.queue.length > 0) {
      const {url, depth} = this.queue.shift();
      
      if (this.visited.has(url) || depth > this.maxDepth) {
        continue;
      }
      
      try {
        await this.processPage(url, depth, baseUrl, siteDir);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to process ${url}: ${error.message}`));
      }
    }
  }
  
  async processPage(url, depth, baseUrl, siteDir) {
    this.visited.add(url);
    
    console.log(chalk.gray(`${'  '.repeat(depth)}📄 Processing: ${url} (depth: ${depth})`));
    
    // Add delay between requests to be respectful
    await this.delay(500);
    
    // Always fetch HTML to find navigation links
    const response = await this.fetchPage(url);
    if (!response) return;
    
    const $ = cheerio.load(response.data);
    
    // Find and queue new links first (before checking for markdown)
    if (depth < this.maxDepth) {
      this.findAndQueueLinks($, url, baseUrl, depth);
    }
    
    const hostname = baseUrl.hostname;
    const config = this.siteConfig[hostname] || {};
    
    // Check if markdown version exists
    const mdUrl = await this.checkForMarkdownVersion(url);
    if (mdUrl) {
      console.log(chalk.green(`${'  '.repeat(depth)}📝 Found markdown version: ${mdUrl}`));
      await this.downloadMarkdown(mdUrl, url, siteDir);
      return;
    }
    
    // If preferMarkdown is set and no markdown found, skip conversion
    if (config.preferMarkdown) {
      console.log(chalk.yellow(`${'  '.repeat(depth)}⚠️ No markdown version found, skipping HTML conversion (preferMarkdown: true)`));
      return;
    }
    
    // Convert HTML to markdown as fallback
    console.log(chalk.yellow(`${'  '.repeat(depth)}🔄 Converting HTML to markdown`));
    const content = this.extractContent($, url);
    const markdown = this.turndown.turndown(content);
    
    // Save markdown file
    const filePath = this.getFilePath(url, baseUrl, siteDir);
    await this.saveMarkdown(markdown, filePath, url);
  }
  
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async checkForMarkdownVersion(url) {
    // Try the most likely .md version first
    const baseUrl = url.replace(/\/$/, '');
    const urlObj = new URL(url);
    
    const possibleMdUrls = [
      baseUrl + '.md',
      baseUrl + '/index.md',
      baseUrl + '/README.md',
      baseUrl + '/content.md',
      url.replace(/\.html?$/, '.md'),
      url + '.md',
      url + '/index.md',
      // For GitHub-style raw content
      url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/'),
      // For GitLab raw content
      url.replace(/\/blob\//, '/raw/'),
      // Try with common documentation paths
      baseUrl.replace(/\/docs?\//, '/docs/') + '.md',
      baseUrl.replace(/\/guide?\//, '/guide/') + '.md'
    ];
    
    for (const mdUrl of possibleMdUrls) {
      try {
        // Try HEAD request first for efficiency
        let response;
        try {
          response = await axios.head(mdUrl, {
            timeout: 8000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            maxRedirects: 5
          });
        } catch (headError) {
          // If HEAD fails, try GET with small range to check if file exists
          response = await axios.get(mdUrl, {
            timeout: 8000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Range': 'bytes=0-1023' // Only get first 1KB to check content
            },
            maxRedirects: 5
          });
        }
        
        if (response.status === 200 || response.status === 206) {
          const contentType = response.headers['content-type']?.toLowerCase() || '';
          
          // If we have actual content from GET request, check if it looks like markdown
          if (response.data) {
            const content = response.data.toString().trim();
            const isMarkdown = this.isLikelyMarkdown(content);
            const isHtml = content.startsWith('<!DOCTYPE html') || 
                          content.startsWith('<html') || 
                          contentType.includes('text/html');
            
            if (isMarkdown && !isHtml) {
              return mdUrl;
            }
          } else {
            // For HEAD requests, use more relaxed content-type checking
            const isLikelyMarkdown = contentType.includes('text/plain') || 
                                   contentType.includes('markdown') ||
                                   contentType.includes('text/markdown') ||
                                   contentType.includes('application/octet-stream') ||
                                   contentType === '' || // Some servers don't set content-type
                                   mdUrl.endsWith('.md');
            
            const isHtml = contentType.includes('text/html');
            
            if (isLikelyMarkdown && !isHtml) {
              return mdUrl;
            }
          }
        }
      } catch (error) {
        // Continue checking other possibilities
      }
    }
    
    return null;
  }
  
  isLikelyMarkdown(content) {
    if (!content || content.length < 10) return false;
    
    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s+/, // Headers
      /^\*\s+/, // Bullet lists
      /^\d+\.\s+/, // Numbered lists
      /\[.*?\]\(.*?\)/, // Links
      /`[^`]+`/, // Inline code
      /```/, // Code blocks
      /^\>\s+/, // Blockquotes
      /\*\*.*?\*\*/, // Bold
      /\*.*?\*/, // Italic
      /^---$|^===$/m, // Horizontal rules
      /^\|.*\|/m // Tables
    ];
    
    // Check if content has markdown-like patterns and isn't HTML
    const hasMarkdownPatterns = markdownPatterns.some(pattern => pattern.test(content));
    const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(content);
    
    return hasMarkdownPatterns || (!hasHtmlTags && content.includes('\n') && content.length > 50);
  }
  
  async downloadMarkdown(mdUrl, originalUrl, siteDir) {
    try {
      const response = await axios.get(mdUrl, {timeout: 15000});
      const contentType = response.headers['content-type']?.toLowerCase() || '';
      
      // Check if the response is actually HTML disguised as markdown
      const content = response.data;
      const isActuallyHtml = content.trim().startsWith('<!DOCTYPE html') || 
                           content.trim().startsWith('<html') ||
                           contentType.includes('text/html');
      
      if (isActuallyHtml) {
        console.log(chalk.yellow(`⚠️ URL ${mdUrl} returned HTML, converting to markdown`));
        // Parse HTML and convert to markdown
        const $ = cheerio.load(content);
        const extractedContent = this.extractContent($, originalUrl);
        const markdown = this.turndown.turndown(extractedContent);
        const filePath = this.getFilePath(originalUrl, new URL(originalUrl), siteDir);
        await this.saveMarkdown(markdown, filePath, originalUrl);
        return;
      }
      
      // It's actual markdown content
      const filePath = this.getFilePath(originalUrl, new URL(originalUrl), siteDir);
      await this.saveMarkdown(content, filePath, mdUrl);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to download markdown from ${mdUrl}: ${error.message}`));
    }
  }
  
  async fetchPage(url) {
    const maxRetries = 3;
    const retryDelay = 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get(url, {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
          },
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 400; // Accept redirects
          }
        });
        return response;
      } catch (error) {
        if (attempt === maxRetries) {
          console.warn(chalk.yellow(`⚠️ Failed to fetch ${url} after ${maxRetries} attempts: ${error.message}`));
          return null;
        }
        
        console.warn(chalk.yellow(`⚠️ Attempt ${attempt} failed for ${url}: ${error.message}. Retrying...`));
        await this.delay(retryDelay * attempt);
      }
    }
    return null;
  }
  
  extractContent($, url) {
    const hostname = new URL(url).hostname;
    const config = this.siteConfig[hostname] || {};
    
    // If config specifies to prefer markdown, skip HTML conversion entirely
    if (config.preferMarkdown) {
      return '';
    }
    
    // Remove unwanted elements first
    $('script, style, nav, footer, .sidebar, .navigation, .menu, .navbar, .header, .topbar, .search, .breadcrumb, .table-of-contents, .toc, .banner').remove();
    $('#navbar, #sidebar, #footer, #header, #navigation, #menu, #search-bar, #assistant-entry').remove();
    
    // Try site-specific content selectors
    if (config.contentSelector) {
      const content = $(config.contentSelector).html();
      if (content && content.trim().length > 100) {
        return this.cleanContent(content);
      }
    }
    
    // For Mintlify docs (like Dune), try specific selectors
    if (hostname.includes('mintlify') || url.includes('docs.')) {
      const mintlifySelectors = [
        '.prose, .mdx-prose',
        '[data-content="true"]',
        '.docs-content',
        '.main-content'
      ];
      
      for (const selector of mintlifySelectors) {
        const content = $(selector).html();
        if (content && content.trim().length > 100) {
          return this.cleanContent(content);
        }
      }
    }
    
    // For The Graph Nextra docs
    if (hostname.includes('thegraph.com')) {
      const nextraSelectors = [
        'main article',
        '.nextra-content',
        '.nextra-body-full',
        '[data-nextra-content]',
        'main .container',
        'main'
      ];
      
      for (const selector of nextraSelectors) {
        const content = $(selector).html();
        if (content && content.trim().length > 100) {
          return this.cleanContent(content);
        }
      }
    }
    
    // Common content selectors
    const selectors = [
      'main',
      '.content',
      '.documentation',
      '.docs-content',
      '.markdown-body',
      'article',
      '#content',
      '.main-content',
      '[role="main"]',
      '.prose'
    ];
    
    for (const selector of selectors) {
      const content = $(selector).html();
      if (content && content.trim().length > 100) {
        return this.cleanContent(content);
      }
    }
    
    // Last resort: try to find the largest text block
    const textBlocks = $('div, section, article').filter((_, el) => {
      const text = $(el).text().trim();
      return text.length > 200 && !$(el).find('nav, footer, sidebar').length;
    });
    
    if (textBlocks.length > 0) {
      const largest = textBlocks.get().reduce((prev, current) => 
        $(current).text().length > $(prev).text().length ? current : prev
      );
      return this.cleanContent($(largest).html() || '');
    }
    
    return this.cleanContent($('body').html() || '');
  }
  
  cleanContent(html) {
    // Remove common unwanted patterns
    return html
      .replace(/\(self\.__next_s.*?\}\]\)/gs, '') // Remove Next.js hydration scripts
      .replace(/\(\(.*?\)\)\(.*?\)/gs, '') // Remove IIFE functions
      .replace(/<script[^>]*>.*?<\/script>/gs, '') // Remove any remaining scripts
      .replace(/<style[^>]*>.*?<\/style>/gs, '') // Remove any remaining styles
      .replace(/--[\w-]+:\s*[^;]+;/g, '') // Remove CSS custom properties
      .replace(/data-[\w-]+="[^"]*"/g, '') // Remove data attributes
      .replace(/class="[^"]*"/g, '') // Remove class attributes for cleaner conversion
      .replace(/style="[^"]*"/g, '') // Remove inline styles
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  findAndQueueLinks($, currentUrl, baseUrl, currentDepth) {
    const links = new Set();
    
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      
      try {
        const linkUrl = new URL(href, currentUrl);
        
        // Only process links from the same domain
        if (linkUrl.hostname !== baseUrl.hostname) return;
        
        // Skip non-documentation links
        if (this.shouldSkipUrl(linkUrl.href)) return;
        
        links.add(linkUrl.href);
      } catch (error) {
        // Invalid URL, skip
      }
    });
    
    // Add unique links to queue
    for (const link of links) {
      if (!this.visited.has(link)) {
        this.queue.push({url: link, depth: currentDepth + 1});
      }
    }
  }
  
  shouldSkipUrl(url) {
    const skipPatterns = [
      /\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js)$/i,
      /#/,
      /\/api\//,
      /\/login/,
      /\/register/,
      /\/admin/,
      /\/search/,
      /mailto:/,
      /tel:/
    ];
    
    return skipPatterns.some(pattern => pattern.test(url));
  }
  
  getFilePath(url, baseUrl, siteDir) {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Clean up pathname
    if (pathname === '/' || pathname === '') {
      pathname = '/index';
    }
    
    // Remove trailing slash
    pathname = pathname.replace(/\/$/, '');
    
    // Ensure .md extension
    if (!pathname.endsWith('.md')) {
      pathname += '.md';
    }
    
    // Create safe file path
    const safePath = pathname.replace(/^\//, '').replace(/[<>:\"|?*]/g, '_');
    return path.join(siteDir, safePath);
  }
  
  async saveMarkdown(markdown, filePath, sourceUrl) {
    // Skip if file exists and not forcing re-download
    if (!this.force && await fs.pathExists(filePath)) {
      console.log(chalk.gray(`⏭️ Skipping existing file: ${path.basename(filePath)}`));
      return;
    }
    
    // Conditionally add metadata header
    let content = markdown;
    if (this.includeMetadata) {
      const header = `---\nsource_url: ${sourceUrl}\ndownloaded_at: ${new Date().toISOString()}\n---\n\n`;
      content = header + markdown;
    }
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(filePath));
    
    // Save file
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(chalk.green(`✅ Saved: ${path.basename(filePath)}`));
  }
  
  getSiteName(hostname) {
    return hostname.replace(/^www\./, '').replace(/\./g, '_');
  }
}