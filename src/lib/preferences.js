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

const PREFBRANCH = "extensions.cmis@moongiraffe.net.";

Cmis.preferences = {
    startup: function() {
        Cmis.preferences.defaults();

        Services.prefs.addObserver(PREFBRANCH + "directoryList", Cmis.menu, false);
        Services.prefs.addObserver(PREFBRANCH + "itemPlacement", Cmis.menu, false);

        Services.obs.addObserver(Cmis.preferences, "addon-options-displayed", false);
    },

    shutdown: function() {
        Services.prefs.removeObserver(PREFBRANCH + "directoryList", Cmis.menu);
        Services.prefs.removeObserver(PREFBRANCH + "itemPlacement", Cmis.menu);

        Services.obs.removeObserver(Cmis.preferences, "addon-options-displayed");
    },

    uninstall: function() {
        Services.prefs.deleteBranch(PREFBRANCH);
    },

    defaults: function() {
        let branch = Services.prefs.getDefaultBranch(PREFBRANCH);

        branch.setIntPref("directoryListVersion", 1);

        let string = Components
            .classes["@mozilla.org/supports-string;1"]
            .createInstance(Components.interfaces.nsISupportsString);

        string.data = "";

        branch.setComplexValue(
            "directoryList",
            Components.interfaces.nsISupportsString,
            string);

        branch.setComplexValue(
            "previousSaveAsDirectory",
            Components.interfaces.nsISupportsString,
            string);

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
                let string = Components
                    .classes["@mozilla.org/supports-string;1"]
                    .createInstance(Components.interfaces.nsISupportsString);

                string.data = value;

                branch.setComplexValue(key, Components.interfaces.nsISupportsString, string);

                return null;
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
            return null;
        }

        return get(key);
    },

    observe: function(subject, topic, data) {
        if (topic === "addon-options-displayed" && data === "cmis@choobin") {
            let document = subject;

            let button = document.getElementById("cmis-settings-button");

            button.addEventListener("command", Cmis.menu.loadoptions, false);
        }
    }
};
