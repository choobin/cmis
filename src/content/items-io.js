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

Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

let ItemsIO = {
    _write: function(file, data) {
        let outstream = FileUtils.openSafeFileOutputStream(file)

        let converter = Components
            .classes["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);

        converter.charset = "UTF-8";

        let instream = converter.convertToInputStream(data);

        NetUtil.asyncCopy(instream, outstream, function(status) {
            if (!Components.isSuccessCode(status))
                return;
        });
    },

    _read: function(file, fn) {
        let channel = NetUtil.newChannel(file);

        channel.contentType = "application/json";

        NetUtil.asyncFetch(channel, function(inputStream, status) {
            if (!Components.isSuccessCode(status))
                return;

            let data = NetUtil.readInputStreamToString(
                inputStream,
                inputStream.available(),
                { charset: "UTF-8" }); // It defaults to LATIN-1.

            fn(data);
        });
    },

    exportSettings: function() {
        let list = Utility.fetchList();

        let items = JSON.parse(list);

        // Translate the list into a pretty nested JSON object. This
        // will let us neglect the depth field when writing to the
        // file. Making it easier for users to manually edit.

        let data = [];

        let parent = [data];

        let depth = [0];

        let i = 0;

        while (i < items.length) {
            if (items[i].depth < depth[depth.length - 1]) {
                parent.pop();
                depth.pop();
                continue;
            }

            if (items[i].type === "submenu") {
                let submenu = items[i];
                submenu.menu = []; // Make sure menu exists.
                parent[parent.length - 1].push(submenu);
                parent.push(submenu.menu);
                depth.push(submenu.depth + 1); // Increase depth.
                i++;
                continue;
            }

            if (items[i].depth == depth[depth.length - 1]) {
                parent[parent.length - 1].push(items[i]);
                i++;
                continue;
            }
        }

        let timestamp = new Date().toISOString();

        // Some file systems do not like ':' in filenames. I am
        // looking at you Windows (/me shakes fist).
        timestamp = timestamp.replace(/:/g, "");

        let bundle = Utility.stringBundle();

        let json = {
            info: "Context Menu Image Saver Menu Settings",
            version: 1.0,
            created: timestamp,
            note: bundle.GetStringFromName("settingsNote"),
            menu: data
        };

        let str = JSON.stringify(json, function (key, value) {
            // The depth field is only useful for the treeview. We can
            // ignore it here and re-compute is again during
            // import_settings.
            if (key === "depth")
                return undefined;

            return value;
        }, "  ");

        let nsIFilePicker = Components.interfaces.nsIFilePicker;

        let filePicker = Utility.filePicker(nsIFilePicker.modeSave);

        filePicker.appendFilter("JSON " + bundle.GetStringFromName("files"), "*.json");

        filePicker.appendFilters(nsIFilePicker.filterAll);

        filePicker.defaultString = "cmis-" + bundle.GetStringFromName("settings") + "-" + timestamp + ".json";

        Services.strings.flushBundles();

        filePicker.defaultExtension = "json";

        let result = filePicker.show();

        if (result == nsIFilePicker.returnCancel)
            return;

        this._write(filePicker.file, str);
    },

    importSettings: function() {
        let nsIFilePicker = Components.interfaces.nsIFilePicker;

        let filePicker = Utility.filePicker(nsIFilePicker.modeOpen);

        let bundle = Utility.stringBundle();

        filePicker.appendFilter("JSON " + bundle.GetStringFromName("files"), "*.json");

        Services.strings.flushBundles();

        filePicker.appendFilters(nsIFilePicker.filterAll);

        let result = filePicker.show();

        if (result == nsIFilePicker.returnCancel)
            return;

        this._read(filePicker.file, function(data) {
            let list = [];

            try {
                list = JSON.parse(data);
            } catch (e) {
                Utility.errorPrompt("errorPromptParseSettings");
                return;
            }

            // TODO
            // validate data
            // check info string
            // check version string
            // check timestamp (dr. who)
            // check that there is actually a menu property
            // check that 'path'
            // - contains correct path separators for OS
            // - exists
            // - isWritable

            let menu = Utility.flatten(list.menu, 0);

            ItemsActions.appendItems(menu);
        });
    },

    generateItems: function() {
        let nsIFilePicker = Components.interfaces.nsIFilePicker;

        let filePicker = Utility.filePicker(nsIFilePicker.modeGetFolder);

        let result = filePicker.show();

        if (result == nsIFilePicker.returnCancel)
            return;

        function process(directory, depth) {
            let enumerator = directory.directoryEntries;

            let entries = [];

            // directoryEntries returns a nsISimpleEnumerator. To get
            // the number of directories we have to enumerate through
            // them.
            while (enumerator.hasMoreElements()) {
                let entry = enumerator.getNext();

                entry.QueryInterface(Components.interfaces.nsIFile);

                try {
                    if (entry.isDirectory() && entry.isWritable())
                        entries.push(entry);
                } catch (e) {
                    // So... It turns out that on Windows (tested on
                    // Win7 SP1 x86_64), if a file name is too long
                    // (hey, I have not bothered to find the exact
                    // length here just say long), well, if a file
                    // name is too long it will freak out and the call
                    // to isDirectory will fail. Hence this try/catch
                    // statement as a work around until I figure out
                    // what is going on. /me takes deep breath.
                }
            }

            // If there are no directories we can just return a single Item element.
            if (entries.length == 0)
                return [new Item(depth, directory.leafName, directory.path, "%DEFAULT", false)];

            let data = [];

            // Otherwise first create a Submenu then an initial Item
            // so we can save in the root directory too.
            data.push(new Submenu(depth, directory.leafName));

            let bundle = Utility.stringBundle();

            data.push(new Item(depth + 1, bundle.GetStringFromName("here"), directory.path, "%DEFAULT", false));

            Services.strings.flushBundles();

            for (let i = 0; i < entries.length; i++)
                data = data.concat(process(entries[i], depth + 1));

            return data;
        }

        if (!filePicker.file.isWritable())
            return;

        let items = process(filePicker.file, 0);

        ItemsActions.appendItems(items);
    }
};
