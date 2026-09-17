#!/usr/bin/env python3
"""Build the offline entry point from the maintained web sources."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'

def build():
    html = (WEB / 'index.html').read_text()
    def css(match):
        return '<style>\n' + (WEB / match[1]).read_text() + '\n</style>'
    def js(match):
        source = (WEB / match[1]).read_text().replace('</script', '<\\/script')
        return '<script>\n' + source + '\n</script>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>', js, html)
    return html

if __name__ == '__main__':
    (ROOT / 'index.html').write_text(build())
    print('Built index.html: standalone, no external assets.')
