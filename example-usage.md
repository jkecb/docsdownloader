# Documentation Downloader - Usage Examples

## Quick Start

Install dependencies:
```bash
npm install
```

## Single Site Download

Download a specific documentation site:
```bash
npm run download -- --url https://docs.example.com --depth 3
```

## Bulk Download from env.md

Download all documentation sites from your env.md file:
```bash
npm run download -- bulk --file ../env.md --depth 2
```

## Key Features Demonstrated

1. **Smart Markdown Detection**: Automatically finds .md versions like `overview.md` instead of converting HTML
2. **Complete Site Crawling**: Discovers and downloads entire documentation sites
3. **Clean Organization**: Creates logical folder structures mirroring site hierarchy
4. **Metadata Tracking**: Each file includes source URL and download timestamp
5. **Incremental Updates**: Skips existing files unless `--force` is used
6. **Error Handling**: Continues downloading other sites even if one fails

## Sample Downloaded Content

Each markdown file includes metadata:
```markdown
---
source_url: https://example.com/overview.md
downloaded_at: 2025-07-29T06:14:25.116Z
---

# Docs example
```

Perfect for building your own documentation projects or training AI models!