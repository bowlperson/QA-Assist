function initNavigation(activePage) {
    const navButtons = document.querySelectorAll('[data-nav-target]');
    navButtons.forEach((button) => {
        const target = button.getAttribute('data-nav-target');
        if (target === activePage) {
            button.classList.add('active');
        }
        button.addEventListener('click', () => {
            const url = chrome.runtime.getURL(target);
            if (window.location.href === url) {
                return;
            }
            window.location.href = url;
        });
    });
}
