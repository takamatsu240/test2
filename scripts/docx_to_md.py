#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Word議事録ファイル(.docx)をMarkdown形式(.md)に変換するスクリプト（新テンプレート対応版）

新しいテンプレート構造:
1. ヘッダーテーブル（プロジェクト名、日時、場所、参加者など）
2. セクション1: 前回課題・ToDoの進捗確認（3列テーブル）
3. セクション2: 新規TODO(既存課題用)（個別テーブル）
4. セクション3: 新規課題、TODO（課題テーブル + ToDoテーブル）
5. 議事詳細

使い方:
    python scripts/docx_to_md_v2.py <input.docx> <output.md>
"""

import sys
import re
from docx import Document

def get_cell_text_with_sdt(cell):
    """
    セルからテキストを取得（SDT/コンテンツコントロールの値も含む）
    ドロップダウンリストなどのSDTから選択された値を取得する
    """
    # SDT（コンテンツコントロール）を探す
    sdts = cell._element.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sdt')

    if sdts:
        # SDT内のテキストを取得
        for sdt in sdts:
            content = sdt.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')
            if content:
                text_values = [t.text for t in content if t.text]
                if text_values:
                    return ' '.join(text_values).strip()

    # SDTがない場合は通常のテキストを返す
    return cell.text.strip()

def extract_header_table_info(table):
    """
    ヘッダーテーブルからプロジェクト情報を抽出

    テーブル構造:
    Row 0: 議事録
    Row 1: プロジェクト名 | プロジェクト名 | 値 | ...
    Row 2: 日時 | 値 | ... | 場所 | 値
    Row 3: 参加者 | 参加者 | 値 | ...
    ...
    """
    info = {
        'projectName': '',
        'date': '',
        'location': '',
        'participants': ''
    }

    for row in table.rows:
        row_text = " ".join([get_cell_text_with_sdt(cell) for cell in row.cells])

        # プロジェクト名の抽出
        if 'プロジェクト名' in row_text:
            # 「プロジェクト名」ラベルより後のセルから値を取得
            for cell in row.cells:
                text = get_cell_text_with_sdt(cell)
                if text and text != 'プロジェクト名':
                    info['projectName'] = text
                    break

        # 日時の抽出
        if '日時' in row_text:
            # 日付形式を探す（YYYY-M-D や YYYY/M/D など）
            date_match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})', row_text)
            if date_match:
                info['date'] = date_match.group(1)

        # 場所の抽出
        if '場所' in row_text:
            for i, cell in enumerate(row.cells):
                if '場所' in get_cell_text_with_sdt(cell):
                    # 次のセルまたは同じ行の後続セルから値を取得
                    if i + 1 < len(row.cells):
                        location = get_cell_text_with_sdt(row.cells[i + 1])
                        if location:
                            info['location'] = location
                            break

        # 参加者の抽出
        if '参加者' in row_text:
            # 「参加者」ラベルより後のセルから値を取得
            for cell in row.cells:
                text = get_cell_text_with_sdt(cell)
                if text and text != '参加者' and ',' in text:
                    info['participants'] = text
                    break

    return info

def parse_progress_table_v2(table):
    """
    進捗確認テーブルを解析（新テンプレート版）

    テーブル構造:
    Row 0: タスク名 | 変更 | 内容（ヘッダー行）
    Row 1以降: タスク名/ID | 変更（ドロップダウン） | 内容

    例:
    Row 1: パフォーマンス最適化/ISSUE-001 | 最新状況 | データベースクエリの最適化が完了...
    Row 2: セキュリティ強化/ ISSUE-002 | 完了 | （空）
    """
    updates = []

    for i, row in enumerate(table.rows):
        # ヘッダー行をスキップ
        if i == 0:
            continue

        cells = row.cells
        if len(cells) < 2:
            continue

        cell0 = get_cell_text_with_sdt(cells[0])  # タスク名/ID
        cell1 = get_cell_text_with_sdt(cells[1]) if len(cells) > 1 else ""  # 変更（ドロップダウン）
        cell2 = get_cell_text_with_sdt(cells[2]) if len(cells) > 2 else ""  # 内容

        # 空行をスキップ
        if not cell0:
            continue

        # タスク名とIDを抽出（形式: "タスク名/ISSUE-001" または "タスク名/TODO-001"）
        task_name = ""
        task_id = None
        action = cell1 if cell1 else "最新状況"  # ドロップダウンの値をそのまま使用
        content = cell2  # 3列目が内容

        if '/' in cell0:
            parts = cell0.split('/', 1)
            task_name = parts[0].strip()
            # ID抽出
            id_match = re.search(r'(TODO-\d+|ISSUE-\d+|NEW-ISSUE-\d+)', parts[1])
            if id_match:
                task_id = id_match.group(1)

        # タスクIDがない場合はスキップ
        if not task_id:
            continue

        # タスク名が空の場合、IDから生成
        if not task_name:
            task_name = f"タスク {task_id}"

        # actionはすでにドロップダウンから取得済み
        # contentは3列目の値

        updates.append({
            'task_name': task_name,
            'task_id': task_id,
            'action': action,
            'content': content
        })

    return updates

def parse_new_todo_table(table):
    """
    新規TODO（既存課題用）テーブルを解析

    テーブル構造:
    Row 0: TODO名 | 値 | 値 | 値
    Row 1: 親課題名 | 値（課題名/ISSUE-001） | 値 | 値
    Row 2: 担当者 | 名前1 | 期日 | 日付
    Row 3: 内容 | 詳細 | 詳細 | 詳細
    Row 4: 判定対象 | ファイル名 | ファイル名 | ファイル名
    """
    todo_data = {
        'title': '',
        'parent_issue': '',  # 親課題No（例: ISSUE-001）
        'assignee': '',
        'due_date': '',
        'content': '',
        'target': ''
    }

    for row in table.rows:
        cells = row.cells
        if len(cells) < 2:
            continue

        cell0 = get_cell_text_with_sdt(cells[0])
        cell1 = get_cell_text_with_sdt(cells[1]) if len(cells) > 1 else ""
        cell2 = get_cell_text_with_sdt(cells[2]) if len(cells) > 2 else ""
        cell3 = get_cell_text_with_sdt(cells[3]) if len(cells) > 3 else ""

        # ToDoタイトル
        if 'TODO' in cell0 or 'ToDo' in cell0:
            todo_data['title'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 親課題名（形式: "パフォーマンス最適化/ISSUE-001"）
        if '親課題' in cell0:
            parent_text = cell1 if cell1 else (cell2 if cell2 else cell3)
            # 課題IDを抽出
            id_match = re.search(r'(ISSUE-\d+|NEW-ISSUE-\d+)', parent_text)
            if id_match:
                todo_data['parent_issue'] = id_match.group(1)

        # 担当者と期日（同じ行に入っている）
        if '担当' in cell0:
            todo_data['assignee'] = cell1
            # 期日がcell2またはcell3にある
            if '期' in cell2:
                date_match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})', cell3)
                if date_match:
                    todo_data['due_date'] = date_match.group(1)

        # 内容
        if '内容' in cell0 and '判定' not in cell0:
            todo_data['content'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 判定対象
        if '判定' in cell0:
            todo_data['target'] = cell1 if cell1 else (cell2 if cell2 else cell3)

    return todo_data

def parse_new_issue_table(table):
    """
    新規課題テーブルを解析

    テーブル構造:
    Row 0: 課題名 | 値 | 値 | 値
    Row 1: 担当者 | 名前 | 期日 | 日付
    Row 2: 内容 | 詳細 | 詳細 | 詳細
    Row 3: 最新状況 | （空）| （空）| （空）
    Row 4: 対応方針 | 詳細 | 詳細 | 詳細
    """
    issue_data = {
        'title': '',
        'assignee': '',
        'due_date': '',
        'content': '',
        'latest_status': '',
        'strategy': ''
    }

    for row in table.rows:
        cells = row.cells
        if len(cells) < 2:
            continue

        cell0 = get_cell_text_with_sdt(cells[0])
        cell1 = get_cell_text_with_sdt(cells[1]) if len(cells) > 1 else ""
        cell2 = get_cell_text_with_sdt(cells[2]) if len(cells) > 2 else ""
        cell3 = get_cell_text_with_sdt(cells[3]) if len(cells) > 3 else ""

        # 課題名
        if '課題' in cell0:
            issue_data['title'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 担当者と期日
        if '担当' in cell0:
            issue_data['assignee'] = cell1
            # 期日がcell2またはcell3にある
            if '期' in cell2:
                date_match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})', cell3)
                if date_match:
                    issue_data['due_date'] = date_match.group(1)

        # 内容
        if '内容' in cell0:
            issue_data['content'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 最新状況
        if '最新' in cell0:
            issue_data['latest_status'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 対応方針
        if '対応' in cell0:
            issue_data['strategy'] = cell1 if cell1 else (cell2 if cell2 else cell3)

    return issue_data

def parse_new_issue_todo_table(table):
    """
    新規課題配下のToDoテーブルを解析

    テーブル構造:
    Row 0: ToDo名 | 値 | 値 | 値
    Row 1: 担当者: | 名前 | 期日 | 日付
    Row 2: 内容 | 詳細 | 詳細 | 詳細
    Row 3: 判定対象 | ファイル名 | ファイル名 | ファイル名
    """
    todo_data = {
        'title': '',
        'assignee': '',
        'due_date': '',
        'content': '',
        'target': ''
    }

    for row in table.rows:
        cells = row.cells
        if len(cells) < 2:
            continue

        cell0 = get_cell_text_with_sdt(cells[0])
        cell1 = get_cell_text_with_sdt(cells[1]) if len(cells) > 1 else ""
        cell2 = get_cell_text_with_sdt(cells[2]) if len(cells) > 2 else ""
        cell3 = get_cell_text_with_sdt(cells[3]) if len(cells) > 3 else ""

        # ToDoタイトル
        if 'ToDo' in cell0:
            todo_data['title'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 担当者と期日
        if '担当' in cell0:
            # 「担当者:」というラベルを削除
            assignee = cell1.replace(':', '').strip()
            todo_data['assignee'] = assignee if assignee else cell1
            # 期日
            if '期' in cell2:
                date_match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})', cell3)
                if date_match:
                    todo_data['due_date'] = date_match.group(1)

        # 内容
        if '内容' in cell0:
            todo_data['content'] = cell1 if cell1 else (cell2 if cell2 else cell3)

        # 判定対象
        if '判定' in cell0:
            todo_data['target'] = cell1 if cell1 else (cell2 if cell2 else cell3)

    return todo_data

def convert_docx_to_md_v2(docx_path):
    """
    新テンプレート形式のWordファイルをMarkdownに変換
    """
    try:
        doc = Document(docx_path)
    except Exception as e:
        print(f"エラー: Wordファイルを開けませんでした: {e}", file=sys.stderr)
        return None

    md_output = []

    # 現在のセクション（1: 進捗確認, 2: 新規TODO既存課題用, 3: 新規課題TODO）
    current_section = None
    current_issue_title = None  # セクション3で使用
    current_issue_data = None   # セクション3で使用

    # ドキュメントの要素を順番に処理
    for element_idx, element in enumerate(doc.element.body):
        # 段落の場合
        if element.tag.endswith('p'):
            from docx.text.paragraph import Paragraph
            para = Paragraph(element, doc)
            text = para.text.strip()

            if not text:
                continue

            # セクション見出しの判定（テキスト内容で判定）
            if '前回課題' in text and 'ToDo' in text and '進捗' in text:
                current_section = 1
                md_output.append("\n## 1. 前回課題・ToDoの進捗確認\n")
                continue

            elif '新規TODO' in text and '既存課題' in text:
                # セクション2もセクション1として扱う（既存課題への新規ToDoの追加）
                current_section = 2
                continue

            elif '新規課題' in text and 'TODO' in text:
                # セクション1が処理されていなければ見出しを追加
                if current_section == 1 or current_section == 2:
                    md_output.append("\n---\n")
                current_section = 3
                md_output.append("\n## 2. 新規議題\n")
                continue

            elif '[議事詳細]' in text or '議事詳細' in text:
                current_section = 4
                md_output.append("\n## 4. その他の共有事項\n")
                continue

            # セクション4（議事詳細）の場合、段落をそのまま出力
            if current_section == 4:
                md_output.append(f"{text}\n")

        # テーブルの場合
        elif element.tag.endswith('tbl'):
            from docx.table import Table
            table = Table(element, doc)

            # テーブルの内容を確認
            table_text = " ".join([get_cell_text_with_sdt(cell) for row in table.rows for cell in row.cells])

            # ヘッダーテーブル（プロジェクト情報）
            if element_idx == 0 or 'プロジェクト名' in table_text:
                header_info = extract_header_table_info(table)
                if header_info['projectName']:
                    md_output.append("# プロジェクト情報\n")
                    md_output.append(f"- プロジェクト名: {header_info['projectName']}\n")
                    md_output.append("\n")
                md_output.append("# 議事録\n")
                if header_info['date']:
                    md_output.append(f"**日時**: {header_info['date']}\n")
                if header_info['location']:
                    md_output.append(f"**場所**: {header_info['location']}\n")
                if header_info['participants']:
                    md_output.append(f"**参加者**: {header_info['participants']}\n")
                md_output.append("---\n")
                continue

            # セクション1: 進捗確認テーブル
            if (current_section == 1 or current_section == 2) and 'タスク名' in table_text and '変更' in table_text:
                updates = parse_progress_table_v2(table)
                for update in updates:
                    task_name = update['task_name']
                    task_id = update['task_id']
                    action = update['action']
                    content = update['content']

                    # ISSUEの処理
                    if "ISSUE" in task_id:
                        md_output.append(f"### 課題: {task_name} [既存課題: {task_id}]\n")
                        if action == "完了":
                            md_output.append("**完了**\n")
                        elif action == "中止":
                            md_output.append("**中止**\n")
                        elif content:
                            md_output.append(f"**最新状況**: {content}\n")
                        md_output.append("\n")

                    # TODOの処理
                    elif "TODO" in task_id:
                        md_output.append(f"**ToDo**: {task_name} [既存ToDo: {task_id}]\n")
                        if action == "完了":
                            md_output.append("**完了**\n")
                        elif action == "中止":
                            md_output.append("**中止**\n")
                        elif content:
                            md_output.append(f"**最新状況**: {content}\n")
                        md_output.append("\n")

                continue

            # セクション2: 新規TODO（既存課題用）
            if current_section == 2 and 'TODO' in table_text and '親課題' in table_text:
                todo = parse_new_todo_table(table)
                if todo['title'] and todo['parent_issue']:
                    # 既存課題への新規ToDoとして出力
                    md_output.append(f"**ToDo**: {todo['title']} [親課題: {todo['parent_issue']}]\n")
                    if todo['assignee']:
                        md_output.append(f"- 担当者: {todo['assignee']}\n")
                    if todo['due_date']:
                        md_output.append(f"- 期日: {todo['due_date']}\n")
                    if todo['content']:
                        md_output.append(f"- 内容: {todo['content']}\n")
                    if todo['target']:
                        md_output.append(f"- 判定対象: {todo['target']}\n")
                    md_output.append("\n")
                continue

            # セクション3: 新規課題テーブル
            if current_section == 3:
                # ToDoテーブル（課題配下）を先に判定
                # 「ToDo名」というラベルがあればToDoテーブル
                if 'ToDo名' in table_text or ('ToDo' in table_text and '担当' in table_text and '判定対象' in table_text):
                    todo = parse_new_issue_todo_table(table)
                    if todo['title'] and current_issue_title:
                        # 親課題タイトルを参照として追加
                        md_output.append(f"**ToDo**: {todo['title']}\n")
                        if todo['assignee']:
                            md_output.append(f"- 担当者: {todo['assignee']}\n")
                        if todo['due_date']:
                            md_output.append(f"- 期日: {todo['due_date']}\n")
                        if todo['content']:
                            md_output.append(f"- 内容: {todo['content']}\n")
                        if todo['target']:
                            md_output.append(f"- 判定対象: {todo['target']}\n")
                        md_output.append("\n")
                    continue

                # 課題テーブル（内容、最新状況、対応方針を含む）
                # 「課題名」というラベルがあれば課題テーブル
                elif '課題名' in table_text or (('内容' in table_text or '課題内容' in table_text) and ('対応方針' in table_text or '最新状況' in table_text)):
                    issue = parse_new_issue_table(table)
                    if issue['title']:
                        current_issue_title = issue['title']
                        current_issue_data = issue

                        md_output.append(f"\n### 課題: {issue['title']}\n")
                        if issue['content']:
                            md_output.append(f"**課題内容**: {issue['content']}\n")
                        if issue['latest_status']:
                            md_output.append(f"**最新状況**: {issue['latest_status']}\n")
                        if issue['strategy']:
                            md_output.append(f"**対応方針**: {issue['strategy']}\n")
                        if issue['assignee']:
                            md_output.append(f"**担当者**: {issue['assignee']}\n")
                        if issue['due_date']:
                            md_output.append(f"**期限**: {issue['due_date']}\n")
                        md_output.append("\n")
                        md_output.append("**今後のアクション**\n\n")
                    continue
                    todo = parse_new_issue_todo_table(table)
                    print(f"[DEBUG] ToDo検出: title={todo['title']}, current_issue={current_issue_title}", file=sys.stderr)
                    if todo['title'] and current_issue_title:
                        # 親課題タイトルを参照として追加
                        md_output.append(f"**ToDo**: {todo['title']}\n")
                        if todo['assignee']:
                            md_output.append(f"- 担当者: {todo['assignee']}\n")
                        if todo['due_date']:
                            md_output.append(f"- 期日: {todo['due_date']}\n")
                        if todo['content']:
                            md_output.append(f"- 内容: {todo['content']}\n")
                        if todo['target']:
                            md_output.append(f"- 判定対象: {todo['target']}\n")
                        md_output.append("\n")
                    continue

    return "\n".join(md_output)

def main():
    # 標準出力をUTF-8に設定
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

    if len(sys.argv) < 3:
        print("使い方: python docx_to_md_v2.py <input_docx> <output_md>")
        print("例: python docx_to_md_v2.py minutes/meeting.docx minutes/meeting.md")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    print(f"変換中: {input_path} -> {output_path}")

    markdown_text = convert_docx_to_md_v2(input_path)

    if markdown_text is None:
        print("エラー: 変換に失敗しました", file=sys.stderr)
        sys.exit(1)

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown_text)

        print(f"[OK] 変換完了: {output_path}")
    except Exception as e:
        print(f"エラー: ファイルの書き込みに失敗しました: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
