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

let moongiraffe = {};

moongiraffe.Cmis = {};

moongiraffe.Cmis.window = {
    startup: function() {
        Services.ww.registerNotification(moongiraffe.Cmis.window);

        let windows = Services.wm.getEnumerator("navigator:browser");

        while (windows.hasMoreElements()) {
            moongiraffe.Cmis.window.add(windows.getNext());
        }
    },

    shutdown: function() {
        Services.ww.unregisterNotification(moongiraffe.Cmis.window);

        let windows = Services.wm.getEnumerator("navigator:browser");

        while (windows.hasMoreElements()) {
            moongiraffe.Cmis.window.remove(windows.getNext());
        }
    },

    add: function(window) {
        window.addEventListener("contextmenu", moongiraffe.Cmis.menu.quicksave, false);

        let context = window.document.getElementById("contentAreaContextMenu");

        if (!context) {
            return;
        }

        context.addEventListener("popupshowing", moongiraffe.Cmis.menu.display, false);

        moongiraffe.Cmis.menu.inject(window);
    },

    remove: function(window) {
        window.removeEventListener("contextmenu", moongiraffe.Cmis.menu.quicksave);

        let context = window.document.getElementById("contentAreaContextMenu");

        context.removeEventListener("popupshowing", moongiraffe.Cmis.menu.display, false);

        moongiraffe.Cmis.menu.wipe(context);
    },

    observe: function(subject, topic, data) {
        if (topic === "domwindowopened") {
            subject.addEventListener("load", function() {
                moongiraffe.Cmis.window.add(subject);
            }, false);
        }
    }
};

moongiraffe.Cmis.menu = {
    inject: function(window) {
        let context = window.document.getElementById("contentAreaContextMenu");

        moongiraffe.Cmis.menu.wipe(context);

        let document = window.document;

        let list = moongiraffe.Cmis.prefs.value("directoryList");

        if (list === "") {
            return;
        }

        let items = JSON.parse(list);

        let placement = moongiraffe.Cmis.prefs.value("itemPlacement");

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
                    item.addEventListener("command", moongiraffe.Cmis.menu.loadoptions, false);
                else // data.type === "item"
                    item.addEventListener("command", moongiraffe.Cmis.menu.save, false);
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

                if (hidden === true) {
                    continue;
                }

                let label = children[i].label;

                // XXX translations for Image and Link
                if (label.indexOf(ontype) == -1) {
                    if (ontype === "Image") {
                        children[i].label = label.replace(/Link/, "Image");
                    }
                    else if (ontype === "Link") {
                        children[i].label = label.replace(/Image/, "Link");
                    }
                    // Otherwise... fuck it... :D
                }
            }
        }

        let hide = moongiraffe.Cmis.prefs.value("hideDefaultSaveAs");

        if (hide) {
            let window = Services.ww.activeWindow;
            let saveimage = window.document.getElementById("context-saveimage");
            saveimage.hidden = true;
        }
    },

    wipe: function(context) {
        let children = context.childNodes;

        for (let i = children.length - 1; i >= 0; i--) {
            if (children[i].id.indexOf("context-cmis-item-") == 0) {
                context.removeChild(children[i]);
            }
        }
    },

    display: function(event) {
        let window = event.view;

        let gContextMenu = window.gContextMenu;

        let context = window.document.getElementById("contentAreaContextMenu");

        let saveLinks = moongiraffe.Cmis.prefs.value("saveLinks");

        if (gContextMenu.onImage) {
            moongiraffe.Cmis.menu.toggle(context, false, "Image");
        }
        else if (saveLinks && !gContextMenu.onImage && gContextMenu.onLink) {
            moongiraffe.Cmis.menu.toggle(context, false, "Link");
        }
        else {
            moongiraffe.Cmis.menu.toggle(context, true);
        }
    },

    save: function(event) {
        let window = event.view;

        let index = parseInt(event.target.id.replace(/context-cmis-item-/, ""));

        let saveLinks = moongiraffe.Cmis.prefs.value("saveLinks");

        let gContextMenu = window.gContextMenu;

        let url;

        if (gContextMenu.onImage) {
            url = gContextMenu.imageURL;
        }
        else if (saveLinks && !gContextMenu.onImage && gContextMenu.onLink) {
            url = gContextMenu.link;
        }

        let source = NetUtil.newURI(url);

        let [target, filename] = moongiraffe.Cmis.utils.target(window, index, source, null, false);

        moongiraffe.Cmis.io.save(source, target, filename);

        moongiraffe.Cmis.prefs.value("previousDirectoryIndex", index);
    },

    quicksave: function(event) {
        let window = event.view;

        if (!event.ctrlKey) {
            return;
        }

        // rmb == 2 (https://developer.mozilla.org/en/DOM/Event)
        if (event.button != 2) {
            return;
        }

        let enabled = moongiraffe.Cmis.prefs.value("quickSaveEnabled");

        if (!enabled) {
            return;
        }

        let saveLinks = moongiraffe.Cmis.prefs.value("saveLinks");

        if (saveLinks) {
            if (event.originalTarget.tagName != "A" &&
                event.originalTarget.tagName != "IMG")
                return;
        }

        if (!saveLinks && event.originalTarget.tagName != "IMG") {
            return;
        }

        event.stopPropagation();

        event.preventDefault();

        let index = moongiraffe.Cmis.prefs.value("previousDirectoryIndex");

        if (index == -1) {
            let bundle = Services.strings.createBundle("chrome://cmis/locale/prompt.properties");

            Services.prompt.alert(
                null,
                bundle.GetStringFromName("errorPromptTitle"),
                bundle.GetStringFromName("errorPromptSaveMessage"));

            Services.strings.flushBundles();

            return;
        }

        let alt = event.originalTarget.alt;

        let source = NetUtil.newURI(event.originalTarget.src);

        let [target, filename] = moongiraffe.Cmis.utils.target(window, index, source, alt, true);

        moongiraffe.Cmis.io.save(source, target, filename);

        moongiraffe.Cmis.prefs.value("previousDirectoryIndex", index);
    },

    loadoptions: function() {
        Services.ww.openWindow(
            null,
            "chrome://cmis/content/items.xul",
            null,
            "chrome,modal,centerscreen,resizable=yes,scrollbars=no",
            null);
    },

    observe: function(subject, topic, data) {
        let windows = Services.wm.getEnumerator("navigator:browser");

        while (windows.hasMoreElements()) {
            moongiraffe.Cmis.menu.inject(windows.getNext());
        }
    },
};

