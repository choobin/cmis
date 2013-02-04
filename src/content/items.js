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
    prevpath: "",
    stack: [],
    stackpos: -1,

    load: function() {
        var list = this.loaddata();

        this.treeview = new Treeview(list);

        this.tree = $("tree");

        this.tree.view = this.treeview;

        this.treeview.invalidate();

        this.treeview.selection.select(-1);
    },

    loaddata: function() {
        var branch = Services.prefs.getBranch(PREFBRANCH);

        var list = branch.getComplexValue("directoryList", Components.interfaces.nsISupportsString).data;

        if (list === "") return [];

        this.stackpos = 0;

        this.stack[this.stackpos] = list;

        return list;
    },

    update: function() {
        var list = JSON.stringify(this.treeview.items, function (key, value) {
            if (key === "menu") // menu is only need for the import/export calls.
                return undefined;

            return value;
        }, "");

        $("cmis-undo").disabled = false;

        this.stackpos++;

        this.stack[this.stackpos] = list;

        var string = Components.classes["@mozilla.org/supports-string;1"]
            .createInstance(Components.interfaces.nsISupportsString);

        string.data = list;

        var branch = Services.prefs.getBranch(PREFBRANCH);

        branch.setComplexValue("directoryList", Components.interfaces.nsISupportsString, string);
    },

    select: function() {
        var index = this.treeview.selection.currentIndex;

        var itemindex = this.treeview.visible[index];

        var item = this.treeview.items[itemindex];

        var count = this.treeview.rowCount;

        $("button-delete").disabled = false;

        // If nothing is selected or there are no items in the list
        // or the selection index is invalid then we can not
        // delete anything.
        if (index < 0 || count == 0 || index >= count) {
            $("button-delete").disabled = true;
        }

        $("button-edit").disabled = false;

        // If nothing is selected or the selected item is a
        // separator or the selection index is invalid then we can
        // not edit anything.
        if (index < 0 || index >= count || item.type === "separator") {
            $("button-edit").disabled = true;
        }

        $("button-up").disabled = false;

        $("button-down").disabled = false;

        // If nothing is selected or there are no items in the list
        // or the selection index is invalid then we can not move
        // up or down.
        if (index < 0 || count == 0 || index >= count) {
            $("button-up").disabled = true;
            $("button-down").disabled = true;
            return;
        }

        // If we are at the top of the list and the selected item's
        // depth is 0 then we can not move further up.
        if (index == 0 && item.depth == 0) {
           $("button-up").disabled = true;
        }

        // If the selected item is a submenu and there are no other
        // items bellow its children and the _open_ submenu's depth
        // is 0 then we can not move further down.
        if (count > 0 &&
            index < count &&
            item.type === "submenu" &&
            item.open) {
            var children = this.treeview.containerchildren(itemindex);
            if (index + children == count - 1 && item.depth == 0)
                $("button-down").disabled = true;
        }

        // If we are at the bottom of the list and the item's depth
        // is 0 then we can not move further down.
        if (index == count - 1 && item.depth == 0) {
            $("button-down").disabled = true;
        }
    },

    append: function(menu) {
        this.treeview.append(menu);

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

        case "settings":
            item = new Settings();

            var bundle = Services.strings.createBundle("chrome://cmis/locale/cmis.properties");
            item.name = bundle.GetStringFromName("openSettings");
            break;
        }

        // Do not initially open edit dialog for Settings item types. Keep
        // initial "Open Settings" label. The user can modity if later
        // if they need to.
        if (type !== "settings") {
            var ret = {
                item: item,
                prevpath: this.prevpath,
                cancel: false };

            window.openDialog(
                "chrome://cmis/content/edit.xul",
                null,
                "chrome,modal,centerscreen,resizable=yes,dependent=yes",
                ret);

            if (ret.cancel)
                return;

            if (item.name === "")
                return;

            if (ret.prevpath !== "")
                moongiraffe.Cmis.menu.items.prevpath = ret.prevpath;
        }

        // Item elements require a path.
        if (item.type == "item" && item.path === "")
            return;

        this.treeview.insert(item);

        this.treeview.invalidate();

        this.update();

        Services.strings.flushBundles();
    },

    separator: function() {
        this.treeview.insert(new Separator());

        this.treeview.invalidate();

        this.update();
    },

    edit: function() {
        var index = this.treeview.selection.currentIndex;

        if (index < 0)
            return;

        var item = this.treeview.items[this.treeview.visible[index]];

        if (item.type === "separator")
            return;

        var ret = { item: item, cancel: false };

        window.openDialog(
            "chrome://cmis/content/edit.xul",
            null,
            "chrome,modal,centerscreen,resizable=yes,dependent=yes",
            ret);

        this.treeview.invalidate();

        this.update();
    },

    delete: function() {
        var rangecount = this.treeview.selection.getRangeCount();
        var start = new Object();
        var end = new Object();
        var ranges = [];

        for (var i = 0; i < rangecount; i++) {
            this.treeview.selection.getRangeAt(i, start, end);
            ranges.push({start: start.value, end: end.value});
        }

        // We iterate through each selected block in reverse,
        // furthermore, we iterate through each of these ranges
        // backwards while deleting. This way we do not have to
        // re-adjust each index after a modification to the tree.

        for (var i = ranges.length - 1; i >= 0; i--) {
            for (var j = ranges[i].end; j >= ranges[i].start; j--) {
                this.treeview.delete(j);
            }
        }

        this.update();
    },

    move: function(up) {
        var visibleindex = this.treeview.selection.currentIndex;

        var from = visibleindex;

        var fromindex = this.treeview.visible[from];

        var fromitem = this.treeview.items[fromindex];

        var to;

        if (up) {
            if (from <= 0)
                return;

            to = from - 1;
        }
        else {
            // If we are at last visible item with a depth greater
            // than zero we can still decrease the items depth.
            if (from == this.treeview.rowCount - 1) {
                if (this.treeview.items[fromindex].depth == 0)
                    return;

                to = from;
            }
            else {
                to = from + 1;
            }
        }

        var select = to;

        // If we are moving an open submenu downwards we have to
        // adjust the to index to account for the submenus children.
        if (!up &&
            fromitem.type === "submenu" &&
            fromitem.open) {
            to += this.treeview.containerchildren(fromindex);
        }

        var toindex = this.treeview.visible[to];

        var toitem = this.treeview.items[toindex];

        if (to != from && // If we are the last item or the last
            to != this.treeview.rowCount && // submenu of the tree we skip this and call swap
            fromitem.depth == toitem.depth && // otherwise, if we are at the same level
            toitem.type === "submenu" && // and we are moving into a submenu that is
            !toitem.open) { // closed
            // we can shuffle the contents of both items
            this.treeview.shuffle(up, toindex, fromindex);
            this.treeview.selection.select(select);
        }
        else {
            // Otherwise we call the old-style swap behavior on all
            // items until somebody complains about it :D
            this.treeview.swap(up, toindex, fromindex);
        }

        this.treeview.invalidate();

        this.select();

        this.update();
    },

    export_settings: function() {
        var branch = Services.prefs.getBranch(PREFBRANCH);

        var list = branch.getComplexValue("directoryList", Components.interfaces.nsISupportsString).data;

        var items = JSON.parse(list);

        // Translate the list into a pretty nested JSON object. This
        // will let us neglect the depth field when writing to the
        // file. Making it easier for users to manually edit.

        var data = [];

        var parent = [data];

        var depth = [0];

        var i = 0;

        while (i < items.length) {
            if (items[i].depth < depth[depth.length - 1]) {
                parent.pop();
                depth.pop();
                continue;
            }

            if (items[i].type === "submenu") {
                var submenu = items[i];
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

        var timestamp = new Date().toISOString();

        // Some file systems do not like ':' in filenames. I am
        // looking at you Windows (/me shakes fist).
        timestamp = timestamp.replace(/:/g, "");

        var bundle = Services.strings.createBundle("chrome://cmis/locale/cmis.properties");

        var json = {
            info: "Context Menu Image Saver Menu Settings",
            version: 1.0,
            created: timestamp,
            note: bundle.GetStringFromName("settingsNote"),
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

        fp.init(window, "", nsIFilePicker.modeSave);

        fp.appendFilter("JSON " + bundle.GetStringFromName("files"), "*.json");

        fp.appendFilters(nsIFilePicker.filterAll);

        fp.defaultString = "cmis-" + bundle.GetStringFromName("settings") + "-" + timestamp + ".json";

        fp.defaultExtension = "json";

        var res = fp.show();

        if (res == nsIFilePicker.returnCancel)
            return;

        this.write(fp.file, str);

        Services.strings.flushBundles();
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
        var bundle = Services.strings.createBundle("chrome://cmis/locale/cmis.properties");

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
            if (x.type === "submenu") {
                x.open = true; // XXX Fuck off long namespaces. Grrrr.
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

        fp.init(window, "", nsIFilePicker.modeOpen);

        var bundle = Services.strings.createBundle("chrome://cmis/locale/cmis.properties");

        fp.appendFilter("JSON " + bundle.GetStringFromName("files"), "*.json");

        Services.strings.flushBundles();

        fp.appendFilters(nsIFilePicker.filterAll);

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
            // check that 'path'
            // - contains correct path separators for OS
            // - exists
            // - isWritable

            var menu = moongiraffe.Cmis.menu.items.flatten(list.menu, 0);

            moongiraffe.Cmis.menu.items.append(menu);
        });
    },

    generate: function() {
        var nsIFilePicker = Components.interfaces.nsIFilePicker;

        var fp = Components.classes["@mozilla.org/filepicker;1"]
            .createInstance(nsIFilePicker);

        fp.init(window, "", nsIFilePicker.modeGetFolder);

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
            if (entries.length == 0) {
                return [new Item(depth, directory.leafName, directory.path, "%DEFAULT", false)];
            }

            var data = [];

            // Otherwise first create a Submenu then an initial Item
            // so we can save in the root directory too.
            data.push(new Submenu(depth, directory.leafName));

            var bundle = Services.strings.createBundle("chrome://cmis/locale/cmis.properties");

            data.push(new Item(depth + 1, bundle.GetStringFromName("here"), directory.path, "%DEFAULT", false));

            for (var i = 0; i < entries.length; i++) {
                data = data.concat(process(entries[i], depth + 1));
            }

            return data;
        }

        if (!fp.file.isWritable())
            return;

        var items = process(fp.file, 0);

        moongiraffe.Cmis.menu.items.append(items);
    },

    togglesubmenus: function(open) {
        this.treeview.togglesubmenus(open);
    },

    startdrag: function(event) {
        var index = this.treeview.selection.currentIndex;

        if (index < 0 || index > this.treeview.rowCount - 1)
            return;

        event.dataTransfer.setData("text/plain", "" + index);
    },

    undo: function() {
        if (this.stackpos == 0) return;

        this.stackpos--;

        var list = this.stack[this.stackpos];

        this.treeview.loaditems(list);

        this.treeview.invalidate();

        if (this.stackpos == 0) {
            $("cmis-undo").disabled = true;
            $("cmis-redo").disabled = false;
        }
        else {
            $("cmis-redo").disabled = false;
        }
    },

    redo: function() {
        if (this.stackpos == this.stack.length - 1) return;

        this.stackpos++;

        var list = this.stack[this.stackpos];

        this.treeview.loaditems(list);

        this.treeview.invalidate();

        if (this.stackpos == this.stack.length - 1) {
            $("cmis-undo").disabled = false;
            $("cmis-redo").disabled = true;
        }
        else {
            $("cmis-undo").disabled = false;
        }
    }
};

