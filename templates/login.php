<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0" />
    <title>Enrichment Activity Recorder — Login</title>
    <link rel="stylesheet" href="/assets/css/styles.css?v=1.0.1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body>
<div class="auth-page">
    <div class="auth-topbar">
        <div class="app-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <span>Enrichment Recorder</span>
        </div>
        <button id="toggleTheme" class="icon-btn" title="Toggle Theme">
            <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        </button>
    </div>

    <div class="auth-shell">
        <div class="auth-card">
            <div class="auth-card-header">
                <h1>Enter Password</h1>
                <p>Access is shared by role (Admin / Head of Subject / Teacher).</p>
            </div>

            <?php if (!empty($error)) : ?>
                <div class="auth-alert" role="alert">
                    <?php echo htmlspecialchars((string)$error, ENT_QUOTES, 'UTF-8'); ?>
                </div>
            <?php endif; ?>

            <form method="post" action="/?action=auth_login" class="auth-form" autocomplete="off">
                <label for="password" class="auth-label">Password</label>
                <input id="password" name="password" type="password" placeholder="••••••••" required autofocus>

                <button type="submit" class="btn-primary" style="width:100%; justify-content:center;">
                    Unlock
                </button>
            </form>

            <div class="auth-footnote">
                <span>Tip: Ask your administrator for the correct password.</span>
            </div>
        </div>
    </div>
</div>

<script>
    (function() {
        const root = document.documentElement;
        const t = localStorage.getItem('theme') || 'dark';
        if (t === 'light') root.classList.add('light'); else root.classList.remove('light');

        const btn = document.getElementById('toggleTheme');
        if (btn) {
            btn.addEventListener('click', () => {
                root.classList.toggle('light');
                localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
            });
        }
    })();
</script>
</body>
</html>