const PREFBRANCH = "extensions.cmis@moongiraffe.net.";

moongiraffe.Cmis.prefs = {
    startup: function() {
        moongiraffe.Cmis.prefs.defaults();

        moongiraffe.Cmis.prefs.value("previousDirectoryIndex", -1);

        Services.prefs.addObserver(PREFBRANCH + "directoryList", moongiraffe.Cmis.menu, false);
        Services.prefs.addObserver(PREFBRANCH + "itemPlacement", moongiraffe.Cmis.menu, false);

        Services.obs.addObserver(moongiraffe.Cmis.prefs, "addon-options-displayed", false);
    },

    shutdown: function() {
        Services.prefs.removeObserver(PREFBRANCH + "directoryList", moongiraffe.Cmis.menu);
        Services.prefs.removeObserver(PREFBRANCH + "itemPlacement", moongiraffe.Cmis.menu);

        Services.obs.removeObserver(moongiraffe.Cmis.prefs, "addon-options-displayed");
    },

    uninstall: function() {
        Services.prefs.deleteBranch(PREFBRANCH);
    },

    defaults: function() {
        let branch = Services.prefs.getDefaultBranch(PREFBRANCH);

        let string = Components.classes["@mozilla.org/supports-string;1"]
            .createInstance(Components.interfaces.nsISupportsString);

        string.data = "";

        branch.setComplexValue("directoryList", Components.interfaces.nsISupportsString, string);
        branch.setComplexValue("previousSaveAsDirectory", Components.interfaces.nsISupportsString, string);
        branch.setIntPref("itemPlacement", 0);
        branch.setIntPref("overwriteAction", 0);
        branch.setIntPref("previousDirectoryIndex", -1);
        branch.setBoolPref("quickSaveEnabled", true);
        branch.setBoolPref("saveLinks", false);
        branch.setBoolPref("statusbarNotification", false);
        branch.setBoolPref("hideDefaultSaveAs", false);
    },

    value: function(key, value) {
        let branch = Services.prefs.getBranch(PREFBRANCH);

        if (key === "directoryList" ||
            key === "previousSaveAsDirectory") {
            if (value !== undefined) {
                let string = Components.classes["@mozilla.org/supports-string;1"]
                    .createInstance(Components.interfaces.nsISupportsString);

                string.data = value;

                branch.setComplexValue(key, Components.interfaces.nsISupportsString, string);

                return;
            }

            return branch.getComplexValue(key, Components.interfaces.nsISupportsString).data;
        }

        let get = branch.getIntPref;
        let set = branch.setIntPref;

        if (key === "quickSaveEnabled" ||
            key === "saveLinks" ||
            key === "statusbarNotification" ||
            key === "hideDefaultSaveAs") {
            get = branch.getBoolPref;
            set = branch.setBoolPref;
        }

        if (value !== undefined) {
            set(key, value);
            return;
        }

        return get(key);
    },

    observe: function(subject, topic, data) {
        if (topic === "addon-options-displayed" && data === "cmis@choobin") {
            let document = subject;
            let button = document.getElementById("cmis-settings-button");
            button.addEventListener("command", function() {
                Services.ww.openWindow(
                    null,
                    "chrome://cmis/content/items.xul",
                    null,
                    "chrome,modal,centerscreen,resizable=yes,scrollbars=no",
                    null);
            }, false);
        }
    }
};

