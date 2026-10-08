(() => {
    const form = document.querySelector('#authCheckForm');
    if (!form) return;
    const password = document.querySelector('#authCheckPassword');
    const result = document.querySelector('#authCheckResult');
    const button = form.querySelector('button');
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
