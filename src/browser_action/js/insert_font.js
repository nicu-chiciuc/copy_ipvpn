let fa = document.createElement('style');
fa.type = 'text/css';
fa.textContent = '@font-face { font-family: SFUIText; src: url("' +
    chrome.runtime.getURL('src/browser_action/font/SFUIText-Regular.woff') +
    '"); }';
document.head.appendChild(fa);