moongiraffe.Cmis.io = {
    save: function(source, target, filename) {
        let window = Services.ww.activeWindow;

        let privacy_context = null;

        let is_private = false;

        // As of Firefox 18, the `addDownload` and `saveURL` functions have changed to support per-window private browsing.
        if (Services.vc.compare(Services.appinfo.platformVersion, "18.0") >= 0) {
            privacy_context = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                .getInterface(Components.interfaces.nsIWebNavigation)
                .QueryInterface(Components.interfaces.nsILoadContext);

            is_private = privacy_context.usePrivateBrowsing;
        }

        // https://developer.mozilla.org/en/nsIWebBrowserPersist
        let persist = Components
            .classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
            .createInstance(Components.interfaces.nsIWebBrowserPersist);

        const nsIWebBrowserPersist = Components.interfaces.nsIWebBrowserPersist;

        persist.persistFlags =
            nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES |
            nsIWebBrowserPersist.PERSIST_FLAGS_FROM_CACHE |
            nsIWebBrowserPersist.PERSIST_FLAGS_CLEANUP_ON_FAILURE;

        const nsIDownloadManager = Components.interfaces.nsIDownloadManager;

        // https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDownloadManager
        let manager = Components
            .classes["@mozilla.org/download-manager;1"]
            .getService(nsIDownloadManager);

        let listener = manager.addDownload(
            nsIDownloadManager.DOWNLOAD_TYPE_DOWNLOAD,
            source,
            target,
            filename,
            null, // mime info
            null, // start time
            null, // tmp file
            persist,
            is_private);

        persist.progressListener = listener;

        persist.saveURI(source, null, null, null, null, target, privacy_context);

        let notify = moongiraffe.Cmis.prefs.value("statusbarNotification");

        if (notify) {
            if (window && window.XULBrowserWindow) { // XXX L10n
                window.XULBrowserWindow.setOverLink(filename + " saved", null);
            }
        }
    }
};

