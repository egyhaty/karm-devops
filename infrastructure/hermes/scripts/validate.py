#!/usr/bin/env python3
"""Offline structural checks; not a substitute for live Hermes tests."""
import ast
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

def validate():
    expected = {'karem-jobs', 'karem-study', 'karem-personal', 'karem-tickets', 'karem-infra', 'karem-codex'}
    found = set()
    for path in (ROOT / 'skills').glob('*/SKILL.md'):
        content = path.read_text()
        if not content.startswith('---\n'):
            raise ValueError(str(path) + ': frontmatter missing')
        header = content.split('---\n', 2)[1]
        name = re.search(r'^name: ([a-z0-9-]+)$', header, re.M)
        description = re.search(r'^description: (.+)$', header, re.M)
        if not name or name[1] != path.parent.name or not description:
            raise ValueError(str(path) + ': invalid name or description')
        if not isinstance(json.loads(description[1]), str):
            raise ValueError('description must be text')
        if '[TODO' in content or len(content.splitlines()) > 500:
            raise ValueError(str(path) + ': incomplete or oversized skill')
        found.add(name[1])
    if found != expected:
        raise ValueError('unexpected skill set: ' + str(found))
    for path in ROOT.rglob('*.py'):
        ast.parse(path.read_text(), filename=str(path))
    for path in ROOT.rglob('*.json'):
        if 'build' not in path.relative_to(ROOT).parts:
            json.loads(path.read_text())
    for file in ['README.md', 'docs/OPERATIONS.md', 'docs/REPOSITORIES.md', 'upstream.lock.json']:
        if not (ROOT / file).is_file():
            raise ValueError('required file absent: ' + file)
    print('PASS: six skill definitions, Python syntax, JSON and required project files')
    print('NOT TESTED: container build/startup, real provider, Telegram, Codex sandbox, cluster/PVC restore')

if __name__ == '__main__':
    try:
        validate()
    except (ValueError, OSError, SyntaxError) as error:
        sys.exit(str(error))
