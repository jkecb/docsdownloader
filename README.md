# Documentation Downloader

A universal documentation downloader that crawls documentation websites and converts them to organized markdown files.

## Features

- 🕷️ **Web Crawling**: Automatically discovers and downloads entire documentation sites
- 📝 **Markdown Conversion**: Converts HTML pages to clean markdown format
- 📁 **Smart Organization**: Organizes files in logical folder structures
- 🔄 **Markdown Detection**: Prioritizes existing markdown files over HTML conversion
- ⚙️ **Configurable**: Site-specific configuration for optimal content extraction
- 🚀 **Bulk Downloads**: Download multiple documentation sites at once
- 💾 **Incremental Updates**: Skip existing files unless forced to re-download

## Installation

```bash
npm install
```

## Usage

### Single Site Download

```bash
npm run download -- --url https://docs.example.com --output ./downloads --depth 3
```

### Bulk Download from env.md

Download all documentation sites listed in your env.md file:

```bash
npm run download -- bulk --file ../env.md --output ./downloads --depth 3
```

### Command Line Options

#### Single Download
- `-u, --url <url>`: Documentation website URL to download (required)
- `-o, --output <dir>`: Output directory (default: ./downloads)
- `-d, --depth <number>`: Maximum crawl depth (default: 3)
- `--force`: Force re-download even if files exist
- `--config <file>`: Configuration file for site-specific settings
- `--metadata`: Include metadata header with source URL and download time

#### Bulk Download
- `-f, --file <file>`: Environment file with URLs (default: ../env.md)
- `-o, --output <dir>`: Output directory (default: ./downloads)
- `-d, --depth <number>`: Maximum crawl depth (default: 3)
- `--force`: Force re-download even if files exist
- `--metadata`: Include metadata header with source URL and download time

## Configuration

Create a `config.json` file to customize behavior for specific documentation sites:

```json
{
  "docs.example.com": {
    "contentSelector": ".markdown-body, .content, main",
    "skipPatterns": ["/api/", "/changelog"],
    "maxDepth": 4
  }
}
```

### Configuration Options

- `contentSelector`: CSS selectors to extract main content
- `skipPatterns`: URL patterns to skip during crawling
- `maxDepth`: Maximum crawl depth for this specific site

## Output Structure

Downloaded documentation is organized by site:

```
downloads/
├── docs_sim_dune_com/
│   ├── index.md
│   ├── quickstart.md
│   └── api/
│       └── reference.md
├── www_alchemy_com/
│   ├── index.md
│   └── docs/
│       └── reference/
│           └── data-overview.md
└── ...
```

By default, files contain only the markdown content. With the `--metadata` option, each file includes metadata:

```markdown
---
source_url: https://docs.example.com/page
downloaded_at: 2024-01-15T10:30:00.000Z
---

# Page Content
...
```

## Supported Sites

The downloader works with most documentation sites. Pre-configured for common API documentation formats including:

- Static site generators (GitBook, Docusaurus, VitePress)
- API documentation platforms 
- Developer documentation sites
- Knowledge bases and wikis

## How It Works

1. **URL Discovery**: Starts from a base URL and crawls internal links
2. **Content Extraction**: Uses CSS selectors to extract main content
3. **Markdown Detection**: Checks for existing markdown versions first
4. **HTML Conversion**: Converts HTML to markdown using Turndown
5. **File Organization**: Saves files in organized directory structure
6. **Clean Output**: Saves clean markdown files (metadata optional with --metadata flag)

## Limitations

- Respects robots.txt and rate limiting
- Only downloads from the same domain as the starting URL
- Maximum crawl depth prevents infinite loops
- Some dynamic content may not be captured

## Contributing

Feel free to submit issues and enhancement requests!
