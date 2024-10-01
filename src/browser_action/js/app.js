// if we're in Firefox then we have browser object
const IS_FIREFOX = (typeof(browser) !== 'undefined');
// Firefox also supports chrome.storage.sync, maybe use it?
const STORAGE = IS_FIREFOX ? chrome.storage.local : chrome.storage.local;

let dontClose = false;
// chrome.action.setBadgeText({ text: '' });

let startProxy = function (item) {
    $('.middle-panel ul .active').removeClass('active');
    item.addClass('active');
    if (item.data('address')) {
        let config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: $('#proto-selector').val(),
                    host: item.data('ip'),
                    port: parseInt($('#port-selector').val())
                },
                bypassList: ["api1.sstpcon.com", "chrome://*", "<local>"]
            }
        };

        chrome.runtime.sendMessage({
            command: "setProxyConfig",
            config: config,
            activeServer: item.data('address')
        }, function (response) {
            if (dontClose) {
                dontClose = false;
            } else {
                setTimeout(function () {
                    window.close();
                }, 500);
            }
        });
    } else {
        chrome.runtime.sendMessage({ command: "clearProxyConfig" });
    }
};

let drawProxyList = function (proxyList, activeServer) {
    let panel = $('.middle-panel ul');
    panel.html('');
    let disable_item = $('<li><span>Disable HideIPVPN</span></li>');
    if (activeServer === '') {
        disable_item.addClass('active');
    }
    disable_item.click(function () {
        $('.middle-panel ul .active').removeClass('active');
        disable_item.addClass('active');
        chrome.runtime.sendMessage({ command: "clearProxyConfig" });
    });
    panel.append(disable_item);

    proxyList.forEach(function (country) {
        country.forEach(function (server) {
            let item = $('<li></li>');

            item.append($('<span>').text(server.countryName + ', ' + server.name));
            item.addClass('flag-' + server.countryCode.toLowerCase());
            item.data('port', server.port);
            item.data('ip', server.IP);
            item.data('address', server.address);
            item.data('connection_Name', server.connection_Name);
            if (server.connection_Name == 'HTTP(S)') {
                item.attr('data-proto', 'http');
            } else if (server.connection_Name == 'SOCKS5') {
                item.attr('data-proto', 'socks5');
            }
            if (activeServer === server.address) {
                item.addClass('active');
            }

            // Attach the click event handler after the item is fully initialized
            item.click(function (e) {
                startProxy(item);
            });

            panel.append(item);
        });
    });

    $('.middle-panel ul li[data-proto]').hide();
    $('.middle-panel ul li[data-proto=' + $('#proto-selector').val() + ']').show();

    $('.main-window').show();
    $('.login-content').hide();
};


let showProxyList = function (user, pass) {
    $.get('https://api1.sstpcon.com/proxyapi.php', { user: user, pass: pass }, function (result) {
        result = $(result);
        let code = result.find('result code').text();
        if (code == "00") {
            STORAGE.set({
                user: user,
                pass: pass
            });
            chrome.runtime.sendMessage({
                command: "sendAuthData",
                auth: {
                    username: user,
                    password: pass
                }
            }, function (response) { });
            let country_order = {};
            result.find('package countrySortOrder').text().split(',').forEach(function (item) {
                country_order[item] = [];
            });

            result.find('server').each(function () {
                let server = $(this);
                let server_object = {
                    countryName: server.find('countryName').text(),
                    name: server.find('name').text(),
                    address: server.find('address').text(),
                    port: server.find('port').text(),
                    IP: server.find('IP').text(),
                    connection_Name: server.find('connection_Name').text(),
                    sortOrder: parseInt(server.find('sortOrder').text()),
                    countryCode: server.find('countryCode').text()
                };
                let code = server_object.countryCode;
                if (!country_order[code]) {
                    country_order[code] = [];
                }
                country_order[code].push(server_object);
            });

            for (let code in country_order) {
                country_order[code].sort(function (a, b) {
                    return a.sortOrder - b.sortOrder;
                });
            }

            let sortedProxyList = Object.values(country_order);

            chrome.runtime.sendMessage({
                command: "saveSortedProxyList",
                sortedProxyList: sortedProxyList
            }, function (response) { });
            drawProxyList(sortedProxyList, '');
        } else {
            chrome.notifications.create({
                type: "basic",
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: 'Error',
                message: result.find('result description').text()
            });
            STORAGE.remove(['user', 'pass'], function () {
                $('.login-content').show();
                $('.main-window').hide();
            });
        }
    });
};

