#!/usr/bin/env python3
"""
yaml_lint —— 暂存区里所有 YAML 的可解析性检查

背景：这个坑踩过两次。
  ① 20_26-10-07 英文站友链数据 link.yml，descr 字段含「: 」（冒号+空格）
     且未加引号，yaml.safe_load 直接抛 ScannerError，site.data.link 变成
     坏数据，友链页渲染成**空容器**——不报错、不空白，只是内容全没了。
  ② 同日 _config.yml 的 description 含「Zhang Peng's blog: ...」，同样未加引号，
     js-yaml 解析失败，**GitHub Actions 英文站构建整体挂掉（exit code 2）**。

两次的共同点：中文里写的是全角「：」不是 YAML 指示符，所以中文版没事、
英文版炸；而且都要等到"渲染/构建"环节才暴露。中文全角冒号是最隐蔽的
触发条件——改英文文案时最容易漏。

本脚本对暂存区里每个 .yml/.yaml 做 safe_load，能解析就放行，不能解析
就报出文件名与行列并阻断提交。只读，不修改任何文件。

用法：
    python3 checks/yaml_lint.py --staged
    python3 checks/yaml_lint.py --self-test
退出码：0 通过；1 有文件无法解析；2 用法错误。
"""

import argparse
import subprocess
import sys

try:
    import yaml
except ImportError:
    print('yaml_lint: 未安装 PyYAML，跳过（pip install pyyaml）', file=sys.stderr)
    sys.exit(0)


def self_test():
    print('=== yaml_lint 自测 ===')
    import tempfile, os
    ok = True
    cases = [
        ("description: Zhang Peng's blog: 96 posts.",
         False, '含「: 」未加引号'),
        ('description: "Zhang Peng\'s blog: 96 posts."',
         True, '同一句加了引号'),
        ('title: 张鹏的个人博客：96 篇运维实测',
         True, '中文全角「：」不构成 YAML 指示符'),
        ('keywords:\n  - ops\n  - CentOS',
         True, '正常列表'),
        ('cover: https://images.unsplash.com/photo-123?w=1600&q=80',
         True, '值里含「:」但后不跟空格'),
    ]
    for text, should_pass, label in cases:
        try:
            yaml.safe_load(text)
            good = True
        except yaml.YAMLError:
            good = False
        flag = '✓' if good == should_pass else '★'
        if good != should_pass:
            ok = False
        print('  %s %-34s 期望%s 实际%s' % (flag, label,
                                          '通过' if should_pass else '拦截',
                                          '通过' if good else '拦截'))
    print('=== 自测%s ===' % ('通过' if ok else '失败'))
    return 0 if ok else 1


def staged_files():
    out = subprocess.run(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACM'],
                         capture_output=True).stdout.decode('utf-8', 'replace')
    return [x for x in out.split('\n')
            if x.strip() and (x.endswith('.yml') or x.endswith('.yaml'))]


def check(path):
    try:
        r = subprocess.run(['git', 'show', ':%s' % path], capture_output=True)
        if r.returncode != 0:
            return None
        text = r.stdout.decode('utf-8')
    except Exception as e:
        return '读取失败：%s' % e
    try:
        yaml.safe_load(text)
        return None
    except yaml.YAMLError as e:
        mark = getattr(e, 'problem_mark', None)
        where = ('第 %d 行第 %d 列' % (mark.line + 1, mark.column + 1)) if mark else '未知位置'
        return '%s（%s）' % (getattr(e, 'problem', str(e)), where)


def main():
    ap = argparse.ArgumentParser(description='暂存区 YAML 可解析性检查')
    ap.add_argument('--staged', action='store_true', help='检查暂存区（默认行为）')
    ap.add_argument('--self-test', action='store_true', help='跑内置自测')
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    files = staged_files()
    if not files:
        print('yaml_lint: 暂存区无 YAML 变更，放行')
        return 0

    bad = []
    for p in files:
        err = check(p)
        if err:
            bad.append(p)
            print('FAIL  YAML 无法解析  %s\n        %s' % (p, err))
    print('---')
    print('yaml_lint: 检查 %d 个 YAML，FAIL %d' % (len(files), len(bad)))
    if bad:
        print('yaml_lint: 阻断提交。值里含「: 」（冒号+空格）必须用引号包起来。'
              '\n        注意中文全角「：」不算，但同一段英文文案里往往混着半角冒号。')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())