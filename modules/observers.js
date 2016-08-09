/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");
Components.utils.import("resource://gre/modules/Timer.jsm");

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calProviderUtils.jsm");

Components.utils.import("resource://todotxt/logger.jsm");
Components.utils.import("resource://todotxt/todoclient.js");
Components.utils.import("resource://todotxt/todo-txt-js/todotxt.js");

EXPORTED_SYMBOLS = ['timerObserver','prefObserver'];

/*
 * Observer for notices of timers for synchronization process
 */
var timerObserver = {

  calendar: null,
  checkSum: null,

  register: function(cal) {
    this.calendar = cal;
    todotxtLogger.debug('timerObserver','register');
  },

  unregister: function() {
    this.calendar = null;
    if(this.timer) timer.cancel();

    todotxtLogger.debug('timerObserver','unregister');
  },

  // Verify if todo & done file changed by
  // comparing MD5 checksum, if different refresh calendar
  observe: function(aSubject, aTopic, aData) {
    todotxtLogger.debug('timerObserver:observer','subject['+aSubject+'] topic['+aTopic+']');
    let old_checksum = this.checkSum;
    this.checkSum = this.calculateMD5();

    // Verify if not first run, old_checksum != undef
    if(old_checksum){
      if(old_checksum != this.checkSum){
        todotxtLogger.debug('timerObserver','refresh');
        this.calendar.refresh();
      }
    }
  },

  notify: function(timer){
    todotxtLogger.debug('timerObserver','notify');
    this.checkSum = this.calculateMD5();
  },

  calculateMD5: function(){
    let prefs = todoClient.getPreferences();

    // this tells updateFromStream to read the entire file
    const PR_UINT32_MAX = 0xffffffff;

    // Use MD5, hash for comparison and needs to be fast not secure
    let ch = Components.classes["@mozilla.org/security/hash;1"]
                         .createInstance(Components.interfaces.nsICryptoHash);
    ch.init(ch.MD5);

    todoFile = prefs.getComplexValue("todo-txt", Components.interfaces.nsIFile);
    doneFile = prefs.getComplexValue("done-txt", Components.interfaces.nsIFile);

    let todoIstream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                              .createInstance(Components.interfaces.nsIFileInputStream);
    let doneIstream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                              .createInstance(Components.interfaces.nsIFileInputStream);

    // open files for reading
    todoIstream.init(todoFile, 0x01, 0444, 0);
    doneIstream.init(doneFile, 0x01, 0444, 0);

    // Make sure that Istream is not empty
    if(todoIstream.available() > 0)
      ch.updateFromStream(todoIstream, PR_UINT32_MAX);
    if(doneIstream.available() > 0)
      ch.updateFromStream(doneIstream, PR_UINT32_MAX);

    let result =  ch.finish(true);
    todotxtLogger.debug('timerObserver:calculateMD5','hash ['+result+']');
    return result
  }
};

/* 
 * Observer for changing properties
 */
var prefObserver = {
  
  calendar: null,

  register: function(cal) {
    this.calendar = cal;

    // For this.branch we ask for the preferences for extensions.myextension. and children
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                      .getService(Components.interfaces.nsIPrefService);
    this.branch = prefs.getBranch("extensions.todotxt.");

    if (!("addObserver" in this.branch))
        this.branch.QueryInterface(Components.interfaces.nsIPrefBranch2);

    // Finally add the observer.
    this.branch.addObserver("", this, false);
  },

  unregister: function() {
    this.calendar = null;
    this.branch.removeObserver("", this);
    todotxtLogger.debug('prefObserver:unregister');
  },

  observe: function(aSubject, aTopic, aData) {
    switch (aData) {
      case "creation":
      case "thunderbird":
      case "showFullTitle":
        this.calendar.refresh();
        break;
      case "done-txt":
      case "todo-txt":
        todoClient.setTodo();
        this.calendar.refresh();
        break;
    }
  }
};