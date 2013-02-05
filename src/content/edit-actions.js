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

let EditActions = {
    load: function() {
        let item = window.arguments[0].item;

        $("name").value = item.name || "";
        $("path").value = item.path || "";
        $("format").value = item.format || "%DEFAULT";
        $("saveas").checked = item.saveas || false;

        // Submenu and Edit items only need to display the name field.
        if (item.type === "submenu" ||
            item.type === "settings") {
            $("path").hidden = true;
            $("pathlabel").hidden = true;
            $("browse").hidden = true;
            $("format").hidden = true;
            $("formatlabel").hidden = true;
            $("formatguide").hidden = true;
            $("saveas").hidden = true;
        }

        $("settings-explanation").hidden = true;

        if (item.type === "settings")
            $("settings-explanation").hidden = false;
    },

    accept: function() {
        if ($("name").value.length == 0)
            return false

        // If path is hidden we are a submenu item, so we can just return the name value
        if ($("path").hidden === true) {
            let item = window.arguments[0].item;
            item.name = $("name").value;
            return true;
        }

        if ($("path").hidden === false &&
            $("path").value.length == 0)
            return false

        let file;

        try {
            let file = Components
                .classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsILocalFile);

            file.initWithPath($("path").value);

            if (!file.isDirectory() || !file.isWritable()) {
                Utility.errorPrompt("errorPromptItemPath");
                return false;
            }
        } catch(e) {
            Utility.errorPrompt("errorPromptItemPath");
            return false;
        }

        let item = window.arguments[0].item;

        item.name = $("name").value;
        item.path = $("path").value;
        item.format = $("format").value;
        item.saveas = $("saveas").checked;

        return true;
    },

    cancel: function() {
        let item = window.arguments[0].cancel = true;

        return true;
    },

    getPath: function() {
        let path = $("path").value;

        if (path === "")
            path = window.arguments[0].previousPath;

        if (path !== "") {
            let file = Components
                .classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsILocalFile);

            file.initWithPath(path);

            if (!file.exists()) {
                Utility.errorPrompt("errorPromptItemPath");
                return false;
            }

            picker.displayDirectory = file;
        }

        let nsIFilePicker = Components.interfaces.nsIFilePicker;

        let filePicker = Utility.filePicker(nsIFilePicker.modeGetFolder);

        let result = filePicker.show();

        if (result === nsIFilePicker.returnOK) {
            $("path").value = filePicker.file.path;

            window.arguments[0].previousPath = Utility.dirname(filePicker.file.path);
        }

        // Only set a default label if the field is empty.
        if ($("name").value === "") {
            let bundle = Utility.stringBundle();

            let prefix = bundle.GetStringFromName("saveImage");

            let label = prefix + " \"" + Utility.basename(filePicker.file.path) + "\"";

            $("name").value = label;

            Services.strings.flushBundles();
        }

        return true;
    }
};

window.addEventListener("load", function() {
    EditActions.load();
}, false);
