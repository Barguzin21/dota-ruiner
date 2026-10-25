"""Минимальный читатель VPK v2 (архивы Source 2). python vpk.py <pak01_dir.vpk> <path-substring> <out_dir>"""
import os, struct, sys


def read_cstr(f):
    b = bytearray()
    while (c := f.read(1)) not in (b'\x00', b''):
        b += c
    return b.decode('utf8', 'replace')


def index(dir_path):
    entries = {}
    with open(dir_path, 'rb') as f:
        sig, ver, tree_size = struct.unpack('<III', f.read(12))
        assert sig == 0x55AA1234, 'not a vpk'
        header = 12 + (16 if ver == 2 else 0)
        f.seek(header)
        while ext := read_cstr(f):
            while path := read_cstr(f):
                while name := read_cstr(f):
                    _crc, pre, arc, off, ln, _term = struct.unpack('<IHHIIH', f.read(18))
                    preload = f.read(pre)
                    full = f'{name}.{ext}' if path == ' ' else f'{path}/{name}.{ext}'
                    entries[full] = (preload, arc, off, ln)
        data_start = header + tree_size
    return entries, data_start


def read(dir_path, entry, data_start):
    preload, arc, off, ln = entry
    if not ln:
        return preload
    if arc == 0x7FFF:
        fn, off = dir_path, data_start + off
    else:
        fn = dir_path.replace('_dir.vpk', f'_{arc:03d}.vpk')
    with open(fn, 'rb') as f:
        f.seek(off)
        return preload + f.read(ln)


if __name__ == '__main__':
    src, needle, out = sys.argv[1:4]
    entries, start = index(src)
    for p, e in entries.items():
        if needle in p:
            dst = os.path.join(out, p)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            open(dst, 'wb').write(read(src, e, start))
            print(p, os.path.getsize(dst))
