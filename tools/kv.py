"""Парсер Valve KeyValues (текстовый). Повторяющийся ключ в блоке — побеждает последний."""
import re

TOKEN = re.compile(r'"((?:[^"\\]|\\.)*)"|([{}])|(//[^\n]*)|([^\s{}"]+)')


def parse(text):
    stack = [{}]
    key = None
    for m in TOKEN.finditer(text):
        s, brace, comment, bare = m.groups()
        if comment is not None:
            continue
        if brace == '{':
            d = {}
            stack[-1][key] = d
            stack.append(d)
            key = None
        elif brace == '}':
            stack.pop()
            key = None
        else:
            tok = s if s is not None else bare
            if key is None:
                key = tok
            else:
                stack[-1][key] = tok
                key = None
    return stack[0]
