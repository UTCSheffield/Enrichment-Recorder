/* Shared floating student menu for activity and event forms. */
window.StudentPicker = (() => {
    const menus = new Set();
    function attach(dropdown, trigger, onOpen) {
        const overlay = dropdown.closest('.modal-overlay');
        dropdown.classList.add('student-picker-popover');
        function close() { dropdown.hidden = true; dropdown.style.display = 'none'; trigger.setAttribute('aria-expanded', 'false'); }
        function open() {
            menus.forEach(menu => menu.close());
            onOpen();
            overlay.append(dropdown);
            dropdown.hidden = false; dropdown.style.display = 'flex';
            trigger.setAttribute('aria-expanded', 'true');
            position();
            dropdown.querySelector('input')?.focus({preventScroll:true});
        }
        function position() {
            if (dropdown.hidden) return;
            const rect = trigger.getBoundingClientRect();
            const footer = overlay.querySelector('.modal-footer').getBoundingClientRect();
            const width = Math.min(250, window.innerWidth - 32);
            dropdown.style.width = `${width}px`;
            dropdown.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`;
            const height = dropdown.offsetHeight;
            const below = rect.bottom + 4;
            dropdown.style.top = `${Math.max(16, below + height <= footer.top - 8 ? below : rect.top - height - 4)}px`;
        }
        trigger.addEventListener('click', e => { e.stopPropagation(); dropdown.hidden || dropdown.style.display === 'none' ? open() : close(); });
        document.addEventListener('click', e => { if (!dropdown.contains(e.target) && !trigger.contains(e.target)) close(); });
        dropdown.addEventListener('keydown', e => { if(e.key === 'Escape') { e.stopPropagation(); close(); trigger.focus(); } });
        window.addEventListener('resize', position);
        document.addEventListener('scroll', e => { if(!dropdown.contains(e.target)) position(); }, true);
        new MutationObserver(() => { if(!overlay.classList.contains('active')) close(); }).observe(overlay, {attributes:true, attributeFilter:['class']});
        const menu = {open, close}; menus.add(menu); close(); return menu;
    }
    return {attach};
})();
