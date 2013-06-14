/*
  Copyright 2012 Christopher Hoobin. All rights reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are
  met:

  1. Redistributions of source code must retain the above copyright
  notice, this list of conditions and the following disclaimer.

  2. Redistributions in binary form must reproduce the above
  copyright notice, this list of conditions and the following
  disclaimer in the documentation and/or other materials provided
  with the distribution.

  THIS SOFTWARE IS PROVIDED BY CHRISTOPHER HOOBIN ''AS IS'' AND ANY
  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
  PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL CHRISTOPHER HOOBIN OR
  CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
  PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

  The views and conclusions contained in the software and documentation
  are those of the authors and should not be interpreted as representing
  official policies, either expressed or implied, of Christopher Hoobin.
*/

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");

Cmis.menu = {
    inject: function(window) {
        let context = window.document.getElementById("contentAreaContextMenu");

        Cmis.menu.wipe(context);

        let document = window.document;

        let list = Cmis.preferences.value("directoryList");

        if (list === "")
            return;

        let items = JSON.parse(list);

        let placement = Cmis.preferences.value("itemPlacement");

        // https://developer.mozilla.org/en/FirefoxOverlayPoints/Menus

        let saveimage = document.getElementById("context-saveimage");

        let sendimage = document.getElementById("context-sendimage");

        let child = context.firstChild;

        let parent = [null];

        let depth = [0];

        let item;

        let i = 0;

        while (i < items.length) {
            if (items[i].depth < depth[depth.length - 1]) {
                parent.pop();
                depth.pop();
                continue;
            }

            if (items[i].type === "submenu") {
                item = document.createElement("menu");
                item.setAttribute("label", items[i].name);

                let popup = document.createElement("menupopup");
                popup.setAttribute("id", "context-cmis-item-" + i);

                item.appendChild(popup);

                depth.push(items[i].depth + 1); // Add one to match child depth

                if (items[i].depth > 0) {
                    parent[parent.length - 1].appendChild(item);
                    parent.push(popup);
                    i++;
                    continue;
                }

                parent.push(popup);
            }
            else if (items[i].type === "separator") {
                item = document.createElement("menuseparator");
            }
            else {
                item = document.createElement("menuitem");

                item.setAttribute("label", items[i].name);

                if (items[i].type === "settings")
                    item.addEventListener("command", Cmis.menu.loadoptions, false);
                else { // data.type === "item"
                    item.addEventListener("command", Cmis.menu.save, false);

                    if (!Cmis.utility.isValidPath(items[i].path)) {
                        item.setAttribute("class", "menuitem-iconic");
                        item.setAttribute("image", "chrome://cmis/skin/error.png");
                    }
                }
            }

            item.setAttribute("id", "context-cmis-item-" + i);

            // Check to see if we append to the top of the parent
            // stack or the actual context menu.
            if (items[i].depth > 0 &&
                items[i].depth == depth[depth.length - 1]) {
                parent[parent.length - 1].appendChild(item);
                i++;
                continue;
            }

            switch(placement) {
            case 0: // at top of context menu
                context.insertBefore(item, child);
                break;
            case 1: // at bottom of context menu
                context.appendChild(item);
                break;
            case 2: // above 'Save As' menu item
                context.insertBefore(item, saveimage);
                break;
            case 3: // bellow 'Save As' menu item (above 'Send Image' menu item)
                context.insertBefore(item, sendimage);
                break;
            }

            i++;
        }
    },

    toggle: function(context, hidden, ontype) {
        let children = context.childNodes;

        for (let i = children.length - 1; i >= 0; i--) {
            if (children[i].id.indexOf("context-cmis-item-") == 0) {
                children[i].hidden = hidden;

                if (hidden === true)
                    continue;

                let label = children[i].label;

                // XXX translations for Image and Link
                if (label.indexOf(ontype) == -1) {
                    if (ontype === "Image")
                        children[i].label = label.replace(/Link/, "Image");
                    else if (ontype === "Link")
                        children[i].label = label.replace(/Image/, "Link");
                    // Otherwise... fuck it... :D
                }
            }
        }

        let hide = Cmis.preferences.value("hideDefaultSaveAs");

        if (hide) {
            let window = Services.ww.activeWindow;
            let saveimage = window.document.getElementById("context-saveimage");
            saveimage.hidden = true;
        }
    },

    wipe: function(context) {
        let children = context.childNodes;

        for (let i = children.length - 1; i >= 0; i--) {
            if (children[i].id.indexOf("context-cmis-item-") == 0)
                context.removeChild(children[i]);
        }
    },

    display: function(event) {
        let window = event.view;

        let gContextMenu = window.gContextMenu;

        if (!gContextMenu) return;

        let context = window.document.getElementById("contentAreaContextMenu");

        let saveLinks = Cmis.preferences.value("saveLinks");

        if (gContextMenu.onImage)
            Cmis.menu.toggle(context, false, "Image");
        else if (saveLinks && !gContextMenu.onImage && gContextMenu.onLink)
            Cmis.menu.toggle(context, false, "Link");
        else
            Cmis.menu.toggle(context, true);
    },

    save: function(event) {
        let window = event.view;

        let index = parseInt(event.target.id.replace(/context-cmis-item-/, ""));

        let saveLinks = Cmis.preferences.value("saveLinks");

        let gContextMenu = window.gContextMenu;

        let url;

        if (gContextMenu.onImage)
            url = gContextMenu.imageURL;
        else if (saveLinks && !gContextMenu.onImage && gContextMenu.onLink)
            url = gContextMenu.link;

        let source = NetUtil.newURI(url);

        let [target, filename] = Cmis.utility.target(event, index, source, null, false);

        if (!target) return;

        Cmis.io.save(window, source, target, filename);

        Cmis.preferences.value("previousDirectoryIndex", index);
    },

    quicksave: function(event) {
        let window = event.view;

        if (!event.ctrlKey)
            return;

        // rmb == 2 (https://developer.mozilla.org/en/DOM/Event)
        if (event.button != 2)
            return;

        let enabled = Cmis.preferences.value("quickSaveEnabled");

        if (!enabled)
            return;

        let saveLinks = Cmis.preferences.value("saveLinks");

        if (saveLinks) {
            if (event.originalTarget.tagName != "A" &&
                event.originalTarget.tagName != "IMG")
                return;
        }

        if (!saveLinks && event.originalTarget.tagName != "IMG")
            return;

        event.stopPropagation();

        event.preventDefault();

        let index = Cmis.preferences.value("previousDirectoryIndex");

        if (index == -1) {
            let bundle = Cmis.utility.stringBundle();

            Services.prompt.alert(
                null,
                bundle.GetStringFromName("errorPromptTitle"),
                bundle.GetStringFromName("errorPromptSaveMessage"));

            Services.strings.flushBundles();

            return;
        }

        let alt = event.originalTarget.alt;

        let source = NetUtil.newURI(event.originalTarget.src);

        let [target, filename] = Cmis.utility.target(event, index, source, alt, true);

        if (!target) return;

        Cmis.io.save(window, source, target, filename);

        Cmis.preferences.value("previousDirectoryIndex", index);
    },

    loadoptions: function() {
        let window = Services.ww.getWindowByName("cmis-items", Services.ww.activeWindow);

        if (window) {
            window.focus();
            return;
        }

        Services.ww.openWindow(
            null,
            "chrome://cmis/content/items.xul",
            "cmis-items",
            "dialog,chrome,centerscreen,resizable=yes,scrollbars=no,close=no",
            null);
    },

    observe: function(subject, topic, data) {
        let windows = Services.wm.getEnumerator("navigator:browser");

        while (windows.hasMoreElements()) {
            Cmis.menu.inject(windows.getNext());
        }
    }
};
