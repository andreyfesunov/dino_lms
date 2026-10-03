use topcoat::{
    Result,
    context::Cx,
    router::{Slot, layout, request::uri},
    tailwind,
    view::{View, view},
};

use crate::{
    components::app_sidebar,
    i18n::{locale_code, t},
    session::current_user,
};

#[layout("/")]
async fn root_layout(cx: &Cx, slot: Slot<'_>) -> Result<impl View> {
    let lang = locale_code(cx);
    let brand = t(cx, "brand-title");
    let path = uri(cx).path();
    let is_login = path == "/login";
    let is_setup = path == "/setup";
    let is_onboarding = path == "/onboarding";
    let signed_in = current_user(cx).await?.is_some();
    let is_welcome = path == "/" && !signed_in;
    let bare = is_login || is_setup || is_onboarding || is_welcome;
    let show_shell = signed_in && !bare;

    Ok(view! {
        <!DOCTYPE html>
        <html lang=(lang) class="h-full">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>(brand.clone())</title>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500;600;700&family=Geist:wght@400;500;600&display=swap"
                />
                <link rel="stylesheet" href=(tailwind::stylesheet!()) />
                topcoat::runtime::script()
                topcoat::dev::script()
                <script>
                    "document.addEventListener('click', function (e) { var b = e.target.closest('[data-copy]'); if (!b || !navigator.clipboard) return; navigator.clipboard.writeText(b.getAttribute('data-copy')); });"
                </script>
                <script>
                    r#"
                    // Client-side sync of the users-page selection UI. Reactive
                    // bindings on this page are effectively one-shot after the
                    // first swap patch, so the change handlers keep bar
                    // visibility, the counter and the header checkbox in sync
                    // directly from the `selected` CSV. NOTE: no angle brackets
                    // allowed here — topcoat escapes script contents.
                    window.__usersSelectionSync = function () {
                      var csv = window.__usersSelected || '';
                      var ids = csv === '' ? [] : csv.split(',').filter(function (x) { return x !== ''; });
                      var bar = document.getElementById('users-bulk-bar');
                      if (bar) {
                        bar.hidden = ids.length === 0;
                      }
                      var cnt = document.getElementById('users-bulk-count');
                      if (cnt) {
                        var tpl = cnt.getAttribute('data-count-tpl') || 'Selected: {COUNT}';
                        var textNodes = [];
                        for (var i = 0; i !== cnt.childNodes.length; i++) {
                          var n = cnt.childNodes[i];
                          if (n.nodeType === 3) { textNodes.push(n); }
                        }
                        var nul = '[', close = ']';
                        var token = nul + nul + 'COUNT' + close + close;
                        var text = tpl.split(token).join(String(ids.length)).split('{COUNT}').join(String(ids.length));
                        if (textNodes.length !== 0) {
                          textNodes[0].textContent = text;
                        } else {
                          cnt.appendChild(document.createTextNode(text));
                        }
                      }
                      var head = document.getElementById('users-select-all');
                      if (head) {
                        var sc = head.getAttribute('data-selectable') || '';
                        var selectable = sc === '' ? [] : sc.split(',').filter(function (x) { return x !== ''; });
                        head.checked = selectable.length !== 0 ? selectable.every(function (x) { return ids.indexOf(x) !== -1; }) : false;
                      }
                      var rows = document.querySelectorAll('input[type=checkbox][data-user-id]');
                      for (var j = 0; j !== rows.length; j++) {
                        var r = rows[j];
                        if (!r.disabled) {
                          r.checked = ids.indexOf(r.getAttribute('data-user-id') || '') !== -1;
                        }
                      }
                    };
                    // Topcoat drops swap patches after the first one, so row
                    // checkbox handlers go stale; keep selection in sync via a
                    // delegated capture listener instead and own the event
                    // fully (stopPropagation keeps stale handlers away).
                    document.addEventListener('change', function (e) {
                      var t = e.target;
                      if (t) {
                        if (t.matches) {
                          if (t.matches('input[type=checkbox][data-user-id]')) {
                            e.stopPropagation();
                            var csv = window.__usersSelected || '';
                            var parts = csv === '' ? [] : csv.split(',').filter(function (x) { return x !== ''; });
                            var id = t.getAttribute('data-user-id');
                            var idx = parts.indexOf(id);
                            if (t.checked) {
                              if (idx === -1) { parts.push(id); }
                            } else if (idx !== -1) {
                              parts.splice(idx, 1);
                            }
                            window.__usersSelected = parts.join(',');
                            if (window.__usersSelectionSync) { window.__usersSelectionSync(); }
                          }
                        }
                      }
                    }, true);
                    "#
                </script>
            </head>
            <body class="min-h-full bg-bg font-body text-text antialiased">
                if show_shell {
                    <div class="flex min-h-screen gap-4 p-4 pb-24 md:pb-4">
                        app_sidebar()
                        <main class="min-w-0 flex-1">(slot)</main>
                    </div>
                } else {
                    <div class="contents">(slot)</div>
                }
            </body>
        </html>
    })
}
