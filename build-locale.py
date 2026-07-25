#!/usr/bin/env python3
"""build-locale.py — extract _("strings") from JS source, compile .mo files.

Usage:
    python3 build-locale.py extract    # regenerate po/appmenu.pot
    python3 build-locale.py compile    # compile all .po → locale/*/LC_MESSAGES/*.mo
    python3 build-locale.py all        # extract + compile
"""
import os, re, struct, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC_GLOB = '*.js'
SKIP_DIRS = {'.git', 'dist', 'Downloads', 'locale', 'po', '__pycache__', 'node_modules'}


def find_js_files():
    files = []
    for root, dirs, fnames in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in fnames:
            if fn.endswith('.js'):
                files.append(os.path.join(root, fn))
    return sorted(files)


def extract():
    """Extract _("...") strings and write po/appmenu.pot."""
    strings = set()
    for path in find_js_files():
        with open(path, 'r') as f:
            content = f.read()
        for m in re.finditer(r'\b_\("((?:[^"\\]|\\.)*?)(?<!\\)"\)', content):
            s = m.group(1)
            s = s.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t').replace('\\\\', '\\')
            if s.strip():
                strings.add(s)

    pot_path = os.path.join(ROOT, 'po', 'appmenu.pot')
    os.makedirs(os.path.dirname(pot_path), exist_ok=True)

    with open(pot_path, 'w') as f:
        f.write('# AppMenu translation template.\n')
        f.write('#\n')
        f.write('msgid ""\nmsgstr ""\n')
        f.write('"Project-Id-Version: AppMenu\\\\n"\n')
        f.write('"POT-Creation-Date: 2026-07-25 06:58+0000\\\\n"\n')
        f.write('"PO-Revision-Date: AUTO\\\\n"\n')
        f.write('"Last-Translator: AUTO\\\\n"\n')
        f.write('"Language-Team: none\\\\n"\n')
        f.write('"MIME-Version: 1.0\\\\n"\n')
        f.write('"Content-Type: text/plain; charset=UTF-8\\\\n"\n')
        f.write('"Content-Transfer-Encoding: 8bit\\\\n"\n')
        f.write('\n')
        for s in sorted(strings):
            esc = s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\t', '\\t')
            f.write(f'msgid "{esc}"\n')
            f.write('msgstr ""\n')
            f.write('\n')

    print(f'Extracted {len(strings)} unique strings into po/appmenu.pot')


def compile_mo(po_path):
    """Compile a single .po file to .mo. Returns number of entries."""
    with open(po_path, 'r') as f:
        data = f.read()

    entries = []
    for m in re.finditer(r'msgid "((?:[^"\\]|\\.)*)"\s*\nmsgstr "((?:[^"\\]|\\.)*)"', data):
        mid = m.group(1)
        mstr = m.group(2)
        if not mid:
            continue
        mid = (mid.replace('\\"', '"').replace('\\n', '\n')
                   .replace('\\t', '\t').replace('\\\\', '\\'))
        mstr = (mstr.replace('\\"', '"').replace('\\n', '\n')
                     .replace('\\t', '\t').replace('\\\\', '\\'))
        entries.append((mid, mstr))

    entries.sort(key=lambda x: x[0])
    n = len(entries)

    # Binary .mo layout (big-endian)
    o_offset = 28
    o_size = n * 8
    t_offset = o_offset + o_size
    t_size = n * 8
    data_off = t_offset + t_size

    o_entries = []; t_entries = []; orig = []; trans = []
    for mid, mstr in entries:
        ob = mid.encode('utf-8') + b'\x00'
        tb = mstr.encode('utf-8') + b'\x00'
        o_entries.append((len(mid), data_off)); orig.append(ob); data_off += len(ob)
        t_entries.append((len(mstr), data_off)); trans.append(tb); data_off += len(tb)

    mo_dir = os.path.join(ROOT, 'locale', os.path.splitext(os.path.basename(po_path))[0], 'LC_MESSAGES')
    os.makedirs(mo_dir, exist_ok=True)
    mo_path = os.path.join(mo_dir, 'appmenu.mo')

    with open(mo_path, 'wb') as f:
        f.write(struct.pack('>I', 0x950412de))  # magic
        f.write(struct.pack('>I', 0))            # revision
        f.write(struct.pack('>I', n))            # num entries
        f.write(struct.pack('>I', o_offset))
        f.write(struct.pack('>I', t_offset))
        f.write(struct.pack('>I', 0))            # hash size
        f.write(struct.pack('>I', 0))            # hash offset
        for length, offset in o_entries:
            f.write(struct.pack('>I', length))
            f.write(struct.pack('>I', offset))
        for length, offset in t_entries:
            f.write(struct.pack('>I', length))
            f.write(struct.pack('>I', offset))
        for s in orig:
            f.write(s)
        for s in trans:
            f.write(s)

    return n


def compile_all():
    """Compile all .po files under po/."""
    po_dir = os.path.join(ROOT, 'po')
    if not os.path.isdir(po_dir):
        print('No po/ directory — nothing to compile.')
        return

    total = 0
    for entry in os.listdir(po_dir):
        fpath = os.path.join(po_dir, entry)
        if os.path.isfile(fpath) and fpath.endswith('.po'):
            n = compile_mo(fpath)
            rel = os.path.relpath(fpath, ROOT)
            lc = os.path.splitext(entry)[0]
            print(f'  locale/{lc}/LC_MESSAGES/appmenu.mo  ({n} strings)')
            total += n

    print(f'\nCompiled {total} total message(s).')


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if cmd in ('extract', 'all'):
        extract()
    if cmd in ('compile', 'all'):
        compile_all()
    if cmd not in ('extract', 'compile', 'all'):
        print(f'Unknown command: {cmd}')
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
