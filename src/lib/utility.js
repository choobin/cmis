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
Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");

Cmis.utility = {
    isValidPath: function(string) {
        try {
            let path = Components
                .classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);

            path.initWithPath(string);

            if (!path.exists() || !path.isDirectory() || !path.isWritable())
                return false;
        }
        catch (e) {
            return false; // NS_ERROR_FILE_UNRECOGNIZED_PATH
        }

        return true;
    },

    nextValidPath: function(string) {
        let next = Cmis.utility.dirname(string);

        while (next !== string) {
            if (Cmis.utility.isValidPath(next))
                return next;

            string = next;

            next = Cmis.utility.dirname(next);
        }

        // If that fails return a path to the users desktop.
        let desktop = Components
            .classes["@mozilla.org/file/directory_service;1"]
            .getService(Components.interfaces.nsIProperties)
            .get("Desk", Components.interfaces.nsIFile);

        return desktop.path;
    },

    buildpath: function(data, filename) {
        let path = Components
            .classes["@mozilla.org/file/local;1"]
            .createInstance(Components.interfaces.nsIFile);

        path.initWithPath(data.path);

        if (!path.exists())
            return null;

        path.append(filename);

        return path;
    },

    promptpath: function(data, filename) {
        let window = Services.ww.activeWindow;

        let nsIFilePicker = Components.interfaces.nsIFilePicker;

        let filePicker = Components
            .classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        filePicker.init(window, data.name, nsIFilePicker.modeSave);

        filePicker.defaultString = filename;

        filePicker.appendFilters(nsIFilePicker.filterAll);

        if (data.path !== "") {
            if (!Cmis.utility.isValidPath(data.path))
                data.path = Cmis.utility.nextValidPath(data.path);

            let path = Components
                .classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);

            path.initWithPath(data.path);

            filePicker.displayDirectory = path;
        }

        let result = filePicker.show();

        if (result == nsIFilePicker.returnCancel)
            return null;

        return filePicker.file;
    },

    prompt: function(path) {
        let window = Services.ww.activeWindow;

        let bundle = Cmis.utility.stringBundle();

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

    target: function(event, index, source, alt, quicksave) {
        let list = Cmis.preferences.value("directoryList");

        let items = {};

        try {
            items = JSON.parse(list);
        } catch (e) {
            return [null, null];
        }

        let data = items[index];

        let filename = Cmis.utility.filename(source);

        filename = Cmis.utility.format(data.format, filename, source, alt);

        filename = Cmis.utility.validate(filename);

        let path = null;

        if (event.shiftKey)
            data.saveas = true;

        if (data.saveas) {
            let previndex = Cmis.preferences.value("previousDirectoryIndex");

            let prevpath = Cmis.preferences.value("previousSaveAsDirectory");

            // If we are preforming a quicksave action on a menu item
            // with the 'Save As' option selected we should only
            // prompt if the previousSaveAsDirectory is not set.
            if (quicksave &&
                previndex == index &&
                prevpath !== "") {
                path = Components
                    .classes["@mozilla.org/file/local;1"]
                    .createInstance(Components.interfaces.nsIFile);

                path.initWithPath(prevpath);

                path.append(filename);

                // Now we move down to path.exists() and check overwriteAction.
            }
            else {
                path = Cmis.utility.promptpath(data, filename);

                if (!path) return [null, null]; // The cancel button was clicked.

                let dir = Cmis.utility.dirname(path.path);

                Cmis.preferences.value("previousSaveAsDirectory", dir);

                let target = NetUtil.newURI(path);

                return [target, path.leafName];
            }
        }
        else {
            path = Cmis.utility.buildpath(data, filename);

            if (!path) return [null, null]; // The save path is invalid.

            Cmis.preferences.value("previousSaveAsDirectory", "");
        }

        if (path.exists()) {
            // 0 -> prompt user
            // 1 -> save as unique file
            // 2 -> overwrite file
            let action = Cmis.preferences.value("overwriteAction");

            if (action == 0) {
                // 0 -> overwrite file
                // 1 -> save as unique file
                // 2 -> cancel
                let result = Cmis.utility.prompt(path);

                if (result == 2) {
                    return [null, null];
                }

                // Note: The prompt.confirmEx call from utility.prompt
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

            if (action == 1)
                path = Cmis.utility.uniq(path);
        }

        let target = NetUtil.newURI(path);

        return [target, path.leafName];
    },

    filename: function(source) {
        let window = Services.ww.activeWindow;

        let name = null;

        let cache = Components
            .classes["@mozilla.org/image/tools;1"]
            .getService(Components.interfaces.imgITools)
            .getImgCacheForDocument(window.document);

        let nsISupportsCString = Components.interfaces.nsISupportsCString;

        let content_type = null;

        let content_disposition = null;

        try {
            let properties = cache.findEntryProperties(source);

            if (properties) {
                content_type = properties.get("type", nsISupportsCString);
                content_disposition = properties.get("content-disposition", nsISupportsCString);
            }

            let decoder = Components
                .classes["@mozilla.org/network/mime-hdrparam;1"]
                .createInstance(Components.interfaces.nsIMIMEHeaderParam);

            let unused = {value : null};

            name = decoder.getParameter(content_disposition, "filename", window.document.characterSet, true, unused);

            name = Cmis.utility.suffix(name, content_type);

            return name;
        }
        catch (e) {
            // It is OK to fail fetching Content-Type and Content-Disposition headers
        }

        try {
            // https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIURL
            let url = source.QueryInterface(Components.interfaces.nsIURL);

            if (url.fileName !== "") {
                let texttosuburi = Components
                    .classes["@mozilla.org/intl/texttosuburi;1"]
                    .getService(Components.interfaces.nsITextToSubURI);

                name = texttosuburi.unEscapeURIForUI(url.originCharset || "UTF-8", url.fileName);

                name = Cmis.utility.suffix(name, content_type);

                return name;
            }
        }
        catch (e) {
            // It is OK to fail parsing the URL
        }

        // If this is a directory, use the last directory name
        let data = source.path.match(/\/([^\/]+)\/$/);

        if (data && data.length > 1) {
            return Cmis.utility.validate(data[1], content_type, true);
        }

        // Otherwise we can extract the filename from the URL (and cross our fingers)
        name = source.path.replace(/.*\//, "");

        name = Cmis.utility.suffix(name, content_type);

        return name;
    },

    suffix: function(name, content_type) {
        // XXX This was returning null sometimes. Is this supposed to ever happen?
        let mimeService = Components
            .classes["@mozilla.org/mime;1"]
            .getService(Components.interfaces.nsIMIMEService);

        let suffix = mimeService.getPrimaryExtension(content_type, null);

        // Goodie goodie gumdrops!
        if (suffix === "jpe" ||  // Linux FF18 getPrimaryExtension("image/jpeg", null) returns "jpe"
            suffix === "jpg" ||  // Windows 7 x86_64 FF18 returns "jpg"
            suffix === "jpeg") { // Windows XP x86_64 FF17.1 returns "jpeg"
            // In obscure parallel worlds .jpeg is sometimes used as the suffix
            suffix = "jpe?g";
        }

        // Check for a correct file suffix
        if (!name.match(new RegExp("\." + suffix + "$", "i"))) {
            // If content_type is image/jpeg but the file suffix is missing we append jpg (removing e?)
            if (suffix === "jpe?g") {
                suffix = "jpg";
            }

            name = name + "." + suffix;
        }

        return name;
    },

    validate: function(name) {
        // firefox-5.0/omni/chrome/toolkit/content/global/contentAreaUtils.js:883
        name = name.replace(/[\\]+/g, "_");
        name = name.replace(/[\/]+/g, "_");
        name = name.replace(/[\:]+/g, "_");
        name = name.replace(/[\*]+/g, "_");
        name = name.replace(/[\?]+/g, "_");
        name = name.replace(/[\"]+/g, "'");
        name = name.replace(/[\<]+/g, "(");
        name = name.replace(/[\>]+/g, ")");
        name = name.replace(/[\|]+/g, "_");
        return name;
    },

    uniq: function(path) {
        // firefox-5.0/omni/chrome/toolkit/content/global/contentAreaUtils.js:610
        let count = 0;
        while (path.exists()) {
            count++;
            if (count == 1)
                path.leafName = path.leafName.replace(/(\.[^\.]*)?$/, "(2)$&");
            else
                path.leafName = path.leafName.replace(/^(.*\()\d+\)/, "$1" + (count + 1) + ")");
        }
        return path;
    },

    dirname: function(path) {
        let offset = path.lastIndexOf('/');

        if (offset == -1)
            offset = path.lastIndexOf('\\');

        let dir = path;

        if (offset != -1)
            dir = new String(path).substring(0, offset);

        return dir;
    },

    format: function(format, filename, source, alt) {
        // An empty format string should correspond to a %DEFAULT
        // variable, i.e., the original filename.
        if (format.length == 0)
            return filename;

        let window = Services.ww.activeWindow;

        let document = window.gBrowser.contentDocument;

        let [tmp, name, extension] = filename.match(/^(.*?)\.(.*?)$/); // Really man?

        let result = Cmis.utility.date(format);

        if (result.match(/%DEFAULT/))
            result = result.replace(/%DEFAULT/g, filename);

        if (result.match(/%NAME/))
            result = result.replace(/%NAME/g, name);

        if (result.match(/%EXT/))
            result = result.replace(/%EXT/g, extension);

        if (result.match(/%ALT/)) {
            let gContextMenu = Services.ww.activeWindow.gContextMenu;

            if (gContextMenu)
                alt = gContextMenu.target.alt;

            if (!alt || alt.length === 0)
                alt = "no-alt-text";

            result = result.replace(/%ALT/g, alt);
        }

        if (result.match(/%HOST/))
            result = result.replace(/%HOST/g, source.host);

        if (result.match(/%DOMAIN/)) {
            let domain = Services.eTLD.getBaseDomainFromHost(source.host)
            result = result.replace(/%DOMAIN/g, domain);
        }

        if (result.match(/%URL/)) {
            let [tmp, url] = document.URL.match(/:\/\/(.*)$/);

            url = url.replace(/\//g, "_");

            result = result.replace(/%URL/g, url);
        }

        if (result.match(/%TITLE/)) {
            let title = document.getElementsByTagName("title")[0].textContent || "no-title-text";
            result = result.replace(/%TITLE/g, title);
        }

        if (result.match(/%CLIPBOARD/)) {
            let text = Cmis.utility.clipboard();

            if (text.length === 0)
                text = "no-clipboard-text";

            result = result.replace(/%CLIPBOARD/g, text);
        }

        return result;
    },

    clipboard: function() {
        let text = "";

        try {
            let clipboard = Components.classes["@mozilla.org/widget/clipboard;1"]
                .getService(Components.interfaces.nsIClipboard);

            if (!clipboard)
                return "";

            let transferable = Components.classes["@mozilla.org/widget/transferable;1"]
                .createInstance(Components.interfaces.nsITransferable);

            if (!transferable)
                return "";

            // init was added to nsITransferable in FF16 for Private Browsing mode
            // https://developer.mozilla.org/en-US/docs/Using_the_Clipboard
            if ('init' in transferable) {
                let window = Services.ww.activeWindow;

                let privacy_context = PrivateBrowsingUtils.privacyContextFromWindow(window);

                transferable.init(privacy_context);
            }

            transferable.addDataFlavor("text/unicode");

            clipboard.getData(transferable, clipboard.kGlobalClipboard);

            let string = {};
            let length = {};

            transferable.getTransferData("text/unicode", string, length);

            string = string.value.QueryInterface(Components.interfaces.nsISupportsString);

            text = string.data.substring(0, length.value / 2);
        }
        catch (e) {
            // It is ok to fail. In most cases this is due
            // to the clipboard being empty in Windows.
        }

        return text;
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

        if (str.match(/%DATE/))
            str = str.replace(/%DATE/g, "YYYY-MM-DD-hhmmss");

        return str
            .replace(/YYYY/g, year)
            .replace(/yy/g, yy)
            .replace(/MM/g, month)
            .replace(/DD/g, day)
            .replace(/hh/g, hours)
            .replace(/mm/g, minutes)
            .replace(/ss/g, seconds);
    },

    stringBundle: function() {
        return Services.strings.createBundle("chrome://cmis/locale/cmis.properties");
    }
};
