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
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const PREFBRANCH = "extensions.cmis@moongiraffe.net.";

if (!moongiraffe) var moongiraffe = {};
if (!moongiraffe.Cmis) moongiraffe.Cmis = {};
if (!moongiraffe.Cmis.menu) moongiraffe.Cmis.menu = {};

moongiraffe.Cmis.menu.items = {
    tree: null,
    treeview: null,

    load: function() {
        var data = this.loaddata();

        this.treeview = new Treeview(data);

        this.tree = $("tree");

        this.tree.view = this.treeview;

        this.treeview.invalidate();

        this.select();
    },

    loaddata: function() {
        var branch = Services.prefs.getBranch(PREFBRANCH);

        var list = branch.getComplexValue("directoryList", Components.interfaces.nsISupportsString).data;

        return JSON.parse(list);
    },

    update: function() {
        var list = JSON.stringify(this.treeview.items, function (key, value) {
            if (key === "menu") // The menu field is only need for import/export calls.
                return undefined;
            return value;
        }, "");

        var string = Components.classes["@mozilla.org/supports-string;1"]
            .createInstance(Components.interfaces.nsISupportsString);

        string.data = list;

        var branch = Services.prefs.getBranch(PREFBRANCH);

        branch.setComplexValue("directoryList", Components.interfaces.nsISupportsString, string);
    },

    select: function() {
        var index = this.treeview.selection.currentIndex;

        var count = this.treeview.rowCount;

        Services.console.logStringMessage("index: " + index + ", count: " + count);

        $("button-delete").disabled = false;

        // If nothing is selected /or/ there are no items in the list
        // /or/ the selection index is invalid /then/ we can not
        // delete anything.
        if (index < 0 || count == 0 || index >= count) {
            $("button-delete").disabled = true;
        }

        $("button-edit").disabled = false;

        // If nothing is selected /or/ the selected item is a
        // separator /or/ the selection index is invalid /then/ we can
        // not edit anything.
        if (index < 0 || index >= count || this.treeview.isSeparator(index)) {
            $("button-edit").disabled = true;
        }

        $("button-up").disabled = false;

        $("button-down").disabled = false;

        // If nothing is selected /or/ there are no items in the list
        // /or/ the selection index is invalid /then/ we can not move
        // up or down.
        if (index < 0 || count == 0 || index >= count) {
            $("button-up").disabled = true;
            $("button-down").disabled = true;
            return;
        }

        // If we are at the top of the list /and/ the selected item's
        // depth is 0 /then/ we can not move further up.
        if (index == 0 && this.treeview.items[0].depth == 0) {
            $("button-up").disabled = true;
        }

        // If the selected item is a submenu /and/ there are no other
        // items bellow its children /and/ the submenu's depth is 0
        // /then/ we can not move further down.
        if (count > 0 && index < count && this.treeview.items[index].type === "submenu") {
            var children = this.treeview.containerchildren(index);
            if (index + children == count - 1 && this.treeview.items[index].depth == 0)
                $("button-down").disabled = true;
        }

        // If we are at the bottom of the list /and/ the item's depth
        // is 0 /then/ we can not move further down.
        if (index == count - 1 && this.treeview.items[count - 1].depth == 0) {
            $("button-down").disabled = true;
        }
    },

    insert: function(items) {
        this.treeview.insert(items);
        this.update();
    },

    newitem: function(type) {
        var item;

        switch (type) {
        case "item":
            item = new Item();
            break;

        case "submenu":
            item = new Submenu();
            break;

        case "saveas":
            item = new Saveas();

            var name = $("button-saveas").label.trim();
            item.name = name; // Saveas sets a localized label.
            break;

        case "edit":
            item = new Edit();
            break;
        }

        // Do not initially open edit dialog for Edit item types. Keep
        // initial "Edit Settings" label.
        if (type !== "edit") {
            window.openDialog(
                "chrome://cmis/content/edit.xul",
                null,
                "chrome,modal,centerscreen,resizable=yes,dependent=yes",
                item);

            if (item.name === "")
                return;
        }

        // Item elements require a path.
        if (item.type == "item" && item.path === "")
            return;

        this.treeview.insert(item);

        this.treeview.invalidate();

        this.update();
    },

    separator: function() {
        this.treeview.insert(new Separator());
        this.update();
    },

    edit: function() {
        var index = this.treeview.selection.currentIndex;

        if (index < 0)
            return;

        window.openDialog(
            "chrome://cmis/content/edit.xul",
            null,
            "chrome,modal,centerscreen,resizable=yes,dependent=yes",
            this.treeview.items[index]);

        this.treeview.invalidate();

        this.update();
    },

    delete: function() {
        this.treeview.delete();
        this.update();
    },

    move: function(up) {
        var from = this.treeview.selection.currentIndex;
        var to;

        this.tree.focus();

        if (up) {
            if (from <= 0)
                return;

            to = from - 1;
        }
        else {
            if (from == this.treeview.rowCount - 1) {
                if (this.treeview.items[from].depth == 0)
                    return;

                to = from;
            }
            else {
                to = from + 1;
            }
        }

        this.treeview.swap(up, to, from);

        this.tree.focus();

        this.treeview.invalidate();

        this.update();
    },

    export_settings: function() {
        var branch = Services.prefs.getBranch(PREFBRANCH);

        var list = branch.getComplexValue("directoryList", Components.interfaces.nsISupportsString).data;

        var items = JSON.parse(list);

        // Translate the list into a pretty nested JSON object. This
        // will let is neglect the depth field when writing to the
        // file. Making it easier for users to manually edit.

        var data = [];

        var parent = [data];

        var depth = [0];

        var i = 0;

        while (i < items.length) {
            if (items[i].type === "submenu") {
                var submenu = items[i];
                submenu.menu = []; // Make sure menu exists.
                parent[parent.length - 1].push(submenu);
                parent.push(submenu.menu);
                depth.push(submenu.depth + 1); // Increase depth.
                i++;
                continue;
            }

            if (items[i].depth < depth[depth.length - 1]) {
                parent.pop();
                depth.pop();
                continue;
            }

            if (items[i].depth == depth[depth.length - 1]) {
                parent[parent.length - 1].push(items[i]);
                i++;
                continue;
            }
        }

        var timestamp = new Date().toISOString();

        // Some file systems do not like ':' in filenames. I am
        // looking at you Windows (/me shakes fist).
        timestamp = timestamp.replace(/:/g, "");

        var json = {
            info: "Context Menu Image Saver Menu Settings",
            version: 1.0,
            created: timestamp,
            menu: data
        };

        var str = JSON.stringify(json, function (key, value) {
            // The depth field is only useful for the treeview. We can
            // ignore it here and re-compute is again during
            // import_settings.
            if (key === "depth")
                return undefined;
            return value;
        }, "  ");

        var nsIFilePicker = Components.interfaces.nsIFilePicker;

        var fp = Components.classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        fp.init(window, "Select a File", nsIFilePicker.modeSave);

        fp.appendFilter("JSON Files", "*.json");

        fp.defaultString = "cmis-settings-" + timestamp + ".json";

        // Linux ignores this. TODO. Check so see if Windows and/or OSX does.
        fp.defaultExtension = "json";

        var res = fp.show();

        if (res == nsIFilePicker.returnCancel)
            return;

        this.write(fp.file, str);
    },

    // XXX Cmis.io.write
    write: function(file, data) {
        var outstream = FileUtils.openSafeFileOutputStream(file)

        var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);

        converter.charset = "UTF-8";

        var instream = converter.convertToInputStream(data);

        NetUtil.asyncCopy(instream, outstream, function(status) {
            if (!Components.isSuccessCode(status)) {
                return;
            }
        });
    },

    // XXX Cmis.util.error
    error: function(string) {
        var bundle = Services.strings.createBundle("chrome://cmis/locale/prompt.properties");

        Services.prompt.alert(
            null,
            bundle.GetStringFromName("errorPromptTitle"),
            bundle.GetStringFromName(string));

        Services.strings.flushBundles();
    },

    // XXX Cmis.util.flatten
    flatten: function(xs, depth) {
        var data = [];
        xs.forEach(function (x) {
            x.depth = depth;
            data.push(x);
            if (x.type === "submenu") { // XXX Fuck off long namespaces. Grrrr.
                data = data.concat(moongiraffe.Cmis.menu.items.flatten(x.menu, depth + 1));
            }
        });
        return data;
    },

    // XXX Cmis.io.read
    read: function(file, fn) {
        var channel = NetUtil.newChannel(file);

        channel.contentType = "application/json";

        NetUtil.asyncFetch(channel, function(inputStream, status) {
            if (!Components.isSuccessCode(status)) {
                return;
            }

            var data = NetUtil.readInputStreamToString(
                inputStream,
                inputStream.available(),
                { charset: "UTF-8" }); // It defaults to LATIN-1.

            fn(data);
        });
    },

    import_settings: function() {
        var nsIFilePicker = Components.interfaces.nsIFilePicker;

        var fp = Components.classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        // XXX Localize (Note: find all of the others)
        fp.init(window, "Select a File", nsIFilePicker.modeOpen);

        fp.appendFilter("JSON Files", "*.json");

        var res = fp.show();

        if (res == nsIFilePicker.returnCancel)
            return;

        this.read(fp.file, function(data) {
            var list = [];

            try {
                list = JSON.parse(data);
            } catch (e) {
                this.error("errorPromptParseSettings");
                return;
            }

            // TODO
            // validate data
            // check info string
            // check version string
            // check timestamp (dr. who)
            // check that their is actually a menu property
            // check that 'path' exists or can/should be created XXX

            var items = moongiraffe.Cmis.menu.items.flatten(list.menu, 0);

            moongiraffe.Cmis.menu.items.insert(items);
        });
    },

    generate: function() {
        var nsIFilePicker = Components.interfaces.nsIFilePicker;

        var fp = Components.classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        // XXX Localize (Note: find all of the others)
        fp.init(window, "Select a Path", nsIFilePicker.modeGetFolder);

        var res = fp.show();

        if (res == nsIFilePicker.returnCancel)
            return;

        function process(directory, depth) {
            var enumerator = directory.directoryEntries;

            var entries = [];

            // directoryEntries returns a nsISimpleEnumerator. To get
            // the number of directories we have to enumerate through
            // them.
            while (enumerator.hasMoreElements()) {
                var entry = enumerator.getNext();

                entry.QueryInterface(Components.interfaces.nsIFile);

                if (entry.isDirectory())
                    entries.push(entry);
            }

            // If there are no directories we can just return a single Item element.
            if (entries.length == 0) {
                return [new Item(depth, directory.leafName, directory.path, "")];
            }

            var data = [];

            // Otherwise first create a Submenu then an initial Item
            // so we can save in the root directory too.
            data.push(new Submenu(depth, "Here"));
            // XXX Localize
            data.push(new Item(depth + 1, directory.leafName, directory.path, ""));

            for (var i = 0; i < entries.length; i++) {
                data = data.concat(process(entries[i], depth + 1));
            }

            return data;
        }

        var items = process(fp.file, 0);

        moongiraffe.Cmis.menu.items.insert(items);
    }
};

