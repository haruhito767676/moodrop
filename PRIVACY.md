# Privacy Policy / プライバシーポリシー

*Last updated: 2026-10-08*

[English](#english) · [日本語](#日本語)

---

## English

Moodrop is a browser extension that saves files from Moodle to a folder on your computer. It is designed so that your data stays on your computer.

### What Moodrop does with your data

- **No servers, no accounts.** Moodrop has no server of its own. It does not collect, transmit, sell, or share any personal information, and it contains no analytics, telemetry, or advertising.
- **Files go straight to your folder.** When you press Save, Moodrop downloads the file from your Moodle site using your own signed-in session (the same request your browser makes when you click the link) and writes it to the folder you chose. The file is never sent anywhere else.
- **It only talks to Moodle sites you enabled.** Moodrop requests access to a Moodle site only when you add it, and it can read and download only from those sites.

### What is stored on your computer

All of this stays in your browser's local extension storage, and none of it is sent anywhere:

- Your settings (for example, "create folders automatically").
- The list of Moodle sites you enabled.
- A link between each course and the folder you chose for it.
- A record of which files you saved, with the file name and its location inside your save folder, so that Moodrop can mark them as "Saved".
- A short list of your most recent saves (file names and course names) shown in the toolbar popup.
- A handle to your save folder, which lets Moodrop write into it after you gave permission.

### Permissions

| Permission | Why |
|---|---|
| `storage` | To keep the data listed above. |
| `scripting` | To show the save buttons on the Moodle sites you enabled. |
| `activeTab` | To let the toolbar popup check whether the current tab is Moodle. |
| Optional access to sites you add | To read and download files from your Moodle. Requested one site at a time, only when you enable it. |

### Your control

- Remove a Moodle site in **Settings → Moodle sites** to stop Moodrop from running there and to revoke its access.
- Reset a course's folder in **Settings → Courses**.
- Removing the extension deletes all the data it stored. Files already saved to your folder are yours and are not deleted.

### Changes and contact

If this policy changes, the date above is updated and the change is recorded in this repository's history. Questions can be sent by opening an issue in this repository.

*Moodrop is an unofficial tool and is not affiliated with Moodle Pty Ltd.*

---

## 日本語

Moodropは、Moodleの資料をパソコン上のフォルダに保存するブラウザ拡張機能です。あなたのデータがパソコンの外に出ないように設計されています。

### データの扱い

- **サーバーもアカウントもありません。** Moodropには専用のサーバーがありません。個人情報を収集・送信・販売・共有することはなく、アクセス解析、テレメトリー、広告も含みません。
- **資料は直接、あなたのフォルダに入ります。** 「保存」を押すと、Moodropは、あなた自身のログイン状態を使ってMoodleから資料を取得し（リンクをクリックしたときにブラウザが行うのと同じリクエストです）、選んだフォルダに書き込みます。資料が、ほかの場所に送られることはありません。
- **通信するのは、有効にしたMoodleサイトだけです。** Moodropは、あなたがサイトを追加したときにだけそのサイトへのアクセスを求め、読み取り・ダウンロードできるのもそのサイトだけです。

### パソコンに保存されるもの

次のものは、すべてブラウザの拡張機能のローカル領域に保存され、外部には送信されません。

- 設定（「科目名で自動的に作成する」など）
- 有効にしたMoodleサイトの一覧
- 科目と、その科目に選んだフォルダの対応
- 保存した資料の記録（ファイル名と、保存先フォルダの中での場所）。「保存済み」の表示に使います。
- 直近の保存の短い一覧（ファイル名と科目名）。ツールバーのポップアップに表示されます。
- 保存先フォルダへのハンドル。許可を得たあとに、Moodropがそのフォルダへ書き込むために使います。

### 権限

| 権限 | 用途 |
|---|---|
| `storage` | 上に挙げたデータを保持するため。 |
| `scripting` | 有効にしたMoodleサイトに、保存ボタンを表示するため。 |
| `activeTab` | ツールバーのポップアップで、いまのタブがMoodleかどうかを調べるため。 |
| あなたが追加したサイトへのアクセス（任意） | あなたのMoodleから資料を読み取り・ダウンロードするため。サイトを有効にするときに、1サイトずつ求めます。 |

### あなたが管理できること

- **設定 → Moodleサイト**でサイトを解除すると、そのサイトでの動作が止まり、アクセス権限も取り消されます。
- **設定 → 科目**で、科目ごとの保存先をリセットできます。
- 拡張機能を削除すると、保存されていたデータはすべて消えます。すでに保存した資料は、あなたのフォルダにあるもので、削除されません。

### 変更とお問い合わせ

このポリシーを変更するときは、上の日付を更新し、変更はこのリポジトリの履歴に残ります。ご質問は、このリポジトリのIssueからお寄せください。

*Moodropは非公式のツールで、Moodle Pty Ltd とは関係ありません。*