chrome.storage.local.get(['sortedProxyList', 'activeServer'], function (result) {
    if (result && result.sortedProxyList && result.activeServer) {
        // Draw the proxy list using stored data
        //drawProxyList(result.sortedProxyList, result.activeServer);
        drawProxyList(result.sortedProxyList, result.activeServer);
    } else {
        STORAGE.get(['user', 'pass', 'port', 'proto', 'last_user', 'last_pass', 'webrtc_prot'], function (result) {
            if (result.last_user) {
                $('#username').val(result.last_user);
            }
            if (result.last_pass) {
                $('#password').val(result.last_pass);
            }
            if (result.port) {
                $('#port-selector').val(result.port);
            }
            if (result.proto && IS_FIREFOX) {
                $('#proto-selector').val(result.proto);
            } else {
                $('#proto-selector').val('http');
            }
            if (result.webrtc_prot) {
                $('#webrtc-check')[0].checked = true;
            }
            $('#port-selector').closest('li').show();
            $('#port-selector option').hide();
            $('#port-selector option[data-proto=' + $('#proto-selector').val() + ']').show();
            if ($('#proto-selector').val() == 'socks5') {
                $('#port-selector').closest('li').hide();
            }
            if (result && result.pass && result.user) {
                chrome.runtime.sendMessage({ command: "getSortedProxyList" }, function (sortedProxyList) {
                    if (sortedProxyList) {
                        drawProxyList(sortedProxyList, '');
                    } else {
                        $('.login-content').show();
                    }
                });
            } else {
                $('.login-content').show();
            }
        });
    }
});

$('#login-form').on('submit', function (e) {
    e.stopImmediatePropagation();
    let user = $('#username').val();
    let pass = $('#password').val();
    STORAGE.set({
        last_user: user,
        last_pass: pass
    });

    showProxyList(user, pass);

    return false;
});

$('.top-panel .settings').click(function (e) {
    e.stopPropagation();
});

$('.main-window').click(function () {
    $('.main-window .top-panel .settings').removeClass('active');
});

$('.main-window .top-panel .menu').click(function (e) {
    e.stopImmediatePropagation();
    let menu = $('.main-window .top-panel .settings');
    if (menu.hasClass('active')) {
        menu.removeClass('active');
    } else {
        menu.addClass('active');
    }
});

$('#signout').click(function () {
    chrome.runtime.sendMessage({ command: "clearProxyList" });
    chrome.runtime.sendMessage({ command: "clearProxyConfig" });
    STORAGE.remove(['user', 'pass'], function () {
        $('.login-content').show();
        $('.main-window').hide();
        $('.main-window .top-panel .settings').removeClass('active');
    });
});

$('#show-settings').click(function () {
    $('.login-content').hide();
    $('.main-window').hide();
    $('.settings-window').show();
    $('.main-window .top-panel .settings').removeClass('active');
});

$('#settings-back-button').click(function () {
    $('.login-content').hide();
    $('.main-window').show();
    $('.settings-window').hide();
});

$('#port-selector').change(function () {
    let self = $(this);
    STORAGE.set({
        port: self.val()
    }, function () {
        dontClose = true;
        $('.middle-panel ul .active').click();
    });
});

$('#proto-selector').change(function () {
    let self = $(this);
    $('#port-selector').closest('li').show();
    $('#port-selector option').hide();
    $('#port-selector option[data-proto=' + self.val() + ']').show();
    $('#port-selector').val($('#port-selector option[data-proto=' + self.val() + ']').eq(0).val());
    if ($('#proto-selector').val() == 'socks5') {
        $('#port-selector').closest('li').hide();
    }
    STORAGE.set({
        proto: self.val(),
        port: $('#port-selector').val()
    }, function () {
        dontClose = true;
        $('.middle-panel ul li').eq(0).click();
        $('.middle-panel ul li[data-proto]').hide();
        $('.middle-panel ul li[data-proto=' + self.val() + ']').show();
    });
});

$('#webrtc-check').change(function () {
    let self = this;
    STORAGE.set({
        webrtc_prot: self.checked
    }, function () {
        dontClose = true;
    });
    chrome.privacy.network.webRTCIPHandlingPolicy.set({
        value: self.checked ? (IS_FIREFOX ? 'proxy_only' : 'disable_non_proxied_udp') : 'default_public_and_private_interfaces'
    });
});

if (!IS_FIREFOX) {
    $('#proto-selector').closest('li').hide();
}
