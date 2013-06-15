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

function $(x) {
    return document.getElementById(x);
};

const PREFBRANCH = "extensions.cmis@moongiraffe.net.";

let Utility = {
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
        let next = Utility.dirname(string);

        while (next !== string) {
            if (Utility.isValidPath(next))
                return next;

            string = next;

            next = Utility.dirname(next);
        }

        // If that fails return a path to the users desktop.
        let desktop = Components
            .classes["@mozilla.org/file/directory_service;1"]
            .getService(Components.interfaces.nsIProperties)
            .get("Desk", Components.interfaces.nsIFile);

        return desktop.path;
    },

    fetchList: function() {
        let branch = Services.prefs.getBranch(PREFBRANCH);

        let list = branch.getComplexValue(
            "directoryList",
            Components.interfaces.nsISupportsString).data;

        return list;
    },

    updateList: function() {
        let list = JSON.stringify(ItemsView.items, function (key, value) {
            if (key === "menu") // menu is only need for the import/export calls.
                return undefined;

            return value;
        }, "");

        let string = Components
            .classes["@mozilla.org/supports-string;1"]
            .createInstance(Components.interfaces.nsISupportsString);

        string.data = list;

        let branch = Services.prefs.getBranch(PREFBRANCH);

        branch.setComplexValue(
            "directoryList",
            Components.interfaces.nsISupportsString, string);
    },

    errorPrompt: function(string) {
        let bundle = Utility.stringBundle();

        Services.prompt.alert(
            null,
            bundle.GetStringFromName("errorPromptTitle"),
            bundle.GetStringFromName(string));

        Services.strings.flushBundles();
    },

    flatten: function(xs, depth) {
        let data = [];

        xs.forEach(function (x) {
            x.depth = depth;

            data.push(x);

            if (x.type === "submenu") {
                if (x.open === undefined)
                    x.open = true;

                data = data.concat(Utility.flatten(x.menu, depth + 1));
            }
        });

        return data;
    },

    filePicker: function(mode) {
        let nsIFilePicker = Components.interfaces.nsIFilePicker;

        let filePicker = Components
            .classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        filePicker.init(window, "", mode);

        return filePicker;
    },

    stringBundle: function() {
        return Services.strings.createBundle("chrome://cmis/locale/cmis.properties");
    },

    basename: function(path) {
        let offset = path.lastIndexOf('/');

        if (offset == -1)
            offset = path.lastIndexOf('\\');

        let base = path;

        if (offset != -1)
            base = new String(path).substring(offset + 1);

        return base;
    },

    dirname: function(path) {
        let offset = path.lastIndexOf('/');

        if (offset == -1)
            offset = path.lastIndexOf('\\');

        let dir = path;

        if (offset != -1)
            dir = new String(path).substring(0, offset);

        return dir;
    }
};
