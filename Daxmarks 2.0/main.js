function handleMessage(request, sender, sendResponse) {
    //turns button presses into code run in the background
    switch (request.command) {
        case "close":
            console.log("close page!");
            setTimeout(function() { window.close(); }, 5000); //https://stackoverflow.com/questions/16127115/closing-popup-window-after-3-seconds
            break;
        case "status":
            document.getElementById('status').innerHTML += request.message + "\n"; //pump to screen
            break;
        case "showOperationResults":
            // console.log("showOperationResults message found.");
            showOperationResults(request.message);
            break;
        
    }
}

function showOperationResults(results) {
    console.log("main.js showOperationResults()");
    failedOps = "";
    results = JSON.parse(results);
    // console.log(results);
    document.getElementById("operationResults").style.display = "block"; //make it visible
    document.getElementById("existed").textContent = results.existed;
    
    document.getElementById("added").textContent = results.added;
    document.getElementById("deleted").textContent = results.deleted;
    document.getElementById("moved").textContent = results.moved;
    document.getElementById("renamed").textContent = results.renamed;
    document.getElementById("skipped").textContent = results.skipped;
    document.getElementById("fixed").textContent = results.fixed;
    document.getElementById("failed").textContent = results.failed;
    for(i = 0;i < results.failedOps.length; i ++){
        console.log(results.failedOps[i]);
        failedOps += (results.failedOps[i].operation +" "+results.failedOps[i].title+", ");
        document.getElementById("failedOps").textContent = failedOps ;  //maybe I can just set the title?
    }
    //+_added+" added, " +_deleted+ " deleted, " +_moved + " moved, " +_renamed + " renamed, " + _failed + " failed, " +_existed+ " already existed.");
}

function requestCountCallback(count){
  document.getElementById('bookmarkCount').innerHTML = count+" nodes found."; //pump to screen
}



/////////////////////////////////////////////////////////////////////////////
document.getElementById("version").innerHTML = chrome.runtime.getManifest().version; //set the version number in the popup
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
var processqueue = document.getElementById("processqueue");
var logoutlink = document.getElementById("logout");
var test4 = document.getElementById("test4");
var forceSync = document.getElementById("forceSync");
var deleteTables = document.getElementById("deleteTables");
var cleanup = document.getElementById("cleanup");


installbutton.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({ command: "install" });
}, false);
updateallbutton.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({ command: "updateAll" });
}, false);
updatebutton.addEventListener("click", function(evnt) {
    console.log(evnt);  //wont show up.  Main.html is different from the background or addon page
    var sending = chrome.runtime.sendMessage({ command: "update" });
}, false);
clearall.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({ command: "clearall" });
}, false);
removeDuplicates.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({ command: "removeDuplicates" });
}, false);
rebuildBookmarks.addEventListener("click", function() {
    //rebuildBookmarks.display = "none";  //cannot be used twice until reload because _localTree is no longer showing correct ids.
    var sending = chrome.runtime.sendMessage({ command: "rebuildBookmarks" });
}, false);
rebuildServerBookmarks.addEventListener("click", function() {
    //rebuildBookmarks.display = "none";  //cannot be used twice until reload because _localTree is no longer showing correct ids.
    var sending = chrome.runtime.sendMessage({ command: "rebuildServerBookmarks" });
}, false);
logoutlink.addEventListener("click", function() {
    var sending = chrome.runtime.sendMessage({ command: "logout" });
}, false);
compareall.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "compareall" });
}, false);
deletehistory.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "deletehistory" });
}, false);
runtest.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "runtest" });
}, false);
printtree.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "printtree" });
}, false);
processQueue.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "processOpsToServer" });
}, false);
test4.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "test4" });
}, false);

forceSync.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "forceSync" });
}, false);
deleteTables.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "deleteTables" });
}, false);
cleanup.addEventListener("click", function() {
    chrome.runtime.sendMessage({ command: "cleanup" });
}, false);


//every time they open the icon, update automatically
chrome.runtime.sendMessage({ command: "autoupdate" });
chrome.runtime.sendMessage({ command: "requestCount" }, requestCountCallback);