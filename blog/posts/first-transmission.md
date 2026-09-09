---
title: First transmission
date: 2026-09-09
tags: meta
draft: false
---

The log is online. This post exists so the index has something to render before you write anything real. Delete it whenever.

## What this thing is

A blog that lives entirely in the repo. No database, no build step, no server. Every post is a markdown file in `posts/`, and `posts/index.json` is the manifest the index page reads.

When you authenticate with a GitHub token, the editor writes both of those through the GitHub API and commits them straight to the branch.

## Markdown that works here

Headings from `#` through `####`, **bold**, *italic*, `inline code`, and [links](https://example.com).

- Unordered lists
- Like this one

1. Ordered lists
2. Also fine

> Blockquotes get a green left rule.

```
Fenced code blocks render in a bordered panel.
No syntax highlighting — just monospace.
```

---

Horizontal rules work. So do images, with the usual `![alt](url)` syntax — drop files in a folder and reference them relatively.

## The one thing to remember

The manifest and the post file are two separate commits. If a publish fails halfway, you may end up with a post file that isn't listed, or a listing pointing at a file that isn't there. Republishing the same post fixes either case.
