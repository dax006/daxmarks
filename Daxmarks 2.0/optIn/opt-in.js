//"use strict";

// window.addEventListener("load", function() {
  // set up the appearance of the popup depending on the outcome of the opt-in
  chrome.storage.local.get("optInShown", function(result) {
    console.log("Setting up UI. result.optInShown:" + result.optInShown);
    // document.getElementById("opt-in-prompt").hidden = result.optInShown;
    // document.getElementById("after-opt-in").hidden = !result.optInShown;
  });

  document.getElementById("button-enable").addEventListener("click",function() {
      console.log("Enable clicked.");
      // chrome.storage.local.set({ "optIn" : true, "optInShown" : true });
      //       chrome.browserAction.setPopup({popup:"register.html"});  //register screen is now default popup
  

  // chrome.runtime.onMessage.addListener(handleMessage); 


      chrome.runtime.sendMessage({command: "optin"  });  //why the hell isn't this sending!!!
      // window.close();

  });

  document.getElementById("button-cancel").addEventListener("click", function() {
      console.log("Cancel clicked.");
      // chrome.storage.local.set({ "optIn" : false, "optInShown" : true });

      window.close();
  });
// });