// https://developer.mozilla.org/en/XUL_Tutorial/Tree_View_Details
// https://developer.mozilla.org/en/XUL_Tutorial/Custom_Tree_Views
// https://developer.mozilla.org/en-US/docs/XUL_Tutorial/More_Tree_Features
// https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsITreeView

function Item(depth, name, path, prefix) {
    this.type = "item";
    this.depth = depth || 0;
    this.name = name || "";
    this.path = path || "";
    this.prefix = prefix || "";
}

function Saveas(depth, name, path) {
    this.type = "saveas";
    this.depth = depth || 0;
    this.name = name || "";
    this.path = path || "";
}

function Separator(depth) {
    this.type = "separator";
    this.depth = depth || 0;
}

function Submenu(depth, name) {
    this.type = "submenu";
    this.depth = depth || 0;
    this.name = name || "";
    this.menu = [];
}

function Edit(depth, name) {
    this.type = "edit";
    this.depth = depth || 0;
    this.name = name || "";
}

function Treeview(items) {
    this.items = items;
    this.treebox = null;
    this.selection = null;
}

Treeview.prototype = {
    invalidate: function() {
        this.treebox.invalidate();
    },

    shuffleleft: function(index, nitems) {
        var temp = this.items[index];

        for (var i = index; i < index + nitems; i++)
            this.items[i] = this.items[i + 1];

        this.items[index + nitems - 1] = temp;
    },

    shuffleright: function(index, nitems) {
        var temp = this.items[index + nitems - 1];

        for (var i = index + nitems - 2; i >= index; i--)
            this.items[i + 1] = this.items[i];

        this.items[index] = temp;
    },

    containerchildren: function(index) {
        if (!(this.items[index].type === "submenu"))
            return 0;

        var children = 0;

        for (var i = 1; index + i < this.items.length; i++) {
            if (this.items[index + i].depth <= this.items[index].depth)
                break;

            children++;
        }

        return children;
    },

    // This is a beast of a function. I have commented up a storm for maintainability :DD
    swap: function(up, to, from) {
        var fromitems = this.containerchildren(from) + 1;

        if (to == from && // If we are an 'item' in the Treeview
            !(this.items[from].type === "submenu") && // that is, we are 'not' a container
            from == this.items.length - 1 && // and we are the last 'item'
            this.items[from].depth > 0) { // and the depth of the item is greater than zero
            // we need to incrementally reduce its depth.
            this.items[from].depth--;

            this.selection.select(from);

            // Otherwise the down button does not get set to hidden.
            moongiraffe.Cmis.menu.items.select();
            return;
        }

        if (from + fromitems == this.items.length && // If we are the last 'submenu' of the Treeview
            this.items[from].type === "submenu" && // that is, we 'are' a container
            !up && // we are moving downards
            this.items[from].depth > 0) { // and the depth of the submenu is greater than zero
            // we need to incrementally reduce its depth.
            for (var i = from; i < from + fromitems; i++)
                this.items[i].depth--;

            this.selection.select(from);

            // Otherwise the down button does not get set to hidden.
            moongiraffe.Cmis.menu.items.select();
            return;
        }

        if (to < from) { // Moving upwards.
            // If the item above the submenu we wish to move is an
            // element of a deeper submenu we will increase the depth
            // of the from items until we match.
            if (this.items[to].depth > this.items[from].depth) {
                for (var i = from; i < from + fromitems; i++)
                    this.items[i].depth++;

                this.selection.select(from);
                moongiraffe.Cmis.menu.items.select();
                return;
            }

            // If the item above the submenu we wish to move is a
            // submenu that is the same depth we will increase the
            // depth of the from items.
            if (this.items[to].type === "submenu" &&
                this.items[to].depth == this.items[from].depth) {
                for (var i = from; i < from + fromitems; i++)
                    this.items[i].depth++;

                this.selection.select(from);
                moongiraffe.Cmis.menu.items.select();
                return;
            }

            // If the item above is an actual submenu we have to decrease
            // the from items submenu depth.
            if (this.items[to].type === "submenu" &&
                this.items[to].depth < this.items[from].depth) {
                for (var i = from; i < from + fromitems; i++)
                    this.items[i].depth--;

                // In this case we do not return here. We still have
                // to preform the swap. To move the items out of the
                // current submenu.
            }
        }
        else { // Moving downwards.
            // We have to adjust 'to' past the 'from' submenu items.
            to = from + fromitems;
        }

        // If the depths are equal we need to preform a swap.
        if (this.items[to].depth == this.items[from].depth) {
            // If we are moving a submenu downwards and the to items
            // are also a submenu we nest it inside the new submenu.
            if (this.items[to].type === "submenu" && to > from) {
                for (var i = from; i < from + fromitems; i++)
                    this.items[i].depth++;
            }

            if (to < from) { // Moving upwards. The 'to' index marks the beginning.
                this.shuffleleft(to, fromitems + 1); // Including the 'to' item on the left.
                this.selection.select(to); // Select the new position of the submenu.
            }
            else { // Moving downwards. The 'from' index marks the beginning.
                this.shuffleright(from, fromitems + 1); // Including the 'to' item on the right.
                this.selection.select(from + 1); // Select the new position of the submenu.
            }

            return;
        }

        // If we make it here we increase or decrease the depths of
        // the from items submenu until we match with the two element.
        if (this.items[to].depth > this.items[from].depth) {
            for (var i = from; i < from + fromitems; i++)
                this.items[i].depth++;
        }
        else if (this.items[to].depth < this.items[from].depth) {
            for (var i = from; i < from + fromitems; i++)
                this.items[i].depth--;
        }

        this.selection.select(from);

        moongiraffe.Cmis.menu.items.select();
    },

    insert: function(item) {
        var index = this.selection.currentIndex;

        if (index == -1) {
            // If there is nothing selected but there are menu items so we append to the end.
            if (this.items.length > 0)
                index = this.items.length - 1;
            else // Otherwise append from the beginning.
                index = 0;
        }

        var depth = 0;

        if (this.items.length > 0) {
            depth = this.items[index].depth;

            if (this.items[index].type === "submenu")
                depth++; // Nest inside the selected submenu.
        }

        var nitems = 1;

        if (item instanceof Array) {
            nitems = item.length;

            for (var i = 0; i < item.length; i++)
                item[i] += depth; // Increment initial generated depths.
        }
        else {
            item.depth = depth;
        }

        if (this.items.length == 0 || index == this.items.length - 1)
            this.items.push(item);
        else
            Array.prototype.splice.apply(this.items, [index + 1, 0].concat(item));

        this.treebox.rowCountChanged(this.rowCount, nitems);

        this.selection.select(index + 1);

        moongiraffe.Cmis.menu.items.select();
    },

    delete: function() {
        var index = this.selection.currentIndex;

        if (index < 0) {
            return;
        }

        var nitems = this.containerchildren(index) + 1;

        this.items.splice(index, nitems);

        this.treebox.rowCountChanged(index, -nitems);

        // Keep the same index, unless we deleted the last item.
        if (this.items.length > 0 && index > 0)
            this.selection.select(index == this.items.length ? index - 1 : index);

        moongiraffe.Cmis.menu.items.select();
    },

    // The functions bellow implement nsITreeView.

    get rowCount() {
        return this.items.length;
    },

    setTree: function(treebox) {
        this.treebox = treebox;
    },

    getCellText: function(row, column) {
        switch (typeof(column) == "object" ? column.id : column) {
        case "name":
            return this.items[row].name;
        case "path":
            return this.items[row].path;
        case "prefix":
            return this.items[row].prefix;
        default:
            return "";
        }
    },

    isSeparator: function(row) {
        return this.items[row].type === "separator";
    },

    isContainer: function(row) {
        return this.items[row].type === "submenu";
    },

    getParentIndex: function(row) {
        if (this.isContainer(row))
            return -1;

        for (var index = row - 1; index >= 0 ; index--) {
            if (this.isContainer(index))
                return index;
        }

        return -1;
    },

    getLevel: function(row) {
        return this.items[row].depth;
    },

    hasNextSibling: function(row, after) {
        var level = this.getLevel(row);

        for (var index = after + 1; index < this.items.length; index++) {
            var next = this.getLevel(index);
            if (next == level)
                return true;

            if (next < level)
                break;
        }

        return false;
    },

    // Force all submenu's to always be open. This will keep the arrow
    // icon even on empty submenus. It makes it easier to determine
    // what is a subment and what is an item.
    isContainerOpen: function(row) { return true; },
    isContainerEmpty: function(row) { return false; },
    toggleOpenState: function(row) { return; },
    isSorted: function(row) { return false; },
    isEditable: function(row) { return false; },
    cycleHeader: function(col, elem) {},
    selectionChanged: function() {},
    cycleCell: function(row, col) {},
    performAction: function(action) {},
    performActionOnCell: function(action, row, col) {},
    getRowProperties: function(row,props) {},
    getCellProperties: function(row,col,props) {},
    getColumnProperties: function(colid,col,props) {},
    getImageSrc: function getImageSrc(index, column) {},

    // https://bugzilla.mozilla.org/show_bug.cgi?id=654998
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsITreeView]),
};

function $(x) {
    return document.getElementById(x);
};
