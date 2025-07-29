# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Development**:
```bash
npm install                    # Install dependencies
npm start                      # Run the CLI (same as npm run download)
```

**Basic Usage**:
```bash
# Single site download
node src/index.js download -u https://docs.example.com --config config.json

# Bulk download from env.md
node src/index.js bulk --file ../env.md

# With options
node src/index.js download -u https://docs.example.com --depth 2 --metadata --force
```

**Testing Downloads**:
```bash
# Test with depth 0 for single page
node src/index.js download -u <url> --depth 0

# Test with depth 1 for shallow crawl
node src/index.js download -u <url> --depth 1 --config config.json
```

## Architecture

This is a **universal documentation downloader** that crawls documentation websites and converts them to organized markdown files.

### Core Components

**CLI Layer** (`src/index.js`):
- Uses Commander.js for argument parsing
- Two main commands: `download` (single site) and `bulk` (multiple sites)
- Passes options to DocDownloader class

**DocDownloader Class** (`src/downloader.js`):
- **Queue-based crawler**: Uses breadth-first search with `visited` Set and `queue` Array
- **Smart markdown detection**: Tries to find native `.md` files before HTML conversion
- **Content extraction**: Site-specific CSS selectors with generic fallbacks
- **HTML-to-Markdown**: Uses TurndownService with custom code block rules

### Processing Flow

1. **URL Discovery**: Starts from base URL, queues internal links up to maxDepth
2. **Content Acquisition**: 
   - First attempts to find native `.md` versions (checks `.md`, `/index.md`, etc.)
   - Falls back to HTML fetching if no markdown found
3. **Content Extraction**: 
   - Uses site-specific selectors from config file
   - Built-in support for Mintlify, Nextra/The Graph, and generic documentation sites
   - Removes navigation, scripts, styles, and other non-content elements
4. **Markdown Conversion**: 
   - Direct save if native markdown found
   - HTML-to-markdown conversion using TurndownService for HTML content
5. **File Organization**: Mirrors site structure in `downloads/{site_name}/` directories

### Configuration System

**Site-specific config** (`config.json`):
```javascript
{
  "hostname.com": {
    "contentSelector": "main, .content, article",  // CSS selectors for content
    "skipPatterns": ["/api/", "/blog"],           // URL patterns to skip
    "maxDepth": 3                                 // Override global depth
  }
}
```

**Key architectural decisions**:
- **Universal approach**: No site-specific hardcoding; uses configurable selectors
- **Respectful crawling**: 500ms delays, realistic browser headers, retry logic
- **Smart content detection**: Detects fake `.md` URLs that return HTML
- **Clean output**: No metadata headers by default (optional with `--metadata`)

### Key Dependencies

- **axios**: HTTP client with retry logic and proper headers
- **cheerio**: Server-side HTML parsing and manipulation
- **turndown**: HTML-to-Markdown conversion with custom rules
- **commander**: CLI argument parsing
- **fs-extra**: Enhanced file system operations

## Working with the Codebase

**Adding new site support**: Add configuration to `config.json` with appropriate `contentSelector` for the site's documentation structure.

**Debugging content extraction**: The `extractContent()` method in `downloader.js` tries selectors in order - site-specific first, then generic fallbacks.

**Modifying markdown output**: The `turndown` instance in the constructor has custom rules for code blocks. Additional rules can be added there.

**Understanding the crawling**: The `processPage()` method handles both link discovery (for depth < maxDepth) and content extraction. Links are queued before content processing.