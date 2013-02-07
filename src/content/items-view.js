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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

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

// https://developer.mozilla.org/en/XUL_Tutorial/Tree_View_Details
// https://developer.mozilla.org/en/XUL_Tutorial/Custom_Tree_Views
// https://developer.mozilla.org/en-US/docs/XUL_Tutorial/More_Tree_Features
// https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsITreeView
// https://developer.mozilla.org/en-US/docs/DragDrop/Drag_and_Drop
// https://developer.mozilla.org/en-US/docs/DragDrop/DataTransfer

let ItemsView = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsITreeView]),

    treebox: null,

    selection: null,

    items: [],

    visible: [],

    load: function() {
        let list = Utility.fetchList();

        this.loadItems(list);

        let tree = $("tree");

        tree.view = this;

        this.invalidate();

        this.selection.select(-1);
    },

    selectedItem: function () {
        return this.itemAt(this.selection.currentIndex);
    },

    itemAt: function(index) {
        if (index < 0 || index >= this.rowCount)
            return null;

        return this.items[this.visible[index]];
    },

    // Comutre the visible index array from the raw items
    computeVisible: function() {
        this.visible = [];

        let i = 0;

        while (i < this.items.length) {
            this.visible.push(i);

            // isContainer(i) checks this.visible[i]
            if (this.items[i].type === "submenu" &&
               !this.items[i].open) {
                i += this.containerChildren(i); // skip children
            }

            i++;
        }
    },

    loadItems: function(list) {
        if (list === "") return;

        let oldlength = this.visible.length;

        let data = JSON.parse(list);

        this.items = data;

        this.computeVisible();

        let change = this.visible.length - oldlength;

        if (this.treebox) // Only needed if we are preforming an undo/redo operation
            this.treebox.rowCountChanged(this.rowCount, change);
    },

    invalidate: function() {
        this.computeVisible();

        this.treebox.invalidate();
    },

    shuffleLeft: function(index, nitems) {
        let temp = this.items[index];

        for (let i = index; i < index + nitems; i++)
            this.items[i] = this.items[i + 1];

        this.items[index + nitems - 1] = temp;
    },

    shuffleRight: function(index, nitems) {
        let temp = this.items[index + nitems - 1];

        for (let i = index + nitems - 2; i >= index; i--)
            this.items[i + 1] = this.items[i];

        this.items[index] = temp;
    },

    reverse: function(index, nitems) {
        for (let i = 0; i < nitems / 2; i++) {
            let temp = this.items[index + i];

            this.items[index + i] = this.items[index + nitems - 1 - i];

            this.items[index + nitems - 1 - i] = temp;
        }
    },

    // Swaps two item in the tree (can be containers).
    shuffle: function(to, from) {
        if (from > to) {
            let temp = to;
            to = from;
            from = temp;
        }

        let fromitems = this.containerChildren(from) + 1;

        let toitems = this.containerChildren(to) + 1;

        // Feels good man.
        this.reverse(from, fromitems);
        this.reverse(to, toitems);
        this.reverse(from, fromitems + toitems);

        let select = this.visibleIndex(from);

        this.selection.select(select);
    },

    // Returns the total number of children of a container type
    containerChildren: function(index) {
        if (this.items[index].type !== "submenu")
            return 0;

        let depth = this.items[index].depth;

        let children = 0;

        for (let i = index + 1; i < this.items.length; i++) {
            if (this.items[i].depth <= depth)
                break;

            children++;
        }

        return children;
    },

    // Returns the numner of _visible_ children of a container type
    visibleChildren: function(index) {
        let item = this.items[index];

        if (item.type !== "submenu")
            return 0;

        if (!item.open)
            return 0;

        let children = 0;

        let i = index + 1;

        while (i < this.items.length) {
            if (this.items[i].depth <= item.depth)
                break;

            // isContainer(i) checks this.visible[i]
            if (this.items[i].type === "submenu" &&
               !this.items[i].open) {
                i += this.containerChildren(i); // skip children
            }

            i++;

            children++;
        }

        return children;
    },

    // Translates items[index] to an index in the visible view
    visibleIndex: function(index) {
        let position = 0;

        let i = 0;

        while (i < index) {
            // isContainer(i) checks this.visible[i]
            if (this.items[i].type === "submenu" &&
               !this.items[i].open) {
                i += this.containerChildren(i); // skip children
            }

            i++;

            position++;
        }

        return position;
    },

    // Swaps two items (can be containers) and reasjusts depths along the way.
    swap: function(up, to, from) {
        let fromitems = this.containerChildren(from) + 1;

        let select;

        if (to == from && // If we are an 'item' in the Treeview
            !(this.items[from].type === "submenu") && // that is, we are 'not' a container
            from == this.items.length - 1 && // and we are the last 'item'
            this.items[from].depth > 0) { // and the depth of the item is greater than zero
            // we need to incrementally reduce its depth.
            this.items[from].depth--;

            select = this.visibleIndex(from);
            this.selection.select(select);
            return;
        }

        if (from + fromitems == this.items.length && // If we are the last 'submenu' of the Treeview
            this.items[from].type === "submenu" && // that is, we 'are' a container
            !up && // we are moving downwards
            this.items[from].depth > 0) { // and the depth of the submenu is greater than zero
            // we need to incrementally reduce its depth.
            for (let i = from; i < from + fromitems; i++)
                this.items[i].depth--;

            select = this.visibleIndex(from);
            this.selection.select(select);
            return;
        }

        if (to < from) { // Moving upwards.
            // If the item above the submenu we wish to move is an
            // element of a deeper submenu we will increase the depth
            // of the from items until we match.
            if (this.items[to].depth > this.items[from].depth) {
                for (let i = from; i < from + fromitems; i++)
                    this.items[i].depth++;

                select = this.visibleIndex(from);
                this.selection.select(select);
                return;
            }

            // If the item above the submenu we wish to move is a
            // submenu that is the same depth we will increase the
            // depth of the from items.
            if (this.items[to].type === "submenu" &&
                this.items[to].depth == this.items[from].depth) {
                for (let i = from; i < from + fromitems; i++)
                    this.items[i].depth++;

                select = this.visibleIndex(from);
                this.selection.select(select);
                return;
            }

            // If the item above is an actual submenu we have to decrease
            // the from items submenu depth.
            if (this.items[to].type === "submenu" &&
                this.items[to].depth < this.items[from].depth) {
                for (let i = from; i < from + fromitems; i++)
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
                for (let i = from; i < from + fromitems; i++)
                    this.items[i].depth++;
            }

            if (to < from) { // Moving upwards. The 'to' index marks the beginning.
                this.shuffleLeft(to, fromitems + 1); // Including the 'to' item on the left.
                select = this.visibleIndex(to);
                this.selection.select(select); // Select the new position of the submenu.
            }
            else { // Moving downwards. The 'from' index marks the beginning.
                this.shuffleRight(from, fromitems + 1); // Including the 'to' item on the right.
                select = this.visibleIndex(from + 1);
                this.selection.select(select); // Select the new position of the submenu.
            }

            return;
        }

        // If we make it here we increase or decrease the depths of
        // the from items submenu until we match with the two element.
        if (this.items[to].depth > this.items[from].depth) {
            for (let i = from; i < from + fromitems; i++)
                this.items[i].depth++;
        }
        else if (this.items[to].depth < this.items[from].depth) {
            for (let i = from; i < from + fromitems; i++)
                this.items[i].depth--;
        }

        select = this.visibleIndex(from);
        this.selection.select(select);
    },

    appendItems: function(menu) {
        let oldlength = this.visible.length;

        this.items = this.items.concat(menu);

        this.computeVisible();

        let change = this.visible.length - oldlength;

        this.treebox.rowCountChanged(this.rowCount, change);

        this.treebox.invalidate();

        ItemsActions.selectItem();
    },

    insert: function(item) {
        let visibleindex = this.selection.currentIndex;

        let index = this.visible[visibleindex];

        // If there is nothing selected or the selection index is
        // invalid then we have to find an appropriate index.
        if (index == -1 || index >= this.items.length) {
            // If there are menu items we append to the end.
            if (this.items.length > 0)
                index = this.items.length - 1;
            else // Otherwise we append from the start.
                index = 0;
        }

        let depth = 0;

        if (this.items.length > 0) {
            let parent = this.items[index];

            depth = parent.depth;

            if (parent.type === "submenu") {
                if (parent.open) // Only nest inside selected submenu items if they are open.
                    depth++;
                else // If the submenu is closed we need to insert it bellow its children.
                    index += this.containerChildren(index);
            }
        }

        item.depth = depth;

        this.items.splice(index + 1, 0, item);

        this.computeVisible();

        this.treebox.rowCountChanged(this.rowCount, 1);

        this.selection.select(visibleindex + 1);
    },

    deleteItem: function(index) {
        if (index < 0 || index > this.rowCount - 1)
            return;

        let nitems = this.containerChildren(this.visible[index]) + 1;

        let oldlength = this.visible.length;

        this.items.splice(this.visible[index], nitems);

        this.computeVisible();

        let change = this.visible.length - oldlength;

        this.treebox.rowCountChanged(index, change);

        // We want to keep the original selection value although if
        // we just deleted the final item then we need to move the
        // selection upwards.
        if (index == this.visible.length)
            index--;

        this.selection.select(index);
    },

    get rowCount() {
        return this.visible.length;
    },

    setTree: function(treebox) {
        this.treebox = treebox;
    },

    getCellText: function(row, column) {
        let item = this.items[this.visible[row]];

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

        for (let index = row - 1; index >= 0 ; index--) {
            if (this.isContainer(index))
                return index;
        }

        return -1;
    },

    getLevel: function(row) {
        return this.items[this.visible[row]].depth;
    },

    hasNextSibling: function(row, after) {
        let level = this.getLevel(row);

        for (let index = after + 1; index < this.visible.length; index++) {
            let next = this.getLevel(index);

            if (next == level)
                return true;

            if (next < level)
                break;
        }

        return false;
    },

    toggleOpenState: function(row) {
        if (!this.isContainer(row)) return;

        let item = this.items[this.visible[row]];

        if (item.open)
            item.open = false;
        else
            item.open = true;

        this.updateVisible(row);

        ItemsActions.update();
    },

    toggleSubmenus: function(open) {
        this.items.forEach(function (item) {
            if (item.type === "submenu")
                item.open = open;
        });

        this.updateVisible(0);
    },

    updateVisible: function(row) {
        let oldcount = this.visible.length;

        this.computeVisible();

        let change = this.visible.length - oldcount;

        this.treebox.rowCountChanged(row + 1, change);

        this.treebox.invalidateRow(row);
    },

    canDrop: function(index, orientation, transfer) {
        // Prevent dropping data on top of containers (submenus). This
        // way we can only drop before or after items and/or submenus
        // making this code much easier to deal with.
        if (orientation == 0 /* DROP_ON */)
            return false;

        // Allow DROP_BEFORE _only_ on the first element of the
        // treeview. This way we can insert items above the first
        // element.
        if (orientation == -1 /* DROP_BEFORE */ && index == 0)
            return true;

        // Banned! DROP_BEFORE *ruined* Christmas! After countless
        // hours hacking at a custom treeview with DROP_BEFORE and
        // DROP_AFTER enabled, it was just too unpredictable... Well,
        // nasty. Really nasty. At the moment I am only allowing
        // DROP_AFTER. This makes the drop function significantly
        // easier to deal with. For me, and for the rest of humanity.
        if (orientation == -1 /* DROP_BEFORE */)
            return false;

        let from = parseInt(transfer.getData("text/plain"));

        let fromindex = this.visible[from];

        let fromitem = this.items[fromindex];

        let to = index;

        let next = this.visible.length + 1; // Out of bounds.

        for (let i = from + 1; i < this.visible.length; i++) {
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
        let from = parseInt(transfer.getData("text/plain"));

        let fromindex = this.visible[from];

        let fromitem = this.items[fromindex];

        let fromvisible = this.visibleChildren(fromindex);

        let to = row;

        let toindex = this.visible[to];

        let toitem = this.items[toindex];

        let offset = toitem.depth - fromitem.depth;

        if (orientation == 1 && toitem.type === "submenu") {
            // If we are inserting a new item or submenu after an
            // _open_ submenu we nest it inside the submenu.
            if (toitem.open) {
                offset++;
            }
            // If we are inserting something into a _closed_ submenu
            // we skip its elements and insert them after it.
            else {
                toindex += this.containerChildren(toindex);
            }
        }

        let fromchildren = this.containerChildren(fromindex);

        let fromitems = this.items.splice(fromindex, fromchildren + 1);

        // DROP_AFTER orientation needs to move toindex to the next
        // position before splicing.
        if (orientation == 1 /* DROP_AFTER */)
            toindex++;

        // If we are draging an item or submenu downwards we have to
        // adjust the to index once we splice fromitems.
        if (toindex > fromindex)
            toindex -= (fromchildren + 1);

        fromitems.forEach(function (item) {
            item.depth += offset;
        });

        Array.prototype.splice.apply(this.items, [toindex, 0].concat(fromitems));

        this.invalidate();

        // Search for the correct select index. Because who the fuck
        // knows what value it is. Even though I restrict orientation
        // to DROP_AFTER it still baffles me how the index seems to
        // randomly change (just to spite me (I swear! (oah the
        // humanity~~~~~))).
        let i = 0;
        while (i < this.visible.length) {
            if (this.items[this.visible[i]] === fromitem)
                break;

            i++;
        }

        this.selection.select(i);

        ItemsActions.update();
    },

    getCellProperties: function(row, column, properties) {
        if (column.index != 1)
            return;

        let item = this.itemAt(row);

        if (item.type !== "item")
            return;

        if (Utility.isValidPath(item.path))
            return;

        var nsIAtomService = Components
            .classes["@mozilla.org/atom-service;1"]
            .getService(Components.interfaces.nsIAtomService);

        properties.AppendElement(nsIAtomService.getAtom("invalidPath"));
    },

    cycleHeader: function(col, elem) {},
    selectionChanged: function() {},
    cycleCell: function(row, col) {},
    performActions: function(action) {},
    performActionsOnCell: function(action, row, col) {},
    getRowProperties: function(row,props) {},
    getColumnProperties: function(colid,col,props) {},
    getImageSrc: function(row, column) {},
};

window.addEventListener("load", function() {
    ItemsView.load();
}, false);
