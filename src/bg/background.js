// Determine if the environment is Firefox
const IS_FIREFOX = (typeof(browser) !== 'undefined');
const STORAGE = IS_FIREFOX ? chrome.storage.local : chrome.storage.sync;

let activeServer = '';
let sortedProxyList = false;
let proxy_username = false;
let proxy_password = false;
let currentProxyObject = { type: 'direct' };
let authProxyAttempts = 0;

function isLocalIPv4(host) {
    var octets = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (!octets) return false;
    if (octets[1] > 255 || octets[2] > 255 || octets[3] > 255 || octets[4] > 255) return false;
    if (octets[1] == 10 || octets[1] == 127) return true; // class A or local loopback
    if (octets[1] == 172 && octets[2] >= 16 && octets[2] <= 31) return true; // class B
    if (octets[1] == 192 && octets[2] == 168) return true; // class C
    return false;
}

function isLocal(host) {
    if (host.indexOf('.') == -1) return true;
    if (host.endsWith(".local")) return true;
    if (host == "::1") return true;
    return isLocalIPv4(host);
}

function proxyAuth(details, callback) {
    console.log('Auth!!!');
    console.log('Auth details:', details);
    console.log('Auth callback:', callback);
    console.log('Auth Credentials:', { username: proxy_username, password: proxy_password });

    // Check if credentials are missing
    if (!proxy_username || !proxy_password) {
        console.log('Credentials are missing, retrieving from storage...');

        // Retrieve credentials from chrome.storage.local
        chrome.storage.local.get(['user', 'pass'], function(result) {
            if (result.user && result.pass) {
                proxy_username = result.user;
                proxy_password = result.pass;
                console.log('Credentials retrieved:', { username: proxy_username, password: proxy_password });

                // Attempt to authenticate now that credentials are available
                if (details.isProxy) {
                    if (typeof callback === 'function') {
                        callback({ authCredentials: { username: proxy_username, password: proxy_password } });
                    }
                } else {
                    if (typeof callback === 'function') {
                        callback({});
                    }
                }
            } else {
                console.log('No credentials found in storage');
                if (typeof callback === 'function') {
                    callback({});
                }
            }
        });

        return; // Exit the function after setting the credentials
    }

    authProxyAttempts++;
    console.log('authProxyAttempts:', authProxyAttempts);

    if (authProxyAttempts > 10) {
        chrome.proxy.settings.clear({ scope: 'regular' }, function() {
            chrome.webRequest.onAuthRequired.removeListener(proxyAuth);
        });
        chrome.action.setIcon({ path: { "19": "icons/icon19.png" } });
        STORAGE.remove(['user', 'pass']);
        chrome.storage.local.set({ activeServer: '' });
        activeServer = '';
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
        chrome.notifications.create({
            type: "basic",
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: 'Error',
            message: 'Server authentication failed! Login details may be incorrect or subscription expired.'
        });
    }

    if (details.isProxy && proxy_username && proxy_password) {
        console.log('Sending credentials:', { username: proxy_username, password: proxy_password });
        if (typeof callback === 'function') {
            callback({ authCredentials: { username: proxy_username, password: proxy_password } });
        }
    } else {
        console.log('No credentials sent');
        if (typeof callback === 'function') {
            callback({});
        }
    }
    
    return { authCredentials: { username: proxy_username, password: proxy_password } };
}


setInterval(function() {
    authProxyAttempts = 0;
}, 20000);

function proxyEnabledOnLoad() {
    STORAGE.get(['user', 'pass'], function(result) {
        proxy_username = result.user;
        proxy_password = result.pass;
        chrome.webRequest.onAuthRequired.addListener(
            proxyAuth,
            { urls: ["<all_urls>"] },
            ['blocking']
        );
        chrome.storage.local.get(['sortedProxyList', 'activeServer'], function(result) {
            if (result.sortedProxyList && result.activeServer) {
                sortedProxyList = result.sortedProxyList;
                activeServer = result.activeServer;
            }
        });
       // chrome.action.setIcon({ path: { "19": "icons/icon19-active.png" } });
    });
}

// Restore state on service worker wake-up
function restoreState() {
    STORAGE.get([
        'activeServer', 
        'sortedProxyList', 
        'proxy_username', 
        'proxy_password', 
        'currentProxyObject'
    ], function(items) {
        activeServer = items.activeServer || '';
        sortedProxyList = items.sortedProxyList || false;
        proxy_username = items.proxy_username || false;
        proxy_password = items.proxy_password || false;
        currentProxyObject = items.currentProxyObject || { type: 'direct' };
    });
}


restoreState();

console.log('active server after restore start - ');
console.log(activeServer);
console.log(' - active server after restore end');

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {

    console.log(request);
    if (request.command === 'sendAuthData') {
        console.log('this is the request ' . request)
        proxy_username = request.auth.username;
        proxy_password = request.auth.password;
        sendResponse();
    } else if (request.command === 'setProxyConfig') {
        activeServer = request.activeServer;
        chrome.storage.local.set({ activeServer: activeServer });
        if (!chrome.webRequest.onAuthRequired.hasListener(proxyAuth)) {
            chrome.webRequest.onAuthRequired.addListener(
                proxyAuth,
                { urls: ["<all_urls>"] },
                ['blocking']
            );
        }
        console.log('set proxy', request.config);
        //chrome.action.setIcon({ path: { "19": "icons/icon19-active.png" } });
        // here should be the proxy connection
        chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            if (request.command === 'setProxyConfig') {
                // Assuming request.config contains your proxy configuration
                chrome.proxy.settings.set(
                    { value: request.config, scope: 'regular' },
                    function () {
                        // Do something after setting proxy settings
                        console.log('Proxy settings applied successfully');
                        console.log('Request config for chrome proxy settings set - ' + JSON.stringify(request.config));
                        chrome.action.setIcon({ path: { "19": "icons/icon19-active.png" } });
                        // ...
                    }
                );

                // If you need to perform actions after the proxy settings are applied
                // For example, making an HTTP request to a specific URL
                // fetch('https://hideipvpn.com')
                //     .then(response => {
                //         // Handle the response
                //         console.log('HTTP request successful:', response);
                //     })
                //     .catch(error => {
                //         // Handle errors
                //         console.error('Error making HTTP request:', error);
                //     });

                // Continue with other logic as needed
                // ...
            }
            // Handle other message types if necessary
        });

        // end proxy connection

    } else if (request.command === 'saveSortedProxyList') {
        sortedProxyList = request.sortedProxyList;
        chrome.storage.local.set({ sortedProxyList: sortedProxyList });
    } else if (request.command === 'getSortedProxyList') {
        sendResponse(sortedProxyList);
    } else if (request.command === 'clearProxyList') {
        sortedProxyList = false;
        sendResponse();
    } else if (request.command === 'clearProxyConfig') {
        chrome.proxy.settings.clear({ scope: 'regular' }, function() {
            chrome.webRequest.onAuthRequired.removeListener(proxyAuth);
        });
        chrome.action.setIcon({ path: { "19": "icons/icon19.png" } });
        chrome.storage.local.set({ activeServer: '' });
        activeServer = '';
    } else if (request.command === 'getActiveServer') {
        sendResponse(activeServer);
    }
    return true;
});

chrome.proxy.onProxyError.addListener(function(details) {
    //console.log(details);
});

if (IS_FIREFOX) {
    // Firefox-specific initialization code
    // ...
}

// Additional initialization code for Chrome or general use
// ...
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});
