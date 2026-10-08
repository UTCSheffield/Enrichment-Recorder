(() => {
    const form = document.querySelector('#authCheckForm');
    if (!form) return;
    const password = document.querySelector('#authCheckPassword');
    const result = document.querySelector('#authCheckResult');
    const button = form.querySelector('button');
    const revealButton = document.querySelector('#authRevealBtn');
    const loadedArea = document.querySelector('#authLoadedPasswordArea');
    const loadedPassword = document.querySelector('#authLoadedPassword');
    const revealStatus = document.querySelector('#authRevealStatus');
    const settings = document.querySelector('#settingsArea');
    let revealRequest = null;
    function hideLoadedPassword() {
        revealRequest?.abort();
        revealRequest = null;
        loadedPassword.textContent = '';
        loadedArea.hidden = true;
        revealButton.textContent = 'Show configured password';
        revealButton.setAttribute('aria-expanded', 'false');
        revealButton.disabled = false;
        revealStatus.textContent = '';
    }
    revealButton.addEventListener('click', async () => {
        if (!loadedArea.hidden) { hideLoadedPassword(); return; }
        const request = new AbortController();
        revealRequest = request;
        revealButton.disabled = true;
        revealStatus.textContent = 'Reading this server’s configured password…';
        try {
            const response = await fetch('/?action=reveal_super_admin_password', {
                method: 'POST', cache: 'no-store', signal: request.signal,
                body: new URLSearchParams({token: form.dataset.token})
            });
            if (response.status === 401) throw new Error('Your session expired. Sign in again to show the password.');
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || 'The configured password could not be read.');
            if (request.signal.aborted || settings.style.display === 'none' || document.hidden) return;
            document.querySelector('#authConfigStatus').textContent = data.status.message;
            if (data.password === null || data.password === '') {
                revealStatus.textContent = data.status.message;
            } else {
                loadedPassword.textContent = data.password;
                loadedArea.hidden = false;
                revealButton.textContent = 'Hide configured password';
                revealButton.setAttribute('aria-expanded', 'true');
                revealStatus.textContent = '';
            }
        } catch (error) {
            if (!request.signal.aborted) revealStatus.textContent = error.message || 'The configured password could not be read.';
        } finally {
            if (revealRequest === request) { revealRequest = null; revealButton.disabled = false; }
        }
    });
    new MutationObserver(() => {
        if (settings.style.display === 'none') hideLoadedPassword();
    }).observe(settings, {attributes: true, attributeFilter: ['style']});
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideLoadedPassword(); });
    window.addEventListener('pagehide', hideLoadedPassword);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const body = new URLSearchParams({password: password.value, token: form.dataset.token});
        password.value = '';
        button.disabled = true;
        result.textContent = 'Checking this server…';
        try {
            const response = await fetch('/?action=check_super_admin_password', {method: 'POST', body});
            if (response.status === 401) throw new Error('Your session expired. Sign in again to run the check.');
            const data = await response.json();
            if (data.error === 'Unknown action') throw new Error('This check reached app code that does not support it. The deployment may be serving an older app instance.');
            if (!response.ok || data.error) throw new Error(data.error || 'The password check failed.');
            const pageCode = document.querySelector('#authCodeId').textContent;
            if (pageCode !== data.status.code_id) {
                result.textContent = 'This check reached different app code from the Settings page. The deployment may be serving more than one app version.';
            } else if (data.matches) {
                result.textContent = 'The password matches the Super Admin password loaded by this server.';
            } else if (data.status.state === 'configured' || data.status.state === 'default') {
                result.textContent = 'The password does not match the Super Admin password loaded by this server.';
            } else {
                result.textContent = data.status.message;
            }
            document.querySelector('#authConfigStatus').textContent = data.status.message;
        } catch (error) {
            result.textContent = error.message || 'The check could not reach the server.';
        } finally {
            button.disabled = false;
        }
    });
})();