moongiraffe.Cmis.utils = {
    buildpath: function(window, data, filename) {
        let path = Components.classes["@mozilla.org/file/local;1"]
            .createInstance(Components.interfaces.nsILocalFile);

        path.initWithPath(data.path);

        if (!path.exists()) {
            path.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, parseInt("0700", 8));
        }

        path.append(filename);

        if (path.exists()) {
            // 0 -> prompt user
            // 1 -> save as unique file
            // 2 -> overwrite file
            let action = moongiraffe.Cmis.prefs.value("overwriteAction");

            if (action == 0) {
                // 0 -> overwrite file
                // 1 -> save as unique file
                // 2 -> cancel
                let result = moongiraffe.Cmis.utils.prompt(window, path);

                if (result == 2) {
                    return null;
                }

                // Note: The prompt.confirmEx call from utils.prompt
                // will always return 1 if the user closes the window
                // using the close button in the titlebar! See bug
                // "345067". In this case it is safer to save as a
                // unique file instead of overwriting.

                if (result == 1) {
                    // The user prompted to rename file... change
                    // action to 'save as unique file'.
                    action = 1;
                }
            }

            if (action == 1) {
                path = moongiraffe.Cmis.utils.uniq(path);
            }
        }

        return path;
    },

    promptpath: function(window, data, filename) {
        var nsIFilePicker = Components.interfaces.nsIFilePicker;

        var fp = Components.classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        fp.init(window, data.name, nsIFilePicker.modeSave);

        fp.defaultString = filename;

        if (data.path !== "") {
            let path = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsILocalFile);

            path.initWithPath(data.path);

            fp.displayDirectory = path;
        }

        fp.appendFilters(nsIFilePicker.filterAll);

        var res = fp.show();

        if (res == nsIFilePicker.returnCancel)
            return null;

        return fp.file;
    },

    prompt: function(window, path) {
        // https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIStringBundleService
        // https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIStringBundle
        let bundle = Services.strings.createBundle("chrome://cmis/locale/prompt.properties");

        // https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIPromptService
        let check = {value: false};

        let flags =
            Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_SAVE +
            Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING  +
            Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_CANCEL;

        let button = Services.prompt.confirmEx(
            null,
            bundle.GetStringFromName("savePromptTitle"),
            bundle.formatStringFromName("savePromptMessage", [path.leafName], 1),
            flags,
            null,
            bundle.GetStringFromName("savePromptButton"),
            null,
            null,
            check);

        Services.strings.flushBundles();

        return button;
    },

    target: function(window, index, source, alt, quicksave) {
        let list = moongiraffe.Cmis.prefs.value("directoryList");

        let items = JSON.parse(list);

        let data = items[index];

        let filename = moongiraffe.Cmis.utils.filename(window, source);

        filename = moongiraffe.Cmis.utils.format(data.format, filename, alt);

        let previndex = moongiraffe.Cmis.prefs.value("previousDirectoryIndex");

        let path = null;

        if (data.saveas) {
            let prevpath = moongiraffe.Cmis.prefs.value("previousSaveAsDirectory");

            // If we are preforming a quicksave action on a menu item
            // with the 'Save As' option selected we should only
            // prompt if the previousSaveAsDirectory is not set.
            if (quicksave &&
                previndex == index &&
                prevpath !== "") {
                path = Components.classes["@mozilla.org/file/local;1"]
                    .createInstance(Components.interfaces.nsILocalFile);

                path.initWithPath(prevpath);

                path.append(filename);
            }
            else {
                path = moongiraffe.Cmis.utils.promptpath(window, data, filename);

                let dir = moongiraffe.Cmis.utils.dirname(path.path);

                moongiraffe.Cmis.prefs.value("previousSaveAsDirectory", dir);
            }
        }
        else {
            path = moongiraffe.Cmis.utils.buildpath(window, data, filename);

            moongiraffe.Cmis.prefs.value("previousSaveAsDirectory", "");
        }

        let target = NetUtil.newURI(path);

        return [target, path.leafName];
    },

    filename: function(window, source) {
        let name = null;

        let cache = null;

        // Check for Content-Disposition and Content-Type HTTP headers
        if (Services.vc.compare(Services.appinfo.platformVersion, "18.0") < 0) {
            cache = Components.classes["@mozilla.org/image/cache;1"]
                .getService(Components.interfaces.imgICache)
        }
        else {
            // As of Firefox 18, there is no longer a single image cache.
            // https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/imgICache
            cache = Components.classes["@mozilla.org/image/tools;1"]
                .getService(Components.interfaces.imgITools)
                .getImgCacheForDocument(window.document);
        }

        let content_type = null;

        let content_disposition = null;

        try {
            let properties = cache.findEntryProperties(source);

            if (properties) {
                content_type = properties.get("type", Components.interfaces.nsISupportsCString);
                content_disposition = properties.get("content-disposition", Components.interfaces.nsISupportsCString);
            }

            let decoder = Components.classes["@mozilla.org/network/mime-hdrparam;1"]
                .createInstance(Components.interfaces.nsIMIMEHeaderParam);

            let unused = {value : null};

            name = decoder.getParameter(content_disposition, "filename", window.document.characterSet, true, unused);

            return moongiraffe.Cmis.utils.validate(name, content_type);
        }
        catch (e) {
            // It is OK to fail fetching Content-Type and Content-Disposition headers
        }

        try {
            // https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIURL
            let url = source.QueryInterface(Components.interfaces.nsIURL);

            if (url.fileName !== "") {
                let texttosuburi = Components.classes["@mozilla.org/intl/texttosuburi;1"]
                    .getService(Components.interfaces.nsITextToSubURI);

                name = texttosuburi.unEscapeURIForUI(url.originCharset || "UTF-8", url.fileName);

                return moongiraffe.Cmis.utils.validate(name, content_type);
            }
        }
        catch (e) {
            // It is OK to fail parsing the URL
        }

        // If this is a directory, use the last directory name
        let data = source.path.match(/\/([^\/]+)\/$/);

        if (data && data.length > 1) {
            return moongiraffe.Cmis.utils.validate(data[1], content_type);
        }

        // Otherwise we can extract the filename from the URL (and cross our fingers)
        name = source.path.replace(/.*\//, "");

        return moongiraffe.Cmis.utils.validate(name, content_type);
    },

    validate: function(name, content_type) {
        // firefox-5.0/omni/chrome/toolkit/content/global/contentAreaUtils.js:883
        name = name.replace(/[\\]+/g, "_");
        name = name.replace(/[\/]+/g, "_");
        name = name.replace(/[\:]+/g, " ");
        name = name.replace(/[\*]+/g, " ");
        name = name.replace(/[\?]+/g, " ");
        name = name.replace(/[\"]+/g, "'");
        name = name.replace(/[\<]+/g, "(");
        name = name.replace(/[\>]+/g, ")");
        name = name.replace(/[\|]+/g, "_");

        // XXX This was returning null sometimes. Is this supposed to ever happen?
        let mimeService = Components.classes["@mozilla.org/mime;1"]
            .getService(Components.interfaces.nsIMIMEService);

        let extension = mimeService.getPrimaryExtension(content_type, null);

                                    // Goodie goodie gumdrops!
        if (extension === "jpe" ||  // Linux FF18 getPrimaryExtension("image/jpeg", null) returns "jpe"
            extension === "jpg" ||  // Windows 7 x86_64 FF18 returns "jpg"
            extension === "jpeg") { // Windows XP x86_64 FF17.1 returns "jpeg"
            // In obscure parallel worlds .jpeg is sometimes used as the suffix
            extension = "jpe?g";
        }

        // Check for a correct file suffix
        if (!name.match(new RegExp("\." + extension + "$", "i"))) {
            // If content_type is image/jpeg but the file suffix is missing we append jpg (removing e?)
            if (extension === "jpe?g") {
                extension = "jpg";
            }

            name = name + "." + extension;
        }

        return name;
    },

    uniq: function(path) {
        // firefox-5.0/omni/chrome/toolkit/content/global/contentAreaUtils.js:610
        let count = 0;
        while (path.exists()) {
            count++;
            if (count == 1) {
                path.leafName = path.leafName.replace(/(\.[^\.]*)?$/, "(2)$&");
            }
            else {
                path.leafName = path.leafName.replace(/^(.*\()\d+\)/, "$1" + (count + 1) + ")");
            }
        }
        return path;
    },

    dirname: function(path) {
        var offset = path.lastIndexOf('/');

        if (offset == -1) {
            offset = path.lastIndexOf('\\');
        }

        var dir = path;

        if (offset != -1) {
            dir = new String(path).substring(0, offset);
        }

        return dir;
    },

    format: function(format, filename, alt) {
        // An empty format string should correspond to a %DEFAULT
        // variable, i.e., the original filename.
        if (format.length == 0)
            return filename;

        let [tmp, name, extension] = filename.match(/^(.*?)\.(.*?)$/); // Really man?

        let result = format
            .replace(/%DEFAULT/g, filename)
            .replace(/%NAME/g, name)
            .replace(/%EXT/g, extension)

        result = moongiraffe.Cmis.utils.date(result);

        if (result.match(/%ALT/)) {
            let gContextMenu = Services.ww.activeWindow.gContextMenu;

            if (gContextMenu) {
                result = result.replace(/%ALT/g, gContextMenu.target.alt);
            }
            else { // gContextMenu is not created on quicksave
                result = result.replace(/%ALT/g, alt);
            }
        }

        return result;
    },

    date: function(str) {
        function pad(value) {
            let str = "";

            if (value < 10.0)
                str += "0";

            str += value.toString();

            return str;
        }

        let date = new Date(),
            year = pad(date.getFullYear()),   // YYYY
            yy = year.substring(2,4),         // yy
            month = pad(date.getMonth() + 1), // 0 - 11
            day = pad(date.getDate()),        // 1 - 31
            hours = pad(date.getHours()),     // 0 - 23
            minutes = pad(date.getMinutes()), // 0 - 59
            seconds = pad(date.getSeconds()); // 0 - 59

        let format = str.match(/%DATE{(.*?)}/);

        // There is a possibility that a format string contains more
        // than one custom %DATE{} format string.
        while (format && format.length == 2) {
            str = str.replace(/%DATE{.*?}/, format[1]);

            format = str.match(/%DATE{(.*?)}/);
        }

        if (str.match(/%DATE/)) {
            str = str.replace(/%DATE/g, "YYYY-MM-DD-hhmmss");
        }

        return str
            .replace(/YYYY/g, year)
            .replace(/yy/g, yy)
            .replace(/MM/g, month)
            .replace(/DD/g, day)
            .replace(/hh/g, hours)
            .replace(/mm/g, minutes)
            .replace(/ss/g, seconds);
    }
};

moongiraffe.Cmis.update = {
    // Upgrade the old directoryList format and replace it with user
    // friendly(er) JSON. This will enable labels and paths to contain
    // "|" and "!"  characters and lead the way to easy importing and
    // exporting of CMIS settings.
    v20130128: function() {
        let list = moongiraffe.Cmis.prefs.value("directoryList");

        let items = [];

        // If the first character is a '[' it is safe to assume that
        // the directoryList has already been converted, i.e., user is
        // running a -dev version. Note: Saveas items have been merged
        // with Item objects. That is, we still need to process the list.
        if (list[0] == '[') {
            let xs = JSON.parse(list);


            xs.forEach(function (item) {
                if (item.type === "item" &&
                    item.saveas === undefined) {
                    item.saveas = false;
                }

                if (item.type ==="saveas") {
                    item.type = "item";
                    item.format = "%DEFAULT";
                    item.saveas = true;
                }

                items.push(item);
            });

            list = JSON.stringify(items);

            moongiraffe.Cmis.prefs.value("directoryList", list);

            return;
        }

        // Otherwise we translate the old directoryList string
        // and go from there.
        let xs = list.split("|");

        xs.forEach(function (x) {
            let item = x.split("!");

            switch (item[0]) {
            case '.':
                let prefix = item[4];

                // Append %DEFAULT to the old style prefix data, even
                // if it is empty.
                prefix += "%DEFAULT"

                items.push({
                    type: "item",
                    depth: parseInt(item[1]),
                    name: item[2],
                    path: item[3],
                    format: prefix,
                    saveas: false
                });
                break;

            case '=':
                items.push({
                    type: "item",
                    depth: parseInt(item[1]),
                    name: item[2],
                    path: item[3],
                    format: "%DEFAULT",
                    saveas: true
                });
                break;

            case '-':
                items.push({
                    type: "separator",
                    depth: parseInt(item[1])
                });
                break;

            case '>':
                items.push({
                    type: "submenu",
                    depth: parseInt(item[1]),
                    name: item[2]
                });
                break;
            }
        });

        list = JSON.stringify(items);

        moongiraffe.Cmis.prefs.value("directoryList", list);
    }
}

function startup(data, reason) {
    // As of Gecko 10.0, manifest registration is performed automatically.
    if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0) {
        Components.manager.addBootstrappedManifestLocation(data.installPath);
    }

    moongiraffe.Cmis.prefs.startup();
    moongiraffe.Cmis.window.startup();
}

function shutdown(data, reason) {
    if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0) {
        Components.manager.removeBootstrappedManifestLocation(data.installPath);
    }

    moongiraffe.Cmis.prefs.shutdown();
    moongiraffe.Cmis.window.shutdown();
}

function install(data, reason) {
    if (reason === 7 /* ADDON_UPGRADE */) {
        if (Services.vc.compare(data.version, "20130128") <= 0) {
            moongiraffe.Cmis.update.v20130128();
        }
    }
}

function uninstall(data, reason) {
    if (reason === 6 /* ADDON_UNINSTALL */) {
        moongiraffe.Cmis.prefs.uninstall();
    }
}