// https://developer.mozilla.org/en/XUL_Tutorial/Tree_View_Details
// https://developer.mozilla.org/en/XUL_Tutorial/Custom_Tree_Views
// https://developer.mozilla.org/en-US/docs/XUL_Tutorial/More_Tree_Features
// https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsITreeView
// https://developer.mozilla.org/en-US/docs/DragDrop/Drag_and_Drop
// https://developer.mozilla.org/en-US/docs/DragDrop/DataTransfer

function Item(depth, name, path, format, saveas) {
    this.type = "item";
    this.depth = depth || 0;
    this.name = name || "";
    this.path = path || "";
    this.format = format || "";
    this.saveas = saveas || false;
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
    this.open = true;
}

function Settings(depth, name) {
    this.type = "settings";
    this.depth = depth || 0;
    this.name = name || "";
}

function Treeview(list) {
    this.treebox = null;
    this.selection = null;
    this.items = [];
    this.visible = [];
    this.loaditems(list);
    this.computevisible();
}

Treeview.prototype = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsITreeView]),

    computevisible: function() {
        this.visible = [];

        var i = 0;

        while (i < this.items.length) {
            this.visible.push(i);

            if (this.items[i].type === "submenu" && // isContainer(i) checks this.visible[i]
                !this.items[i].open) {
                i += this.containerchildren(i); // skip children
            }

            i++;
        }
    },

    loaditems: function(list) {
        var oldlength = this.visible.length;

        var data = JSON.parse(list);

        data.forEach(function (item) {
            // If a submenu item does not have an open field we set it
            // to open. This will prevent the need to another update
            // function in bootstrap.js.
            if (item.type === "submenu" && item.open === undefined)
                item.open = true;
        });

        this.items = data;

        this.computevisible();

        var change = this.visible.length - oldlength;

        if (this.treebox) // Only needed if we are preforming an undo/redo operation
            this.treebox.rowCountChanged(this.rowCount, change);
    },

    invalidate: function() {
        this.computevisible();

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

    reverse: function(index, nitems) {
        for (var i = 0; i < nitems / 2; i++) {
            var temp = this.items[index + i];
            this.items[index + i] = this.items[index + nitems - 1 - i];
            this.items[index + nitems - 1 - i] = temp;
        }
    },

    containerchildren: function(index) {
        if (!(this.items[index].type === "submenu"))
            return 0;

        var depth = this.items[index].depth;

        var children = 0;

        for (var i = index + 1; i < this.items.length; i++) {
            if (this.items[i].depth <= depth)
                break;

            children++;
        }

        return children;
    },

    shuffle: function(up, to, from) {
        if (from > to) {
            var temp = to;
            to = from;
            from = temp;
        }

        var fromitems = this.containerchildren(from) + 1;

        var toitems = this.containerchildren(to) + 1;

        // Feels good man.
        this.reverse(from, fromitems);
        this.reverse(to, toitems);
        this.reverse(from, fromitems + toitems);
    },

    visibleindex: function(index) {
        var position = 0;

        var i = 0;

        while (i < index) {
            if (this.items[i].type === "submenu" && // isContainer(i) checks this.visible[i]
                !this.items[i].open) {
                i += this.containerchildren(i); // skip children
            }

            i++;

            position++;
        }

        return position;
    },

    swap: function(up, to, from) {
        var fromitems = this.containerchildren(from) + 1;

        var select;

        if (to == from && // If we are an 'item' in the Treeview
            !(this.items[from].type === "submenu") && // that is, we are 'not' a container
            from == this.items.length - 1 && // and we are the last 'item'
            this.items[from].depth > 0) { // and the depth of the item is greater than zero
            // we need to incrementally reduce its depth.
            this.items[from].depth--;

            select = this.visibleindex(from);
            this.selection.select(select);
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

            select = this.visibleindex(from);
            this.selection.select(select);
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

                select = this.visibleindex(from);
                this.selection.select(select);
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

                select = this.visibleindex(from);
                this.selection.select(select);
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
                select = this.visibleindex(to);
                this.selection.select(select); // Select the new position of the submenu.
            }
            else { // Moving downwards. The 'from' index marks the beginning.
                this.shuffleright(from, fromitems + 1); // Including the 'to' item on the right.
                select = this.visibleindex(from + 1);
                this.selection.select(select); // Select the new position of the submenu.
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

        select = this.visibleindex(from);
        this.selection.select(select);
        moongiraffe.Cmis.menu.items.select();
    },

    append: function(menu) {
        var oldlength = this.visible.length;

        this.items = this.items.concat(menu);

        this.computevisible();

        var change = this.visible.length - oldlength;

        this.treebox.rowCountChanged(this.rowCount, change);

        this.treebox.invalidate();

        moongiraffe.Cmis.menu.items.select();
    },

    insert: function(item) {
        var visibleindex = this.selection.currentIndex;

        var index = this.visible[visibleindex];

        // If there is nothing selected or the selection index is
        // invalid then we have to find an appropriate index.
        if (index == -1 || index >= this.items.length) {
            // If there are menu items we append to the end.
            if (this.items.length > 0)
                index = this.items.length - 1;
            else // Otherwise we append from the start.
                index = 0;
        }

        var depth = 0;

        if (this.items.length > 0) {
            var parent = this.items[index];

            depth = parent.depth;

            if (parent.type === "submenu") {
                if (parent.open) {
                    // Only nest inside selected submenu items if they are open.
                    depth++;
                }
                else {
                    // If the submenu is closed we need to insert it bellow its children.
                    index += this.containerchildren(index);
                }
            }
        }

        item.depth = depth;

        this.items.splice(index + 1, 0, item);

        this.computevisible();

        this.treebox.rowCountChanged(this.rowCount, 1);

        this.selection.select(visibleindex + 1);

        moongiraffe.Cmis.menu.items.select();
    },

    delete: function(index) {
        if (index < 0 || index > this.rowCount - 1) {
            return;
        }

        var nitems = this.containerchildren(this.visible[index]) + 1;

        var oldlength = this.visible.length;

        this.items.splice(this.visible[index], nitems);

        this.computevisible();

        var change = this.visible.length - oldlength;

        this.treebox.rowCountChanged(index, change);

        // We want to keep the original selection value although if
        // we just deleted the final item then we need to move the
        // selection upwards.
        if (index == this.visible.length)
            index--;

        this.selection.select(index);

        moongiraffe.Cmis.menu.items.select();
    },

    get rowCount() {
        return this.visible.length;
    },

    setTree: function(treebox) {
        this.treebox = treebox;
    },

    getCellText: function(row, column) {
        var item = this.items[this.visible[row]];

        switch (typeof(column) == "object" ? column.id : column) {
        case "name":
            return item.name || "";
        case "path":
            return item.path || "";
        case "format":
            return item.format || "";
        default:
            return "";
        }
    },

    isSeparator: function(row) {
        return this.items[this.visible[row]].type === "separator";
    },

    isContainer: function(row) {
        return this.items[this.visible[row]].type === "submenu";
    },

    isContainerOpen: function(row) {
        return this.items[this.visible[row]].open;
    },

    // We return false here for every container (submenu). Even if
    // they are acutally empty. On a lot of OS/FF(version/build)
    // combinations an empty submenu contains no image. This make it
    // hard to distinguish an submenu from a menu item.
    isContainerEmpty: function(row) {
        return false;
    },

    isSorted: function(row) {
        return false;
    },

    isEditable: function(row) {
        return false;
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
        return this.items[this.visible[row]].depth;
    },

    hasNextSibling: function(row, after) {
        var level = this.getLevel(row);

        for (var index = after + 1; index < this.visible.length; index++) {
            var next = this.getLevel(index);
            if (next == level)
                return true;

            if (next < level)
                break;
        }

        return false;
    },

    toggleOpenState: function(row) {
        if (!this.isContainer(row)) return;

        var item = this.items[this.visible[row]];

        if (item.open) {
            item.open = false;
        }
        else {
            item.open = true;
        }

        this.updatevisible(row);
    },

    togglesubmenus: function(open) {
        this.items.forEach(function (item) {
            if (item.type === "submenu")
                item.open = open;
        });

        this.updatevisible(0);
    },

    updatevisible: function(row) {
        var oldcount = this.visible.length;

        this.computevisible();

        var change = this.visible.length - oldcount;

        this.treebox.rowCountChanged(row + 1, change);

        this.treebox.invalidateRow(row);

        moongiraffe.Cmis.menu.items.update();
    },

    canDrop: function(index, orientation, transfer) {
        // Prevent dropping data on top of containers (submenus). This
        // way we can only drop before or after items and/or submenus
        // making this code much easier to deal with.
        if (orientation == 0 /* DROP_ON */)
            return false;

        var from = parseInt(transfer.getData("text/plain"));

        var fromindex = this.visible[from];

        var fromitem = this.items[fromindex];

        var to = index;

        var next = this.visible.length + 1; // Out of bounds.

        for (var i = from + 1; i < this.visible.length; i++) {
            if (this.items[this.visible[i]].depth <= fromitem.depth) {
                next = i;
                break;
            }
        }

        if (to < from) return true;

        // Prevent dropping a submenu on itself.
        if (to >= next) return true;

        return false;
    },

    drop: function(row, orientation, transfer) {
        var from = parseInt(transfer.getData("text/plain"));

        var fromindex = this.visible[from];

        var fromitem = this.items[fromindex];

        var to = row;

        var toindex = this.visible[to];

        var toitem = this.items[toindex];

        var offset = toitem.depth - fromitem.depth;

        if (orientation == 1 /* DROP_AFTER */ &&
            toitem.type === "submenu") {
            if (toitem.open) {
                // If we are dropping into an open submenu we need to
                // nest fromitems inside it
                offset++;
            }
            else {
                // If we are dropping after a closed submenu we have
                // to adjust its offset past its children too
                toindex += this.containerchildren(toindex);
            }
        }

        var fromchildren = this.containerchildren(fromindex);

        var fromitems = this.items.splice(fromindex, fromchildren + 1);

        // If we are dropping after a menu item we need to splice the
        // data using the position /after/ toindex
        if (orientation == 1 /* DROP_AFTER */)
            toindex++;

        // If we are draging an item or submenu downwards we have to
        // adjust the to index once we splice the from elements
        if (toindex > fromindex)
            toindex = toindex - (fromchildren + 1);

        fromitems.forEach(function (item) {
            item.depth += offset;
        });

        Array.prototype.splice.apply(this.items, [toindex, 0].concat(fromitems));

        this.invalidate();

        this.selection.select(to);

        moongiraffe.Cmis.menu.items.select();

        moongiraffe.Cmis.menu.items.update();
    },

    cycleHeader: function(col, elem) {},
    selectionChanged: function() {},
    cycleCell: function(row, col) {},
    performAction: function(action) {},
    performActionOnCell: function(action, row, col) {},
    getRowProperties: function(row,props) {},
    getCellProperties: function(row,col,props) {},
    getColumnProperties: function(colid,col,props) {},
    getImageSrc: function(row, column) {},
};

function $(x) {
    return document.getElementById(x);
};
