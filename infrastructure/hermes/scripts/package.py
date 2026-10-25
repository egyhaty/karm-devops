#!/usr/bin/env python3
"""Create a source bundle, excluding runtime state and credentials."""
import argparse
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {'.git', '__pycache__', 'build', 'runtime', 'secrets', '.pytest_cache'}

def selected(path):
    parts = path.relative_to(ROOT).parts
    return (not any(p in EXCLUDE for p in parts)
            and not path.name.startswith('.env')
            and path.suffix not in {'.pyc', '.db', '.kubeconfig'}
            and path.name != 'auth.json')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if args.out.resolve().is_relative_to(ROOT):
        parser.error('output must be outside the project')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    paths = sorted(p for p in ROOT.rglob('*') if p.is_file() and selected(p))
    if any(p.is_symlink() for p in paths):
        parser.error('source bundle must not include symlinks')
    with tarfile.open(args.out, 'w:gz') as archive:
        for path in paths:
            archive.add(path, arcname=Path('hermes-assistant') / path.relative_to(ROOT), recursive=False)
    print(str(args.out.resolve()) + ': ' + str(len(paths)) + ' source files')

if __name__ == '__main__':
    main()
