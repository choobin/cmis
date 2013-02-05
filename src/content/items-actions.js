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

let ItemsActions = {
    stack: [],

    stackPos: -1,

    previousPath: "",

    load: function() {
        this.stackpos = 0;

        this.stack[this.stackpos] = Utility.fetchList();
    },

    update: function() {
        ItemsView.invalidate();

        Utility.updateList();

        $("cmis-undo").disabled = false;

        this.stackPos++;

        this.stack[this.stackPos] = Utility.fetchList();

        this.selectItem();
    },

    selectItem: function() {
        let index = ItemsView.selection.currentIndex;

        let itemindex = ItemsView.visible[index];

        let item = ItemsView.items[itemindex];

        let count = ItemsView.rowCount;

        $("button-delete").disabled = false;

        // If nothing is selected or there are no items in the list
        // or the selection index is invalid then we can not
        // delete anything.
        if (index < 0 || count == 0 || index >= count)
            $("button-delete").disabled = true;

        $("button-edit").disabled = false;

        // If nothing is selected or the selected item is a
        // separator or the selection index is invalid then we can
        // not edit anything.
        if (index < 0 || index >= count || item.type === "separator")
            $("button-edit").disabled = true;

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
        if (index == 0 && item.depth == 0)
           $("button-up").disabled = true;

        // If the selected item is a submenu and there are no other
        // items bellow its children and the _open_ submenu's depth
        // is 0 then we can not move further down.
        if (count > 0 &&
            index < count &&
            item.type === "submenu" &&
            item.open) {
            let children = ItemsView.visibleChildren(itemindex);
            if (index + children == count - 1 && item.depth == 0)
                $("button-down").disabled = true;
        }

        // If we are at the bottom of the list and the item's depth
        // is 0 then we can not move further down.
        if (index == count - 1 && item.depth == 0)
            $("button-down").disabled = true;
    },

    newItem: function(type) {
        let item;

        switch (type) {
        case "item":
            item = new Item();
            break;

        case "submenu":
            item = new Submenu();
            break;

        case "settings":
            item = new Settings();

            let bundle = Utility.stringBundle();

            item.name = bundle.GetStringFromName("openSettings");

            Services.strings.flushBundles();
            break;

        case "separator":
            item = new Separator();
            break;
        }

        // Do not initially open edit dialog for Settings item
        // types. Keep initial "Open Settings" label. The user can
        // modity if later if they need to. Furthermore, we can skip
        // this if we are a separator item.
        if (type === "item" || type === "submenu") {
            let data = {
                item: item,
                previousPath: this.previousPath,
                cancel: false
            };

            window.openDialog(
                "chrome://cmis/content/edit.xul",
                null,
                "chrome,modal,centerscreen,resizable=yes,dependent=yes",
                data);

            if (data.cancel)
                return;

            if (item.name === "")
                return;

            if (data.previousPath !== "")
                this.previousPath = data.previousPath;
        }

        // Item elements require a path.
        if (item.type === "item" && item.path === "")
            return;

        ItemsView.insert(item);

        this.update();
    },

    editItem: function() {
        let item = ItemsView.selectedItem();

        if (!item)
            return;

        if (item.type === "separator")
            return;

        let data = {
            item: item,
            cancel: false
        };

        window.openDialog(
            "chrome://cmis/content/edit.xul",
            null,
            "chrome,modal,centerscreen,resizable=yes,dependent=yes",
            data);

        if (data.cancel)
            return;

        this.update();
    },

    deleteItem: function() {
        let rangecount = ItemsView.selection.getRangeCount();
        let start = new Object();
        let end = new Object();
        let ranges = [];

        for (let i = 0; i < rangecount; i++) {
            ItemsView.selection.getRangeAt(i, start, end);

            ranges.push({start: start.value, end: end.value});
        }

        // We iterate through each selected block in reverse,
        // furthermore, we iterate through each of these ranges
        // backwards while deleting. This way we do not have to
        // re-adjust each index after a modification to the tree.

        for (let i = ranges.length - 1; i >= 0; i--) {
            for (let j = ranges[i].end; j >= ranges[i].start; j--) {
                ItemsView.deleteItem(j);
            }
        }

        this.update();
    },

    moveUp: function() {
        let from = ItemsView.selection.currentIndex;;

        if (from <= 0)
            return;

        let fromindex = ItemsView.visible[from];

        let fromitem = ItemsView.items[fromindex];

        let to = from - 1;

        let toindex = ItemsView.visible[to];

        let toitem = ItemsView.items[toindex];

        if (fromitem.depth == toitem.depth && // If to and from are at the same level
            toitem.type === "submenu" && // and we are moving into a submenu that is
           !toitem.open) { // closed we can shuffle the contents of both items
            ItemsView.shuffle(toindex, fromindex);
        }
        else {
            ItemsView.swap(true, toindex, fromindex);
        }

        this.update();
    },

    moveDown: function() {
        let from = ItemsView.selection.currentIndex;

        let fromindex = ItemsView.visible[from];

        let fromitem = ItemsView.items[fromindex];

        let fromchildren = ItemsView.visibleChildren(fromindex);

        // If we are at last visible item or submenu with a depth
        // greater than zero we can still decrease the items depth.
        if (from == ItemsView.rowCount - 1 ||
            from + fromchildren == ItemsView.rowCount - 1) {
            if (ItemsView.items[fromindex].depth == 0)
                return;

            // Special case. Swap will reduce the submenu's depth.
            ItemsView.swap(false, fromindex, fromindex);
        }
        else {
            let to = from + fromchildren + 1;

            let toindex = ItemsView.visible[to];

            let toitem = ItemsView.items[toindex];

            if (fromitem.depth == toitem.depth && // If to and from are at the same level
                toitem.type === "submenu" && // and we are moving into a submenu that is
               !toitem.open) { // closed we can shuffle the contents of both items
                ItemsView.shuffle(toindex, fromindex);
                ItemsView.selection.select(from + 1);
            }
            else {
                ItemsView.swap(false, toindex, fromindex);
            }
        }

        this.update();
    },

    appendItems: function(items) {
        ItemsView.appendItems(items);

        this.update();
    },

    toggleSubmenus: function(open) {
        ItemsView.toggleSubmenus(open);

        this.update();
    },

    startDrag: function(event) {
        let index = ItemsView.selection.currentIndex;

        if (index < 0 || index > ItemsView.rowCount - 1)
            return;

        event.dataTransfer.setData("text/plain", "" + index);
    },

    selectAll: function() {
        ItemsView.selection.selectAll();
    },

    undoAction: function() {
        if (this.stackPos == 0) return;

        this.stackPos--;

        let list = this.stack[this.stackPos];

        ItemsView.loadItems(list);

        ItemsView.invalidate();

        if (this.stackPos == 0) {
            $("cmis-undo").disabled = true;
            $("cmis-redo").disabled = false;
        }
        else {
            $("cmis-redo").disabled = false;
        }
    },

    redoAction: function() {
        if (this.stackPos == this.stack.length - 1) return;

        this.stackPos++;

        let list = this.stack[this.stackPos];

        ItemsView.loadItems(list);

        ItemsView.invalidate();

        if (this.stackPos == this.stack.length - 1) {
            $("cmis-undo").disabled = false;
            $("cmis-redo").disabled = true;
        }
        else {
            $("cmis-undo").disabled = false;
        }
    }
};

window.addEventListener("load", function() {
    ItemsActions.load();
}, false);
