#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Word議事録ファイル(.docx)をMarkdown形式(.md)に変換するスクリプト

使い方:
    python scripts/docx_to_md.py <input.docx> <output.md>

例:
    python scripts/docx_to_md.py minutes/meeting-2026-02-05.docx minutes/meeting-2026-02-05.md
"""

import sys
import re
from docx import Document
from datetime import datetime

def extract_metadata(doc):
    """
    ドキュメントの冒頭から会議メタデータを抽出
    """
    metadata = {
        'title': '議事録',
        'date': '',
        'location': '',
        'participants': '',
        'projectName': ''
    }

    # 最初の10段落を検索してメタデータを抽出
    for para in doc.paragraphs[:10]:
        text = para.text.strip()

        if not text:
            continue

        # プロジェクト名（見出し4のスタイルをチェック）
        if para.style and 'Heading 4' in para.style.name:
            # "プロジェクト名：○○" or "プロジェクト名:○○" の形式から抽出
            if 'プロジェクト名' in text or 'プロジェクト' in text:
                # "プロジェクト名"というラベルを削除してコロン以降を取得
                project_text = re.sub(r'プロジェクト名\s*[：:;；]\s*', '', text)
                metadata['projectName'] = project_text.strip()
            continue

        # タイトル（最初の見出し）
        if not metadata['title'] or '議事録' in text:
            metadata['title'] = text

        # 日時
        if '日時' in text:
            metadata['date'] = text.replace('日時', '').replace(':', '').replace('：', '').strip()

        # 場所
        if '場所' in text:
            metadata['location'] = text.replace('場所', '').replace(':', '').replace('：', '').strip()

        # 参加者
        if '参加者' in text:
            metadata['participants'] = text.replace('参加者', '').replace(':', '').replace('：', '').strip()

    return metadata

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

def parse_progress_table(table):
    """
    進捗確認テーブルを解析して、既存タスクの更新情報を抽出

    テーブル構造:
    1列目: タスク名/ID （例: "タスク名/ISSUE-001" または "タスク名/TODO-001"）
    2列目: 変更事項 （最新状況、対応方針、期限、完了、中止のいずれか）※ドロップダウン
    3列目: 変更内容 （2列目に応じた具体的な内容）
    """
    updates = []

    for i, row in enumerate(table.rows):
        # ヘッダー行をスキップ
        if i == 0:
            continue

        cells = row.cells
        if len(cells) < 3:
            continue

        # セルの内容を取得（SDT対応）
        cell0 = get_cell_text_with_sdt(cells[0])  # タスク名/ID
        cell1 = get_cell_text_with_sdt(cells[1])  # 変更事項（ドロップダウン）
        cell2 = get_cell_text_with_sdt(cells[2])  # 変更内容

        # 空行をスキップ
        if not cell0:
            continue

        # 1列目からタスク名とIDを抽出
        # 形式: "タスク名/ISSUE-001" または "/TODO-001"
        task_name = ""
        task_id = None

        if '/' in cell0:
            parts = cell0.split('/', 1)
            task_name = parts[0].strip()
            # スラッシュの後からID抽出
            id_match = re.search(r'(TODO-\d+|ISSUE-\d+|NEW-ISSUE-\d+)', parts[1])
            if id_match:
                task_id = id_match.group(1)

        # タスクIDがない場合はスキップ
        if not task_id:
            continue

        # タスク名が空の場合、IDから生成
        if not task_name:
            task_name = f"タスク {task_id}"

        # 2列目から変更事項を取得（デフォルトは「最新状況」）
        action = cell1 if cell1 else "最新状況"

        # 3列目から変更内容を取得
        content = cell2

        updates.append({
            'task_name': task_name,
            'task_id': task_id,
            'action': action,
            'content': content
        })

    return updates

def parse_todo_table(table):
    """
    新規ToDoテーブルまたは課題テーブルを解析（柔軟な構造に対応）
    
    テーブル構造パターン:
    パターン1（Key-Value）: | ToDoタイトル | 値 |
    パターン2（複雑）: | ToDoタイトル | 値 | 値 | (セル結合あり)
    パターン3（課題用）: | 内容 | 値 | | 最新状況 | 値 | | 対応方針 | 値 |
    """
    todo_data = {
        'title': '',
        'assignee': '',
        'due_date': '',
        'content': '',  # ToDoの内容
        'target': '',
        'issue_content': '',  # 課題の詳細説明（「内容」フィールド）
        'latest_status': '',  # 課題の最新状況
        'strategy': ''  # 課題の対応方針
    }
    
    # テーブル全体のテキストを取得（コンテキスト判定用）
    table_text = " ".join([cell.text for row in table.rows for cell in row.cells])
    
    for row in table.rows:
        cells = row.cells
        if len(cells) < 2:
            continue
        
        # すべてのセルのテキストを結合してチェック
        row_text = " ".join([cell.text.strip() for cell in cells])
        
        # 各セルをチェック
        cell0 = cells[0].text.strip()
        cell1 = cells[1].text.strip() if len(cells) > 1 else ""
        cell2 = cells[2].text.strip() if len(cells) > 2 else ""
        
        # ToDoタイトル
        if 'ToDo' in cell0 or 'タイトル' in cell0:
            # 値はcell1またはcell2にある
            todo_data['title'] = cell1 if cell1 else cell2
        
        # 担当者（複数セルに分かれている可能性）
        if '担当' in row_text:
            # 「担当者:名前」の形式で抽出
            assignee_match = re.search(r'担当[者]?[:：\s]*([^\s]+)', row_text)
            if assignee_match:
                todo_data['assignee'] = assignee_match.group(1)
        
        # 期限
        if '期限' in row_text or '期日' in row_text:
            # 日付形式を抽出
            date_match = re.search(r'(\d{4}[-/]\d{2}[-/]\d{2})', row_text)
            if date_match:
                todo_data['due_date'] = date_match.group(1)
        
        # 課題内容（旧形式との互換性 - 「課題内容」という明示的なラベル）
        if '課題内容' in cell0:
            todo_data['issue_content'] = cell1 if cell1 else cell2
        # 内容（新形式 - 単に「内容」というラベル）
        elif cell0 == '内容':
            # テーブル全体のコンテキストで判断
            if '課題内容' in table_text or '対応方針' in table_text or '最新状況' in table_text:
                # 課題テーブルの場合
                todo_data['issue_content'] = cell1 if cell1 else cell2
            elif 'ToDo' in table_text and '担当' in table_text:
                # ToDoテーブルの場合
                todo_data['content'] = cell1 if cell1 else cell2
        
        # 最新状況（課題用）
        if '最新状況' in cell0:
            todo_data['latest_status'] = cell1 if cell1 else cell2
        
        # 対応方針
        if '対応方針' in cell0:
            strategy = cell1 if cell1 else cell2
            todo_data['strategy'] = strategy
        
        # 判定対象
        if '判定' in cell0:
            todo_data['target'] = cell1 if cell1 else cell2
    
    return todo_data

def generate_update_markdown(update):
    """
    既存タスクの更新情報をMarkdown形式で生成

    出力形式:
    - 最新状況の場合: **最新状況**: 内容
    - 対応方針の場合: **対応方針**: 内容
    - 期日の場合: **期日**: 内容
    - 完了の場合: **完了**
    - 中止の場合: **中止**
    """
    task_name = update['task_name']
    task_id = update['task_id']
    change_type = update['action']  # 変更事項（最新状況/対応方針/期限/完了/中止）
    content = update['content'].strip() if update['content'] else ""

    md_lines = []

    # ISSUEの処理
    if task_id and "ISSUE" in task_id:
        md_lines.append(f"### 課題: {task_name} [既存課題: {task_id}]")

        # 変更事項に応じた出力
        if change_type == "完了":
            md_lines.append("**完了**")
        elif change_type == "中止":
            md_lines.append("**中止**")
        elif change_type == "最新状況":
            md_lines.append(f"**最新状況**: {content}")
        elif change_type == "対応方針":
            md_lines.append(f"**対応方針**: {content}")
        elif change_type == "期限" or change_type == "期日":
            md_lines.append(f"**期日**: {content}")
        else:
            # その他の変更タイプ
            md_lines.append(f"**{change_type}**: {content}")

    # TODOの処理
    elif task_id and "TODO" in task_id:
        md_lines.append(f"**ToDo**: {task_name} [既存ToDo: {task_id}を更新]")

        # 変更事項に応じた出力
        if change_type == "完了":
            md_lines.append("**完了**")
        elif change_type == "中止":
            md_lines.append("**中止**")
        elif change_type == "最新状況":
            md_lines.append(f"**最新状況**: {content}")
        elif change_type == "対応方針":
            md_lines.append(f"**対応方針**: {content}")
        elif change_type == "期限" or change_type == "期日":
            md_lines.append(f"**期日**: {content}")
        else:
            # その他の変更タイプ
            md_lines.append(f"**{change_type}**: {content}")

    # IDがない場合（フォールバック）
    else:
        md_lines.append(f"### {task_name}")
        md_lines.append(f"**{change_type}**: {content}")

    md_lines.append("")  # 空行を追加
    return "\n".join(md_lines) + "\n"

def generate_todo_markdown(todo):
    """
    新規ToDoをMarkdown形式で生成（課題セクション付き）
    """
    if not todo['title'] or not todo['assignee']:
        return ""
    
    # ToDoのタイトルから課題タイトルを生成
    # 例: "動作テスト" -> "ワークフロー動作テスト"
    issue_title = todo['title']
    if len(todo['title']) < 10 and todo['content']:
        # タイトルが短い場合、内容から課題タイトルを生成
        content_preview = todo['content'][:50] if len(todo['content']) > 50 else todo['content']
        issue_title = f"{todo['title']}（{content_preview}）"
    
    md_lines = [
        f"### 課題: {issue_title}",
        ""
    ]
    
    # 課題の詳細（内容から生成）
    if todo['content']:
        md_lines.append(f"**最新状況**: {todo['content']}")
        md_lines.append("")
    
    # ToDo情報
    md_lines.append(f"**ToDo**: {todo['title']}")
    md_lines.append(f"- 担当者: {todo['assignee']}")
    
    if todo['due_date']:
        md_lines.append(f"- 期日: {todo['due_date']}")
    
    if todo['content']:
        md_lines.append(f"- 内容: {todo['content']}")
    
    if todo['target']:
        md_lines.append(f"- 判定対象: {todo['target']}")
    
    return "\n".join(md_lines) + "\n"

def convert_docx_to_md(docx_path):
    """
    Wordファイルを解析してMarkdownテキストを生成（段落とテーブルを順番通りに処理）
    """
    try:
        doc = Document(docx_path)
    except Exception as e:
        print(f"エラー: Wordファイルを開けませんでした: {e}", file=sys.stderr)
        return None
    
    md_output = []
    
    # メタデータ抽出
    metadata = extract_metadata(doc)
    
    # プロジェクト情報（見出し4で記載されている場合）
    if metadata['projectName']:
        md_output.append("# プロジェクト情報\n")
        md_output.append(f"- プロジェクト名: {metadata['projectName']}\n")
        md_output.append("\n")

    # ヘッダー
    md_output.append(f"# {metadata['title']}\n")

    if metadata['date']:
        md_output.append(f"**日時**: {metadata['date']}\n")

    if metadata['location']:
        md_output.append(f"**場所**: {metadata['location']}\n")

    if metadata['participants']:
        md_output.append(f"**参加者**: {metadata['participants']}\n")

    md_output.append("---\n")
    
    # 段落とテーブルを順番通りに取得
    # python-docxでは、iter_inner_content()を使って順番通りに取得
    # ただし、この機能がない場合は代替方法を使用
    
    skip_meta = True
    processed_tables = set()
    table_index = 0
    current_issue_title = None  # 現在処理中の課題タイトルを保持
    
    # ドキュメントの要素を順番に処理
    for element in doc.element.body:
        # 段落の場合
        if element.tag.endswith('p'):
            # Paragraphオブジェクトを再構築
            from docx.text.paragraph import Paragraph
            para = Paragraph(element, doc)
            text = para.text.strip()
            
            if not text:
                continue
            
            # メタデータ部分をスキップ
            if skip_meta:
                if '---' in text or '━' in text:
                    skip_meta = False
                continue
            
            # 課題タイトルの判定（「課題:」または「課題：」を含む段落）
            if '課題:' in text or '課題：' in text:
                # 課題タイトルを抽出して保持（次のテーブルで使用）
                # "課題: [タイトル]" や "課題：タイトル" の形式に対応
                title_text = text.replace('課題:', '').replace('課題：', '').strip()
                # [と]を削除
                title_text = title_text.replace('[', '').replace(']', '').strip()
                current_issue_title = title_text
                # この時点では出力せず、次のテーブル処理時に使用
                continue
            
            # 見出しの判定
            elif re.match(r'^\d+\.\s+', text):  # "1. " で始まる
                md_output.append(f"\n## {text}\n")
                current_issue_title = None  # 見出しが変わったらリセット
            elif '新規議題' in text or '議題' in text:
                md_output.append(f"\n{text}\n")
                # 新規議題の見出しでは課題タイトルをリセットしない
            else:
                # 通常のテキスト
                md_output.append(f"{text}\n")
                # 課題タイトルが設定されている場合はリセットしない
                # （課題タイトルの後に説明文が来る可能性があるため）
        
        # テーブルの場合
        elif element.tag.endswith('tbl'):
            if skip_meta:
                continue
            
            # Tableオブジェクトを再構築
            from docx.table import Table
            table = Table(element, doc)
            
            # このテーブルをすでに処理したかチェック
            table_id = id(element)
            if table_id in processed_tables:
                continue
            processed_tables.add(table_id)
            
            # テーブルの内容を確認
            table_text = " ".join([cell.text for row in table.rows for cell in row.cells])
            
            # 進捗確認テーブル
            if 'タスク名' in table_text and '変更' in table_text:
                md_output.append("\n")
                updates = parse_progress_table(table)
                for update in updates:
                    md_output.append(generate_update_markdown(update))
                md_output.append("---\n")
            
            # 課題テーブル（内容 + 最新状況 + 対応方針）
            elif ('内容' in table_text or '課題内容' in table_text) and ('最新状況' in table_text or '対応方針' in table_text):
                # 新規課題として処理
                issue_data = parse_todo_table(table)
                
                # 課題タイトル：直前の段落から取得、なければテーブル内から
                issue_title = current_issue_title if current_issue_title else (issue_data['title'] if issue_data['title'] else "新規課題")
                
                # 何らかのデータがある場合のみ出力
                if issue_data['issue_content'] or issue_data['latest_status'] or issue_data['strategy']:
                    md_output.append(f"\n### 課題: {issue_title}\n")
                    
                    # 課題内容（「内容」フィールド）
                    if issue_data['issue_content']:
                        md_output.append(f"**課題内容**: {issue_data['issue_content']}\n")
                    
                    # 最新状況
                    if issue_data['latest_status']:
                        md_output.append(f"**最新状況**: {issue_data['latest_status']}\n")
                    
                    # 対応方針
                    if issue_data['strategy']:
                        md_output.append(f"**対応方針**: {issue_data['strategy']}\n")
                    
                    # 担当者と期限
                    if issue_data['assignee']:
                        md_output.append(f"**担当者**: {issue_data['assignee']}\n")
                    if issue_data['due_date']:
                        md_output.append(f"**期限**: {issue_data['due_date']}\n")
                    
                    md_output.append("\n")
                    # 課題タイトルは使用後もToDoテーブルで再利用するため保持
            
            # ToDoテーブル（課題配下のToDo）
            elif 'ToDo' in table_text and '担当' in table_text:
                todo = parse_todo_table(table)
                if todo['title']:
                    # 課題タイトルが保持されている場合、ToDoは課題の子要素として扱う
                    if current_issue_title:
                        # ToDoのみを出力（課題はすでに出力済み）
                        md_output.append(f"**ToDo**: {todo['title']}\n")
                        md_output.append(f"- 担当者: {todo['assignee']}\n")
                        
                        if todo['due_date']:
                            md_output.append(f"- 期日: {todo['due_date']}\n")
                        
                        if todo['content']:
                            md_output.append(f"- 内容: {todo['content']}\n")
                        
                        if todo['target']:
                            md_output.append(f"- 判定対象: {todo['target']}\n")
                        
                        md_output.append("\n")
                        # ToDoが処理されたので課題タイトルをリセット
                        current_issue_title = None
                    else:
                        # 独立したToDoとして処理（課題セクションなし）
                        md_output.append(f"\n**ToDo**: {todo['title']}\n")
                        md_output.append(f"- 担当者: {todo['assignee']}\n")
                        
                        if todo['due_date']:
                            md_output.append(f"- 期日: {todo['due_date']}\n")
                        
                        if todo['content']:
                            md_output.append(f"- 内容: {todo['content']}\n")
                        
                        if todo['target']:
                            md_output.append(f"- 判定対象: {todo['target']}\n")
                        
                        md_output.append("\n")
    
    return "\n".join(md_output)

def main():
    # 標準出力をUTF-8に設定
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

    if len(sys.argv) < 3:
        print("使い方: python docx_to_md.py <input_docx> <output_md>")
        print("例: python docx_to_md.py minutes/meeting.docx minutes/meeting.md")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    print(f"変換中: {input_path} -> {output_path}")

    markdown_text = convert_docx_to_md(input_path)

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
