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

if (!moongiraffe) var moongiraffe = {};
if (!moongiraffe.Cmis) moongiraffe.Cmis = {};
if (!moongiraffe.Cmis.menu) moongiraffe.Cmis.menu = {};

moongiraffe.Cmis.menu.edit = {
    load: function() {
        var item = window.arguments[0];

        document.getElementById("name").value = item.name;

        // We only want a name input field when we edit submenu items or a save as button
        if (item.container || item.saveas) {
            document.getElementById("path").hidden = true;
            document.getElementById("pathlabel").hidden = true;
            document.getElementById("browse").hidden = true;
            document.getElementById("prefix").hidden = true;
            document.getElementById("prefixlabel").hidden = true;
        }
        else {
            document.getElementById("path").value = item.path;
            document.getElementById("prefix").value = item.prefix;
        }

        if (item.saveas) {
            document.getElementById("saveas-explanation").hidden = false;
        }
        else {
            document.getElementById("saveas-explanation").hidden = true;
        }
    },

    accept: function() {
        if (document.getElementById("name").value.length == 0)
            return false

        if (!this.valid("name")) {
            this.error("errorPromptItemName");
            return false;
        }

        // If path is hidden we are a submenu item, so we can just return the name value
        if (document.getElementById("path").hidden === true) {
            var item = window.arguments[0];
            item.name = document.getElementById("name").value;
            return true;
        }

        if (document.getElementById("path").hidden === false &&
            document.getElementById("path").value.length == 0)
            return false

        // Otherwise we have to validate the path and the other input fields
        if (!this.valid("path")) {
            this.error("errorPromptItemPath");
            return false;
        }

        var file;

        try {
            var file = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsILocalFile);

            file.initWithPath(document.getElementById("path").value);

            if (!file.isDirectory() || !file.isWritable()) {
                this.error("errorPromptItemPath");
                return false;
            }
        } catch(e) {
            this.error("errorPromptItemPath");
            return false;
        }

        if (document.getElementById("prefix").value.length > 0 &&
            !this.valid("prefix")) {
            this.error("errorPromptItemPrefix");
            return false;
        }

        var item = window.arguments[0];

        item.name = document.getElementById("name").value;
        item.path = document.getElementById("path").value;
        item.prefix = document.getElementById("prefix").value;

        return true;
    },

    cancel: function() {
        return true;
    },

    getpath: function() {
        var picker = Components.classes["@mozilla.org/filepicker;1"]
            .createInstance(Components.interfaces.nsIFilePicker);

        var path = document.getElementById("path").value;

        if (path !== "") {
            var file = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsILocalFile);

            file.initWithPath(path);

            if (!file.exists()) {
                this.error("errorPromptItemPath");
                return false;
            }

            picker.displayDirectory = file;
        }

        var bundle = Services.strings.createBundle("chrome://cmis/locale/prompt.properties");

        picker.init(window,
                    bundle.GetStringFromName("selectDirectory"),
                    Components.interfaces.nsIFilePicker.modeGetFolder);

        var ret = picker.show();

        if (ret == Components.interfaces.nsIFilePicker.returnOK) {
            document.getElementById("path").value = picker.file.path;
        }

        var label = bundle.GetStringFromName("saveImage") + " \"" + this.basename(picker.file.path) + "\"";

        document.getElementById("name").value = label;

        Services.strings.flushBundles();

        return true;
    },

    valid: function(string) {
        var item = document.getElementById(string).value;

        if (item.indexOf("|") != -1 || item.indexOf("!") != -1) {
            return false;
        }

        return true;
    },

    error: function(string) {
        var bundle = Services.strings.createBundle("chrome://cmis/locale/prompt.properties");

        Services.prompt.alert(null,
                              bundle.GetStringFromName("errorPromptTitle"),
                              bundle.GetStringFromName(string));

        Services.strings.flushBundles();
    },

    basename: function(path) {
        var offset = path.lastIndexOf('/');

        if (offset == -1) {
            offset = path.lastIndexOf('\\');
        }

        var base = path;

        if (offset != -1) {
            base = new String(path).substring(offset + 1);
        }

        return base;
    },
};
