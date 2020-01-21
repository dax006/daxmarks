
function handleMessage(request, sender, sendResponse) {

  //turns button presses into code run in the background
  switch (request.command){
   
    case "close":
      console.log("close page!");
      setTimeout(function () { window.close();}, 5000);  //https://stackoverflow.com/questions/16127115/closing-popup-window-after-3-seconds
      break;
    case "status":
      document.getElementById('status').innerHTML += request.message+"\n";  //pump to screen
      break;
  }
}



/////////////////////////////////////////////////////////////////////////////

document.getElementById("version").innerHTML = chrome.runtime.getManifest().version;  //set the version number in the popup

chrome.runtime.onMessage.addListener(handleMessage);
//var sending = chrome.runtime.sendMessage({command: "removeDuplicates"  });//remove duplicates every time window is opened.


//var browserName = getBrowserName();
var installbutton = document.getElementById("install");
var updateallbutton = document.getElementById("updateall");
var updatebutton = document.getElementById("update");
var clearall = document.getElementById("clearall");
var removeDuplicates = document.getElementById("removeDuplicates");
var rebuildBookmarks = document.getElementById("rebuildBookmarks");
var rebuildServerBookmarks = document.getElementById("rebuildServerBookmarks");
var compareall = document.getElementById("compareall");
var deletehistory = document.getElementById("deletehistory");
var runtest = document.getElementById("runtest");
var printtree = document.getElementById("printtree");

var logoutlink = document.getElementById("logout");

installbutton.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({command: "install"  });
}, false);

updateallbutton.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({command: "updateAll"  });
}, false);
updatebutton.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({command: "update"  });
}, false);

clearall.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({command: "clearall"  });
}, false);

removeDuplicates.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({command: "removeDuplicates"  });
}, false);

rebuildBookmarks.addEventListener("click", function() {
    //rebuildBookmarks.display = "none";  //cannot be used twice until reload because _localTree is no longer showing correct ids.
    var sending = chrome.runtime.sendMessage({command: "rebuildBookmarks"  });
}, false);
rebuildServerBookmarks.addEventListener("click", function() {
    //rebuildBookmarks.display = "none";  //cannot be used twice until reload because _localTree is no longer showing correct ids.
    var sending = chrome.runtime.sendMessage({command: "rebuildServerBookmarks"  });
}, false);

logoutlink.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({command: "logout"  });
}, false);

compareall.addEventListener("click", function() {
    chrome.runtime.sendMessage({command: "compareall"  });
}, false);

deletehistory.addEventListener("click", function() {
    chrome.runtime.sendMessage({command: "deletehistory"  });
}, false);

runtest.addEventListener("click", function() {
    chrome.runtime.sendMessage({command: "runtest"  });
}, false);
printtree.addEventListener("click", function() {
    chrome.runtime.sendMessage({command: "printtree"  });
}, false);


//every time they open the icon, update automatically
// chrome.runtime.sendMessage({command: "update"  });