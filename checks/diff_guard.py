#!/usr/bin/env python3
"""
diff_guard —— 提交前的格式漂移闸门

拦截一类会静默污染 diff 的错误：**内容只改了一处，整份文件却显示全部改动。**

典型翻车（2026-10-07 实测）：用 Python `open(p,'w')` 改一个 CRLF 行尾的
yaml 文件，write 默认写 LF，1214 行全部被标记为改动。内容一个字符没丢，
但真正的 3 行改动被 1214 行噪音淹没，提交完全没法 review。

判定规则（对暂存区与 HEAD 的每个变更文件）：

  FAIL  格式漂移：去掉行尾/行尾空白/BOM 后内容完全相同，但原始字节不同。
        说明改动只是换行符或空白风格变了，内容其实没动 —— 必须还原行尾，
        只重新应用真正的改动。
  FAIL  编码漂移：HEAD 是 UTF-8，改动后不再是合法 UTF-8（多见于被某些
        工具用本地编码重新保存）。
  WARN  单文件改动过大：超过 --max-lines（默认 400）行。可能是整文件重写、
        批量替换或格式化，需要人确认而不是机器判断。

只读：不修改任何文件，不动暂存区，只报告并以退出码阻断 commit。

用法：
    python3 checks/diff_guard.py                 # 检查暂存区
    python3 checks/diff_guard.py --staged        # 同上（显式）
    python3 checks/diff_guard.py --max-lines 200 # 调整单文件阈值
    python3 checks/diff_guard.py --self-test     # 跑内置自测，验闸门本身有效

退出码：0 通过；1 有 FAIL；2 用法错误。
"""

import argparse
import subprocess
import sys
import tempfile
import os

BOM = b'\xef\xbb\xbf'


def git(*args):
    return subprocess.run(['git'] + list(args), capture_output=True).stdout


def normalize(b):
    """归一化：去 BOM、统一行尾、去掉行尾空白、去掉末尾空行。"""
    if b.startswith(BOM):
        b = b[len(BOM):]
    b = b.replace(b'\r\n', b'\n').replace(b'\r', b'\n')
    lines = [ln.rstrip(b' \t') for ln in b.split(b'\n')]
    while lines and lines[-1] == b'':
        lines.pop()
    return b'\n'.join(lines)


def blob(rev, path, repo=None):
    """取指定版本的文件内容；文件不存在返回 None。repo 缺省为当前目录。"""
    r = subprocess.run(['git', 'show', '%s:%s' % (rev, path)],
                       capture_output=True, cwd=repo)
    return r.stdout if r.returncode == 0 else None


def staged_blob(path, repo=None):
    r = subprocess.run(['git', 'show', ':%s' % path], capture_output=True, cwd=repo)
    return r.stdout if r.returncode == 0 else None


def is_texty(b):
    if b is None:
        return True
    if b'\x00' in b[:8000]:
        return False
    try:
        b.decode('utf-8')
        return True
    except UnicodeDecodeError:
        return True  # 当文本处理，交给编码漂移规则判


def check_file(path, max_lines, verbose=False, repo=None):
    """返回 (fails, warns, messages)"""
    fails, warns, msgs = [], [], []

    old = blob('HEAD', path, repo)
    new = staged_blob(path, repo)
    if new is None:
        return fails, warns, msgs
    if old is None:
        return fails, warns, msgs  # 新增文件，不适用
    if old == new:
        return fails, warns, msgs  # 内容完全一致

    # 只处理文本类；二进制不做格式判定
    if not is_texty(old):
        return fails, warns, msgs

    # 规则 1：格式漂移
    no, nn = normalize(old), normalize(new)
    if no == nn:
        detail = []
        if old.startswith(BOM) != new.startswith(BOM):
            detail.append('BOM %s' % ('被加上' if not old.startswith(BOM) else '被删掉'))
        crlf_o = old.count(b'\r\n')
        crlf_n = new.count(b'\r\n')
        if crlf_o != crlf_n:
            detail.append('CRLF 行数 %d → %d' % (crlf_o, crlf_n))
        else:
            detail.append('行尾空白或末尾空行变化')
        fails.append(path)
        msgs.append('FAIL  格式漂移  %s  （%s；内容归一化后完全相同，'
                    '但原始字节不同——还原行尾后只应用真正的改动）' % (path, '，'.join(detail)))
        return fails, warns, msgs

    # 规则 2：编码漂移（HEAD 能解 UTF-8，改后不能）
    try:
        new.decode('utf-8')
    except UnicodeDecodeError as e:
        fails.append(path)
        msgs.append('FAIL  编码漂移  %s  （改动后不再是合法 UTF-8：%s）' % (path, e))
        return fails, warns, msgs

    # 规则 3：单文件改动过大
    numstat = subprocess.run(['git', 'diff', '--cached', '--numstat', '--', path],
                             capture_output=True, cwd=repo).stdout.decode('utf-8', 'replace').strip()
    if numstat:
        parts = numstat.split('\t')
        if len(parts) >= 2 and parts[0].isdigit():
            changed = int(parts[0]) + int(parts[1])
            if changed > max_lines:
                warns.append(path)
                msgs.append('WARN  改动较大  %s  （%d 行，超过阈值 %d；'
                            '若确为整文件重写/批量替换请确认，否则先查工具是否改了行尾）'
                            % (path, changed, max_lines))

    return fails, warns, msgs


