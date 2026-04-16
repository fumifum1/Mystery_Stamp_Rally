window.addEventListener('error', function (event) {
    // ユーザーに一般的なエラーメッセージを表示
    alert('予期せぬエラーが発生しました。開発者ツールで詳細を確認してください。');

    // 開発者向けにコンソールに詳細なエラー情報を出力
    console.error("グローバルエラーハンドラがキャッチしたエラー:", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
});