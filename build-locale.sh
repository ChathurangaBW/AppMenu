#!/bin/bash
# build-locale.sh — extract translatable strings and compile .mo files
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Extracting strings into po/appmenu.pot"
python3 -c '
import re, os
strings = set()
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in {".git","dist","Downloads","locale","po"}]
    for f in files:
        if f.endswith(".js"):
            with open(os.path.join(root,f)) as fh:
                content = fh.read()
            for m in re.finditer(r"\b_\(\"((?:[^\"\\\\]|\\\\.)*)(?<!\\\\)\"\)", content):
                s = m.group(1).replace("\\\\\"","\"").replace("\\\\n","\n").replace("\\\\t","\t")
                if s.strip():
                    strings.add(s)

lines = [r"# AppMenu translation template.","#","msgid \"\"","msgstr \"\"",
    r"\"Project-Id-Version: AppMenu\\\\n\"",
    r"\"POT-Creation-Date: 2026-07-25 06:58+0000\\\\n\"",
    r"\"PO-Revision-Date: AUTO\\\\n\"",
    r"\"Last-Translator: AUTO\\\\n\"",
    r"\"Language-Team: none\\\\n\"",
    r"\"MIME-Version: 1.0\\\\n\"",
    r"\"Content-Type: text/plain; charset=UTF-8\\\\n\"",
    r"\"Content-Transfer-Encoding: 8bit\\\\n\"",""]
for s in sorted(strings):
    esc = s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\t","\\t")
    lines.append(f"msgid \"{esc}\"")
    lines.append("msgstr \"\"")
    lines.append("")

os.makedirs("po",exist_ok=True)
with open("po/appmenu.pot","w") as f: f.write("\n".join(lines))
print(f"  {len(strings)} strings in po/appmenu.pot")
'

echo "==> Compiling .mo files"
python3 -c '
import struct, re, os

def po_to_mo(po_path,mo_path):
    with open(po_path) as f: data=f.read()
    entries=[]
    for m in re.finditer(r"msgid \"((?:[^\"\\\\]|\\\\.)*)\"\s*\nmsgstr \"((?:[^\"\\\\]|\\\\.)*)\"", data):
        mid=m.group(1); mstr=m.group(2)
        if not mid: continue
        mid=mid.replace("\\\\\"","\"").replace("\\\\n","\n").replace("\\\\t","\t").replace("\\\\\\\\","\\\\")
        mstr=mstr.replace("\\\\\"","\"").replace("\\\\n","\n").replace("\\\\t","\t").replace("\\\\\\\\","\\\\")
        entries.append((mid,mstr))
    entries.sort(key=lambda x:x[0])
    n=len(entries)
    o_offset=28; o_size=n*8; t_offset=o_offset+o_size; t_size=n*8
    data_off=t_offset+t_size
    o_entries=[]; t_entries=[]; orig=[]; trans=[]
    for mid,mstr in entries:
        ob=mid.encode("utf-8")+b"\x00"; tb=mstr.encode("utf-8")+b"\x00"
        o_entries.append((len(mid),data_off)); orig.append(ob); data_off+=len(ob)
        t_entries.append((len(mstr),data_off)); trans.append(tb); data_off+=len(tb)
    os.makedirs(os.path.dirname(mo_path),exist_ok=True)
    with open(mo_path,"wb") as f:
        f.write(struct.pack(">I",0x950412de)); f.write(struct.pack(">I",0))
        f.write(struct.pack(">I",n)); f.write(struct.pack(">I",o_offset))
        f.write(struct.pack(">I",t_offset)); f.write(struct.pack(">I",0)); f.write(struct.pack(">I",0))
        for l,off in o_entries: f.write(struct.pack(">I",l)); f.write(struct.pack(">I",off))
        for l,off in t_entries: f.write(struct.pack(">I",l)); f.write(struct.pack(">I",off))
        for s in orig: f.write(s)
        for s in trans: f.write(s)
    return n

for lang_dir in os.listdir("po") if os.path.exists("po") else []:
    pof=os.path.join("po",lang_dir)
    if os.path.isdir(pof):
        for f in os.listdir(pof):
            if f.endswith(".po"):
                lc=f[:-3]
                n=po_to_mo(os.path.join(pof,f),f"locale/{lc}/LC_MESSAGES/appmenu.mo")
                print(f"  locale/{lc}/LC_MESSAGES/appmenu.mo ({n} strings)")
'

# Also compile en.po if it exists (reference)
if [ -f po/appmenu.pot ]; then
    python3 -c "
import os
from pathlib import Path
exec(open('build-locale.sh').read().split(\"python3 -c '\")[1].split(\"'\")[0])
# Just run the mo compiler part
"
fi

echo "==> Done"