def self_test():
    """自测：造一个已知的 CRLF 漂移样本，确认闸门能抓到；再确认正常改动不误报。"""
    print('=== diff_guard 自测 ===')
    ok = True

    with tempfile.TemporaryDirectory() as td:
        repo = os.path.join(td, 'repo')
        os.makedirs(repo)
        run = lambda *a: subprocess.run(['git'] + list(a), cwd=repo, capture_output=True)
        run('init', '-q')
        run('config', 'user.email', 't@t')
        run('config', 'user.name', 't')

        p = 'sample.yaml'
        crlf = 'a: 1\r\nb: 2\r\nc: 3\r\n'
        with open(os.path.join(repo, p), 'wb') as f:
            f.write(crlf.encode('utf-8'))
        run('add', p)
        run('commit', '-qm', 'init')

        # 坏样本：内容没变，只把 CRLF 换成 LF
        with open(os.path.join(repo, p), 'wb') as f:
            f.write(crlf.replace('\r\n', '\n').encode('utf-8'))
        run('add', p)
        f1, _, m1 = check_file(p, 400, repo=repo)
        print('  坏样本（CRLF→LF，内容不变）：%s' % ('✓ 抓到' if f1 else '★ 漏掉'))
        if not f1:
            ok = False
        else:
            print('    %s' % m1[0])

        # 还原成 CRLF，确认不再报
        with open(os.path.join(repo, p), 'wb') as f:
            f.write(crlf.encode('utf-8'))
        run('add', p)
        f2, _, _ = check_file(p, 400, repo=repo)
        print('  还原为 CRLF 后：%s' % ('✓ 不再报错' if not f2 else '★ 仍报错'))
        if f2:
            ok = False

        # 好样本：真的改一行内容，且保持 CRLF
        with open(os.path.join(repo, p), 'wb') as f:
            f.write(crlf.replace('b: 2', 'b: 22').encode('utf-8'))
        run('add', p)
        f3, _, m3 = check_file(p, 400, repo=repo)
        print('  好样本（真改一行内容，行尾不变）：%s' % ('✓ 不误报' if not f3 else '★ 误报'))
        if f3:
            ok = False
            for m in m3:
                print('    %s' % m)

    print('=== 自测%s ===' % ('通过' if ok else '失败'))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description='提交前格式漂移闸门')
    ap.add_argument('--max-lines', type=int, default=400,
                    help='单文件改动行数告警阈值（默认 400）')
    ap.add_argument('--staged', action='store_true', help='检查暂存区（默认行为）')
    ap.add_argument('--self-test', action='store_true', help='跑内置自测')
    ap.add_argument('-v', '--verbose', action='store_true')
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    names = git('diff', '--cached', '--name-only', '--diff-filter=M').decode('utf-8', 'replace')
    files = [x for x in names.split('\n') if x.strip()]
    if not files:
        print('diff_guard: 暂存区无内容变更，放行')
        return 0

    all_fail, all_warn, msgs = [], [], []
    for p in files:
        f, w, m = check_file(p, args.max_lines, args.verbose)
        all_fail += f
        all_warn += w
        msgs += m

    for m in msgs:
        print(m)
    print('---')
    print('diff_guard: 检查 %d 个变更文件，FAIL %d，WARN %d'
          % (len(files), len(all_fail), len(all_warn)))
    if all_fail:
        print('diff_guard: 阻断提交。格式漂移请还原原文件行尾后重新应用改动。')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())