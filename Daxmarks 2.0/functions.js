var _clientID; //store in server which client created the bookmark, so we know what parentId to use
var _email; //store login info
var _password;
var _bGen; //the global bookmark generator
var _rootId = null; //store root folder ids
var _bookmarksBarId;
var _otherBookmarksId;
var _bookmarksMenuId;
var _mobileBookmarksId;
var _server2localMap = new Map(); //stores server id and the corresponding local Id we created
var _dataCounter = 0; //looping through opsToServer
var _dataFromServer = []; //array to hold operations we need to perform on local bookmark tree
var _isListenersOn = false; // when we add server stuff, we don't want to trigger the listeners!
var _opsToServer = []; //array to hold operations we need to perform on server 
var _optInAccepted = false;
var _installed = false;
var _lastUpdate; //timestamp to keep track of which ops to pull from server
var _iconOn = false; //blink the icon
var _localTree; //store the entire tree
var _localTreeAssoc; //store the entire tree as an associative array for fast lookup
var _importing = false; //detect if we are importing, reduce load on server by queueing everything once
// var _queueTimerOn = false; //detect if the timer is going
var _queueTimer; //hold a timeout object, needed in case server errors, we don't want the program to be unable to send anything else ever again!
//var _serverTimestamp = 0; //used at end of ProcessOps to set updateTime/lastUpdate
var _catchInfiniteCounter = 0;
var MAXLOOPS = 100; //hopefully they don thave 100,000 bookmarks!
var _added = null; //keep track of changes to client
var _renamed = 0;
var _moved = 0;
var _deleted = 0;
var _existed = 0;
var _failed = 0;
var _skipped = 0;
var _fixed = 0;
var _failedOps = []; //store what failed for quicker debugging
var _serverBsNotMatched = []; //store things from server that weren't matched locally in forceSync
var _blinkTimer = null; //makes the icon blink
var CHUNKSIZE = 100; //max number of ops to send to the server at once/
var _adding = null; //in forceSync we add a large number of bookmarks at once.  However we cannot do anything until they complete.  So this counts down the number of bookmark creations - when it reaches 0 we turn the addon on again
_DEBUG = true; //stop updating automatically or on login
_DEBUG = false;




//ccurently not in use
function getBrowserInfo() { //https://stackoverflow.com/questions/41819284/how-to-determine-in-which-browser-your-extension-background-script-is-executing  
    // Firefox 1.0+ (tested on Firefox 45 - 53)
    var isFirefox = typeof InstallTrigger !== 'undefined';
    // Opera 8.0+ (tested on Opera 42.0)
    var isOpera = (!!window.opr && !!opr.addons) || !!window.opera ||
        navigator.userAgent.indexOf(' OPR/') >= 0;
    // Internet Explorer 6-11
    //   Untested on IE (of course). Here because it shows some logic for isEdge.
    var isIE = /*@cc_on!@*/ false || !!document.documentMode;
    // Edge 20+ (tested on Edge 38.14393.0.0)
    var isEdge = !isIE && !!window.StyleMedia;
    //console.log(info.name);
    if (isFirefox) {
        _browserInfo = "Firefox";
    } else if (isEdge) {
        _browserInfo = "Edge";
    } else if (isOpera) {
        _browserInfo = "Opera";
    } else {
        _browserInfo = "Chrome?";
    }
}

function* bookmarkGenerator(node) {
    if (!node) return;
    var nlen, i;
    if (node.id) {
        yield node;
    }
    nlen = node.length;
    for (i = 0; i < nlen; i++) {
        yield* bookmarkGenerator(node[i]);
    }
    if (node.children) {
        yield* bookmarkGenerator(node.children);
    }
}

function storeTree(callback = false) { //just get all the bookmarks and store it in _localTree
    console.log("storeTree()");
    chrome.bookmarks.getTree(function(tree) {
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
            console.log(tree);
        }
        _localTree = tree;
        _localTreeAssoc = tree2assoc(tree);
        console.log(count(_localTreeAssoc) + " nodes found.");
        storeTreeIds(tree); //find those pesky special folders
        //        console.log(tree[0].children);  //yup, its here just fine
        if (callback) { //if we supplied a callback, call that.
            callback(tree);
        }
    });
}

function tree2assoc(tree) { //turn bookmarks tree into associative array indexed by id for fast lookup without having to deal with callbacks
    // console.log("tree2assoc()");
    var arr = {};
    var bgen = bookmarkGenerator(tree);
    var node;
    for (node of bgen) {
        //if(node.children) node.children = null;  //just to cut down size  //nope cant do that, it will break the loop.  Lets hope it just holds a reference, hehe
        arr[node.id] = node;
    }
    return arr;
}

function printtree() {
    chrome.bookmarks.getTree(printTreeCallback);
}

function printTreeCallback(localTree) {
    // console.log(localTree)

    if (chrome.runtime.lastError) { //trap errors
        console.log(chrome.runtime.lastError.message);
        console.log(localTree);
    }

    var bookmark;
    _bGen = bookmarkGenerator(localTree); //create the global generator to process next bookmark from anywhere
    for (bookmark of _bGen) { //loop through all bookmarks created through generator  //https://stackoverflow.com/questions/25900371/how-to-iterate-over-the-results-of-a-generator-function
        console.log(bookmark)
    }
    console.log("OpsToServer:");
    console.log(_opsToServer);
    console.log("OpsFromServer:");
    console.log(_dataFromServer);
}

function sendStatus(message, close = false) {
    console.log("SendStatus:" + message);
    try {
        if (document.getElementById('status')) { //if a status div is in the DOM just set it directly
            document.getElementById('status').innerHTML += (message + "<br>");
        } else {
            if (isPopupVisible()) { //needed for firefox
                chrome.runtime.sendMessage({ command: "status", message: message }); //sometimes doesnt work?
            }
            if (close) {
                chrome.runtime.sendMessage({ command: "close" });
            }
        }
    } catch (e) {
        //ignore
    }
}

function countTree(tree) {
    var count = 0;
    var bgen = bookmarkGenerator(tree);
    for (node of bgen) {
        count += 1;
    }
    return count;
}
//########################################################## START LISTENERS ####################################################################################
function listenersOn() {
    _isListenersOn = true;
    console.log("adding listeners ");
    chrome.bookmarks.onCreated.addListener(createListener);
    chrome.bookmarks.onRemoved.addListener(removeListener);
    chrome.bookmarks.onChanged.addListener(changeListener);
    chrome.bookmarks.onMoved.addListener(moveListener);
    if (chrome.bookmarks.onImportBegan) { //this doesn't exist on firefox.  Everything nelse does but not this
        importBegan = chrome.bookmarks.onImportBegan;
    } else if (browser.bookmarks.onImportBegan) {
        importBegan = browser.bookmarks.onImportBegan;
    } else {
        return; //could not find import listener handler
    }
    try {
        //chrome.bookmarks.onImportBegan.addListener(importListener);  //why is this erroring on me on firefox??
        importBegan.addListener(function() {
            _importing = true;
            console.log("Import Began.");
        });
        chrome.bookmarks.onImportEnded.addListener(function() {
            _importing = false;
            console.log("Import Ended.");
            processOpsToServer(); //NOW send everything
        });
    } catch (e) {
        console.log("Error.  Unable to create import listeners.  Importing large amounts may crash server!");
        _importing = false;
        console.log(e);
    }
}

function listenersOff() { //remove during any import process, then restore them
    _isListenersOn = false; //disableing them is asyncronous and leads to bad stuff so I just use a boolean
    console.log("removing listeners ");
}
//functions used for listeners
function createListener(id, object) { //they added a bookmark
    //console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark create detected for Id: " + id + " title:" + object.title);
        //console.log(object);
        queueOpToServer("add", object);
        processOpsToServer(); //immediately send to server
    } else {
        console.log("createListener fired but Listener is off.  id:" + id + " title:" + object.title + " parentId:" + object.parentId);
    }
}

function removeListener(id, object) { //they deleted a bookmark
    if (_isListenersOn) {
        console.log("Bookmark removal detected for Id: " + id);
        // console.log(object);
        if (object.node) { //for some reason the object in delete is split into 3 separate parts
            newObj = object.node;
            newObj.parentId = object.parentId;
            newObj.index = object.index;
            object = newObj;
        }
        object.id = id;
        queueOpToServer("delete", object); //store it first while cache still exists
        cachedNode = _localTreeAssoc[id];
        // console.log(cachedNode);
        deleteAllChildrenFromCache(cachedNode); //now delete the cache and its children
        console.log(_localTreeAssoc[id]);
        processOpsToServer(); //now send to server
        //storeTree();  //if a folder was deleted a lot of nodes changed  //do this at end of process queue, too spammy here
    } else {
        console.log("removeListener fired but Listener is off " + id + " title:" + object.title);
    }
}

function changeListener(id, object) { //rename a bookmark
    //  console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark change detected for Id: " + id);
        // console.log(object);
        object.id = id; //chrome doesn't always add these
        object.before = { title: _localTreeAssoc[id].title, url: _localTreeAssoc[id].url }; //store previous values before the change
        queueOpToServer("rename", object); //this should update _localTreeAssoc
        //localTreeAssoc is automatically up to date since its just a pointer
        updateParentFolders(id);
        processOpsToServer(); //immediately send to server
    } else {
        console.log("changeListener fired but Listener is off " + id + " title:" + object.title);
    }
}

function moveListener(id, object) {
    //  console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark move detected for Id: " + id);
        // console.log(object);
        object.id = id;
        object.before = { parentId: _localTreeAssoc[id].parentId, index: _localTreeAssoc[id].index }; //store previous values before the change? actually i think its just a pointer so its up to date by now??
        queueOpToServer("move", object);
        //update parentFolders
        updateParentFolders(id);
        processOpsToServer(); //immediately send to server
    } else {
        console.log("moveListener fired but Listener is off  " + id + " title:" + object.title);
    }
}

function importListener(data) {
    //  console.log("isListenerOn: " + isListenersOn);
    if (_isListenersOn) {
        console.log("Bookmark import detected ");
        // object.id = id;
        // queueOpToServer("move", object);
    } else {
        console.log("importListener fired but Listener is off");
    }
}

function updateParentFolders(id) {
    console.log("update parent folders of children.  id:" + id);
    //chrome.bookmarks.getChildren(id,function(tree){  //get all its children in tree format
    chrome.bookmarks.getSubTree(id, function(tree) { //get all its children in tree format
        if (chrome.runtime.lastError) { //trap errors
            console.log("updateParentFolders:" + chrome.runtime.lastError.message);
            console.log(id);
        }
        if (isTree(tree)) { //theres no need to do it  unless there are children
            if (chrome.runtime.lastError) { //trap errors
                console.log(chrome.runtime.lastError.message);
                console.log(tree);
            }
            var bgen = bookmarkGenerator(tree); //loop through children
            for (node of bgen) {
                queueOpToServer("updateparentfolder", node); //prepareForDB will set each parentFolders
            }
            processOpsToServer();
        }
    });
}

function deleteAllChildrenFromCache(node) { //deosn't actually delete.  We only clean up the cache - we do NOT create individual add ops because its a lot of clutter in the ops table
    // console.log("deleteAllChildrenFromCache()");
    if (isTree(node)) { //are there children in it?
        children = getChildren(node);
        // if(children){
        //     console.log("children found");
        //     console.log(children);
        // }
        for (i = 0; i < children.length; i++) {
            deleteAllChildrenFromCache(children[i]); //children should still be in cache *crosses fingers*
        }
    }
    delete _localTreeAssoc[node.id]; //delete this AFTER all its children are deleted (work from branches down to root)
}
//################################################################ END LISTENERS ##############################################################################################
//############################################################ START SEND TO SERVER STUFF######################################################################################
function queueOpToServer(op, node) { //queue a bookmark operation to be sent to server
    //in case they are offline, gotta store each change and process it as needed
    //_localTreeAssoc[node.id] = node;  //gotta make sure this is always up to date, for getParentFolders  //done in prepareForDB?
    node.operation = op; //just store the operation in the node
    if (op != 'addedId') { //addedid was spamming the server causing a shutdown, so we have to make it go through the ops table.  Its hacky but.. oh well
        node = prepareForDB(node); //make sure all values are filled in.  Don't do this server-side, too much memory
    }
    // console.log(node);
    if (!_opsToServer) {
        //no idea how sometimes it doesn't exist
        _opsToServer = [];
    }
    if (node) {
        _opsToServer.push(node);
    } else {
        console.log("Error.  Trying to insert null node in queueOpToServer().");
    }
    //potential issue here - we can add many things before we get a response back from the server...  //create a queueTimestamp to make sure we don't do ops twice
    // we could also add something and get a response back and the server will deliete what we just added, before we send it to the server!
    //chrome.storage.local.set({ opsToServer: _opsToServer }); //store it long term  //too slow to do this every time
}

function prepareForDB(node) { //make sure all values are filled in.  Not required, but makes debugging easier
    if (!node) return false; //in case we just want to send a message to server recording what we are doing
    if (!node.id) {
        console.log("error, id is null in parapareforDB");
        console.log(node);
        return false;
    }
    node.queueTimestamp = Date.now(); //so we don't keep inserting the same OP into the database, in the case of lag or something
    node.parentClient = _clientID; //also set in server, but only after we add it to DB.  Save a server lookup by doing it here
    if (!node.title) { //strangely, firefox doesn't include title, making debugging difficult
        node.title = getTitle(node.id);
    }
    if (!node.url) { //strangely, firefox doesn't include title/url, making debugging difficult
        node.url = getUrl(node);
    }
    if (!node.id) node.id = -1; //thosspecial 'markers' i put in
    if (!node.parentId) {
        node.parentId = getParentId(node); //do your darndest to get that parent id from the cache - just for completeness sake
    }
    node.parentFolders = getParentFolders(node);
    // console.log("parentFolders");
    // console.log(node.parentFolders);
    //update local data structures cuz something changed (do at end) 
    _localTreeAssoc[node.id] = node; //store updated node including children
    if (node.children) {
        node = copyNode(node); //stick to just lists, please.  DOn't make server recurse trees, takes too much memory
    }
    return node;
}

function copyNode(node) { //make a shallow copy so we can remove children without breaking the generator
    var newNode = {};
    for (field in node) {
        if (field == 'children') continue; // dont copy children
        newNode[field] = node[field];
    }
    return newNode;
}

function getTitle(id) {
    node = _localTreeAssoc[id]; // in what situation would this be NOT up to date?  imports?
    if (!node) {
        console.log("GetTitle().  node not found  id:" + id);
        return null;
    }
    if (!node.title) {
        //console.log("GetTitle().  node.title not found.  id:" + id);
        return ""; //can't have null, it breaks getparentfolders
    }
    return node.title;
}

function getUrl(node) {

    if ('url' in node) { //https://stackoverflow.com/questions/11040472/how-to-check-if-object-property-exists-with-a-variable-holding-the-property-name
        url = node.url;
        return url;
    }

    //try the cache?
    id = node.id;
    node = _localTreeAssoc[id]; // in what situation would this be NOT up to date?
    if (!node) {
        // console.log("getUrl() null node in _localTreeAssoc for url id:" + id);
        // console.log(_localTreeAssoc);
        return null;
    }
    
    return "";
}

function isTree(node) { //does it have childreN?  Its a tree
    if (node && (node.children || (node[0] && node[0].children))) {
        return true;
    }
    return false;
}

function installStart() { //send all bookmarks to server
    console.log("install start. ");
    //storeTree called in...login?
    storeTree(install); //call install after tree is gotten  //from this point on we must make sure _localTreeAssoc is always up to date
    //install();  //storeTree was called in loginSuccess;
}

function install(tree = false) { //add all bookmarks to server
    console.log("Install()");
    keys = Object.keys(_localTreeAssoc);
    console.log(keys);
    sendStatus("Saving all " + keys.length + " of your bookmarks."); //keeps saying undefined :(
    resetVariables(); //clear old ops, make sure we are good for sending
    _opsToServer = [];
    //sendToPhp("install",tree2list(tree));  //install tables.  Send as list, not tree.  Server uses too much memory parsing a tree
    //you MUST wait for the database to be done with all operations before install.  The Database CAN try to insert ops before the correct column/cliendId is set by install.   you MUST wait for any callback before doing this!
    queueTreeToServer("add", tree); //this de-trees it.  after it is queued it will automatically send everything to server  
    updateTime(0); //set it to 0 so we get ALL ops from server
    processOpsToServer(); //it updates automatically after
    setInstalled(_email);
    //NOOOO we can't do this here.  this will get and apply ops and NOT apply most recent ops.  So if say a different client installed (added) bookmarks, update will tell us to add it and miss the part where this client deleted it!
    // sendToPhp("update",0);  //get all ops from server
}

function queueTreeToServer(op, tree) {
    console.log("queueTreeToServer()");
    var bgen = bookmarkGenerator(tree); //could also use _localTree, i guess
    for (node of bgen) {
        // console.log("queueing " + node.id + node.title);
        queueOpToServer(op, node);
    }
}

function tree2list(tree) { //takes in bookmarks tree, spits out list
    var list = [];
    var bgen = bookmarkGenerator(tree);
    var node;
    for (node of bgen) {
        list.push(node);
    }
    return list;
}

function processOpsToServer() {
    console.log("ProcessOpsToServer()");
    //toggleIcon(); //fun!
    blinkIcon();
    if (_importing) {
        console.log("importing.");
        return; //importEnd will call the process queue
    }
    //console.log("processOpsToServer()");
    if (processOpsToServerComplete()) {
        return;
    }
    //put a timer so we don't spam the server with too many ops - really only an issue with imports/ installs
    if (!_queueTimer) { // so we don't spam the server and get firewalled, grr
        chrome.storage.local.set({ opsToServer: _opsToServer }); //store it long term  
        sendChunk(); //send immediately
        _queueTimer = setInterval(function() { //intervals repeat  --possibility for infinite loop here if server fails to return correct IDs!  An unexpected error would cause this, and no code is perfect so... gotta check it.
            console.log("Resending slice....");
            _catchInfiniteCounter += 1;
            if (_catchInfiniteCounter > MAXLOOPS) {
                console.log("ERROR - Server probably not responding?  Stop sending.")
                sendStatus("Error - server timed out.");
                _opsToServer = [];
                stopTimer();
                return;
            }
            sendChunk(); //send delayed
        }, 10000); //if no response within 10 seconds, send again
    } else {
        console.log("_queueTimerOn, not sending quite yet.");
    }
}

function processOpsToServerComplete() {
    if (_opsToServer.length == 0) {
        console.log("opsToServer is empty.");
        sendStatus("Sending complete.");
        stopTimer();
        //updateFromOpsStart();  //now pull updates.  YES this will get the operations we just added.  Can't be avoided (client 2 installs/adds, this client deletes - gotta reprocess that delete)
        //NO, what if client 2 didn't add anything?   We don't want to process a delete twice!!
        //forceUpdate();  //get ALL ops.  I don't want to do this  :(
        // updateStart();  //no we don't want to process ops we just sent
        return true;
    }
    return false;
}

function stopTimer() {
    _catchInfiniteCounter = 0;
    clearInterval(_queueTimer);
    _queueTimer = null;
    clearInterval(_blinkTimer);
    _blinkTimer = null;
}

function sendChunk() {
    qlen = _opsToServer.length; //the listener breaks if you send too much data at once, so divide it into chunks
    chunksize = CHUNKSIZE;
    if (chunksize >= qlen) chunksize = qlen;
    slice = _opsToServer.slice(0, chunksize); //get a slice of the array
    console.log("sending chunk 0->" + chunksize + " of " + qlen);
    sendToPhp("processOpsToServer", slice); //the callback will send next chunk
}

function processQueueSuccess(ids) { //queue got sent to server successfully.  it also checked for updates and returned any results
    //console.log(updates);
    //processOpsFromServer(updates); //we sent local operations to server and got a response, we can apply and updates from server to client.
    if (_opsToServer.length > 0) {
        // console.log("removing Queue ids.");
        //there's a problem here.  If we queued an operation, set a timer,then the server responds back with a queueSuccess, the queue will be deleted before the newest operation in the queue is sent
        //so we have to check WHICH queue operations got sent, and only delete those
        if (ids.length > 0) {
            //console.log("before len:" + _opsToServer.length);
            deleteIdsFromQueue(ids); //just delete directly from global - faster, use less memory  //this should be ONLY place opsToServer remove
            //console.log("after len:" + _opsToServer.length);
            chrome.storage.local.set({ opsToServer: _opsToServer });
            stopTimer(); //so we can send immediately
            processOpsToServer(); //keep going until queue is empty  
        } else {
            console.log("No ids returned :(");
        }
    } else {
        console.log("Warning.  Optstoserver Queue is empty before we removed ids. ");
        stopTimer();
    }
}

function deleteIdsFromQueue(ids) {
    //any node in queue with matching id is deleted
    console.log("remove " + ids.length + " IdsFromQueue()");
    // console.log(ids);
    var alreadyDeleted = 0;
    try {
        var ilen = ids.length;
        var i, j, id, node;
        for (j = 0; j < ilen; j++) { //the ids should be smaller than the queues so make this the outer loop
            idFound = false;
            id = ids[j];
            var qlen = _opsToServer.length; //recheck it every time cuz we are deleting on the fly
            for (i = 0; i < qlen; i++) {
                node = _opsToServer[i];
                if (!node) { //shouldn't happen but does sometimes.  why/
                    _opsToServer.splice(i, 1); //delete from queue
                    continue; //sometimes there is a null in there?  
                }
                if (node.id == id) { //delete it, aka don't add to new queue
                    idFound = true;
                    //console.log("id " + id + " found");
                    // console.log(node);
                    _opsToServer.splice(i, 1); //remove 1 item from array
                    //console.log(_opsToServer);
                    break;
                }
            }
            if (!idFound) { //keep it - add to new queue
                //console.log("error? id " + id + " not found? can't remove from queue?");
                alreadyDeleted += 1;
                //newQueue.push(node);
            }
        }
    } catch (e) {
        console.log(e);
        console.log(_opsToServer);
    }
    if (alreadyDeleted >= 1) {
        console.log(alreadyDeleted + " ids not found.  Probably already deleted.");
    }
}

function removeContradictoryOps(updates) {
    console.log("removeContradictoryOps()");
    //_opsToServer are ops that have already been applied to this client
    //updates are things that have not been applied
    //BUT! updates need to be applied first - meaning we are applying operations in the wrong order
    //this isn't a big deal unless they are about the same bookmark/id.  updates would override the more recent operation
    //update says move to folder 2.  We just moved to folder 3.  It should be in folder 3.  But update will make it move to folder 2.
    //so we have to compare updates and _opsToServer (before we delete anything from it) and see if there are conflicting ops 
    //in which case we either delete it from the updates, or apply the _opsToServer op again
    if (!updates) return updates;
    var counter = 0;
    slen = updates.length;
    olen = _opsToServer.length;
    for (i = 0; i < slen; i++) {
        serverop = updates[i];
        contFound = false;
        for (j = 0; j < olen; j++) {
            localop = _opsToServer[j];
            //check if id is same
            // console.log("Comparing server, local");
            // x = serverop;
            // console.log(x.title+" "+ getId(x)+" "+getParentId(x) +" " + x.operation);
            // x = localop;
            // console.log(x.title+" "+ getId(x)+" "+getParentId(x) +" " + x.operation);
            //using server2local is a problem because that hasn't been used yet - yet what if we need it if, say, we are updating children?
            lop = localop.operation;
            sop = serverop.operation;
            if (getId(serverop) == localop.id && ((lop == "delete") || (sop == "delete" && lop == "add") || (sop == lop))) { //is same id and conflicting operation
                serverop.contradictory = localop; //check this in applyNextOp()
                counter += 1;
                // console.log("contradiction found!  Outgoing op is " + lop + ", incoming op is " + sop + " for id " + localop.id + ".  marking as invalid serverop.  serverop, localop");
                // console.log(serverop);
                // console.log(localop);
                break; //delete it from updates (cant do that while looping through it so make a copy)
            }
        }
    }
    console.log(counter + " contradictory ops found");
    return updates;
}
//########################################################## END SEND TO SERVER################################################################################
//########################################################## START ACCOUNT STUFF ##############################################################################
function optin() { //they clicked accept on optin page
    chrome.storage.local.set({ "optIn": true, "optInShown": true });
    //see https://stackoverflow.com/questions/59671336/chrome-addon-how-to-make-a-button-in-change-page-to-a-new-url
    chrome.browserAction.setPopup({ popup: "register.html" }); //register screen is now default popup
    startup(); //load variables and stuff
}

function checkOptIn() { //the first thing done
    // show the tab if we haven't registered the user reacting to the prompt.
    chrome.storage.local.get("optInShown", function(result) {
        if (!result.optInShown) {
            //   chrome.tabs.create({ url: "optIn/opt-in.html" });
            chrome.browserAction.setPopup({ popup: "optIn/opt-in.html" });
            return false;
        } else {
            chrome.browserAction.setPopup({ popup: "register.html" });
            startup();
        }
    });
    //return true;
}

function startup() {
    // chrome.runtime.onStartup.addListener(startupCallback);  //dont trust it
    //listenersOn(); //respond to click events - no... only if login was successful!
    loadAndLogin(); //retreive stored data
}

function createAccount(e, p) {
    _email = e; //set globals
    _password = p;
    console.log("any errors:" + chrome.runtime.lastError);
    console.log("Creating an account");
    sendToPhp("createAccount");
}

function createAccountCont(response) {
    console.log("Creating an account continued");
    if (response == "validatingEmail") {
        sendStatus("An email has been sent to " + _email + ".  (May take several minutes to arrive.)  Please follow the instructions in the email to validate your account.", true);
        chrome.browserAction.setTitle({ title: "Awaiting EmailValidation" });
        var emailInstalled = _email + '_installed';
        chrome.storage.local.set({ emailInstalled: "false" });
    } else if (response == "AccountExists") {
        console.log("AccountExists already");
        sendStatus("An account with this email already exists.  Please <a href='login.html'>login</a>.");
    } else {
        sendStatus(response);
        chrome.browserAction.setTitle({ title: response });
    }
}

function resetPassword(request) {
    //then send a message to email
    //that direct them to a php page to put in a new password
    console.log("resetPassword()");
    console.log(request);
    _email = request.email;
    _password = request.newPassword;
    sendToPhp("resetPassword");
    logout(); //delete all local data
    // chrome.storage.local.set({password:""});  ///weellll no.. it shouldnt be official until they click the link?
}

function showRegisterScreen() { //link clicked clicked
    // similar behavior as clicking on a link
    chrome.windows.create({ url: "register.html", type: "popup", height: 400, width: 400 });
}

function showLoginScreen() { //link clicked clicked
    chrome.browserAction.setPopup({ popup: "login.html" });
}

function showResetPasswordScreen() { //link clicked clicked
    chrome.windows.create({ url: "resetPassword.html", type: "popup", height: 400, width: 400 });
}

function login() { //checks that the server is online and valid account
    sendToPhp("login");
    console.log("Saving: " + _email); //do it here, else on failed login he has to keep typing it in
    chrome.storage.local.set({ email: _email });
}

function loginCont(response) {
    console.log(response);
    if (chrome.runtime.lastError) { //trap errors
        console.log(chrome.runtime.lastError.message);
    }
    if (response == "success") {
        loginSuccess();
        storeTree(checkInstalled); //store the local tree data and check for updates.  This is done here (not load) as a workaround for if they use the 'rebuild bookmarks' feature.   //not in loginSuccess to differentiate the 'installneeded' response (happens when I fiddle with DB
    } else if (response == "invalid") {
        sendStatus("Incorrect email or password.");
    } else if (response == "noaccount") {
        if (_email != '') { //they did a reset/logout in the middle of some operation.  Don't show a message if their email variable just got reset
            sendStatus("No account exists for " + _email);
        }
    } else if (response == "awaitingemail") {
        sendStatus("Awaiting email validation.  Re-sending the email.");
        resendvalidation();
        //document.getElementById('resendemail').onclick = resendvalidation();  //set a click handler for the just created hyperlink element.   //https://stackoverflow.com/questions/1265887/call-javascript-function-on-hyperlink-click  //nope.. message is sent async
    } else if (response == "installneeded") {
        installneeded();
    } else {
        console.log("Unknown response");
        sendStatus(response);
        chrome.browserAction.setTitle({ title: response }); //in case no popup visible
    }
}

function installneeded() {
    console.log("Install needed...installing");
    sendStatus("Server says Install still needed.");
    loginSuccess();
    installStart(); //if the server breaks and tables aren't created, this will loop forever....
}

function loginSuccess() {
    console.log("Setting icon to on");
    var manifest = chrome.runtime.getManifest(); //get version
    var version = chrome.runtime.getManifest().version; //https://stackoverflow.com/questions/14149209/read-the-version-from-manifest-json
    //chrome.browserAction.setTitle({title:"Daxmarks "+version+" - Connected."});
    chrome.browserAction.setTitle({ title: "Daxmarks - Connected to " + _email });
    chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //change icon to something lit up
    chrome.browserAction.setPopup({ popup: "main.html" }); //show main form
    chrome.storage.local.set({ password: _password });
    listenersOn();
}

function checkInstalled() {
    console.log("Check installed()");
    var emailInstalled = _email + '_installed';
    chrome.storage.local.get([emailInstalled], function(installed) { //we want to do this PER EMAIL
        if (!installed || installed.installed == "") {
            _installed = installed.installed;
            console.log("_installed: " + _installed);
            sendStatus("First time login detected - storing your bookmarks.");
            installStart(); //check updates and set installed = true at end of this
            return false;
        } else {
            if (!_DEBUG) {
                sendStatus("Login success!  Your bookmarks are now syncing.", true);
                updateStart();
            }
            return true;
        }
    });
}

function resendvalidation() {
    sendToPhp("resendvalidation")
}

function logout() {
    console.log("logout.  Setting icon to disabled");
    chrome.browserAction.setPopup({ popup: "login.html" });
    chrome.browserAction.setIcon({ path: 'icons/icon_96_off.png' }); //change icon
    //don't delete storage, in case they want to log back in don't make them retype their whole password
    chrome.browserAction.setTitle({ title: "Daxmarks 2 - Click to log in." });
    chrome.storage.local.set({ password: "" });
    _email = "";
    _password = "";
    sendStatus("Logging out.", true);
    //window.close();  //causes 'fail to fetch errors, locks up addon'
}

function setInstalled(email) { //we need to do this PER EMAIL somehow
    var emailInstalled = _email + '_installed';
    chrome.storage.local.set({ emailInstalled: true }); //only if it was success do we create firstTime flag
    _installed = true;
    sendStatus("Install Complete.");
}

function loadAndLogin() { //grab everything from storage
    console.log("load and login");
    //last time we updated
    chrome.storage.local.get(['lastUpdate'], function(lastUpdate) {
        if (!lastUpdate || lastUpdate.lastUpdate == "") {
            updateTime(0); //get everything
            return;
        }
        _lastUpdate = lastUpdate.lastUpdate;
    });
    chrome.storage.local.get(['opsToServer'], function(opsToServer) { //here is where we store changes made but weren't able to send them to server
        if (!opsToServer || !opsToServer.opsToServer || opsToServer.opsToServer == "") return;
        _opsToServer = opsToServer.opsToServer;
        console.log("Load.  _opsToServer found. " + _opsToServer.length);
        //console.log(_opsToServer);
    });
    // // do this in checkInstalled.  Why?  It's email dependant
    // chrome.storage.local.get(['_installed'], function(_installed) {  //we want to do this PER EMAIL
    //     if (!_installed || _installed._installed == "") return;
    //     _installed = _installed._installed;
    // });
    chrome.storage.local.get(['optInAccepted'], function(optInAccepted) {
        if (!optInAccepted || optInAccepted.optInAccepted == "") return;
        _optInAccepted = optInAccepted.optInAccepted;
    });
    //get clientId - unique to this browser for this user
    chrome.storage.local.get(['clientID'], function(data) {
        console.log("load.  results back from get clientID");
        console.log(data);
        if (!data || !data.clientID || data.clientID == "" || data.clientID == undefined || data.clientID == null) { //go ahead and create a unique client id.  this should never happen again.  We do NOT want this to change.
            _clientID = Date.now();
            chrome.storage.local.set({ clientID: _clientID });
        } else {
            _clientID = data.clientID;
        }
    })
    chrome.storage.local.get(['email'], function(email) { //sometimes this returns an object, sometimes a string?
        if (!email || email.email == "") {
            console.log("_email not found in storage");
            return; //first time, don't even bother to verify
        }
        //email found... we don't need to register
        chrome.browserAction.setPopup({ popup: "login.html" });
        chrome.storage.local.get(['password'], function(password) {
            if (!password || password.password == "") {
                console.log("password not found in storage");
                return;
            }
            _email = email.email;
            _password = password.password; //send them to server every interaction
            console.log("email, password: " + _email + " " + _password);
            login(); //login here because we can't login until we know variables are loaded
        });
    });
}

function toggleIcon() { //just some fun visual flair - rarely used
    // console.log("Toggling Icon.");
    _iconOn = !_iconOn;
    if (_iconOn) {
        chrome.browserAction.setIcon({ path: 'icons/icon_96_green.png' }); //change icon
    } else {
        chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //change icon
    }
    //_timer1 = setTimeout(blinkIcon,300);   //this makes it keep blinking indefinitely until explicitly killed 
}

function forceValidate() { //testing only
    sendToPhp("forceValidate");
}
//######################################################################################################################################################################
//############################################################## START PROCESS OPS FROM SERVER FUNCTIONS #############################################################################
//######################################################################################################################################################################
function forceUpdate() { //force update EVERYTHING - debugging only
    _lastUpdate = 0;
    updateStart();
}

function updateStart() { //here is where we decide if updates should be through the OPs or the bookmarks.  Gotta stick to one or the other?
    //sendToPhp("forceSync");
    sendToPhp("updateFromOps");
    blinkIcon();
}

function updateFromOpsStart() { //get all operations after a certain timestamp and apply them to local client
    sendStatus("<br>Checking server for any changes.  ");
    resetVariables(); //if there was an error anywhere, it wont update  //hmmm... what if we are sending ops at the same time?? will this interfere?  I think itwill!
    sendToPhp("updateFromOps", _lastUpdate);
}

function processOpsFromServer(data, serverTimestamp) { //called by updateCont() and processQueueCont() //check the server for any changes.  results should be retunred as operations to perform to bring up to date
    // console.log("processOpsFromServer()");
    updateTime(serverTimestamp);
    if (!data) return;
    if (data.length == 0) return;

    sendStatus("Found " + data.length + " new operations on server.");
    console.log(data);
    blinkIcon(); //start blinking
    //do this here, not below, else we'd duplicate work
    findAllLocalMatches(data); //we have to match every op with a bookmark - give priorities to the ones with exact ids.  Later we will search by parentFolders/location/title
    //dont call reset variables, that deletes _opsToServer
    if (_dataFromServer.length == 0) { // we are not currently processing anything
        resetVariables();
        //do not clear mappings because opsToServer can take a long time
    } else {
        console.log("still processing _dataFromServer:");
        console.log(_dataFromServer);
    }
    _dataFromServer = _dataFromServer.concat(data); //append it in case were were still processing updates (can happen for huge imports)
    //turn off listeners or each op will trigger a new op
    listenersOff();
    console.log("_dataFromServer.length:" + _dataFromServer.length);
    applyNextOp();
    //see allopsComplete for when all ops are processed
}

function findAllLocalMatches(data) {  //sets server2local
    //we have to apply ops in the correct order, but we can sort of 'look ahead' to find exact matches, so searchbyparentfolder doesn't steal ids that should be exacvt matches

    console.log("findAllLocalMatches()");
    storeTree();  //must update _localTree because we do an exhausitve search, we need everything up-to-date

    var dlen = data.length;
    for (i = 0; i < dlen; i++) {  //first loop we search by ids for exact, guaranteed matches.  2nd loop we get the leftoverers by searching by folders
        serverOp = data[i];

        //decode urls
        serverOp.url = urldecode(serverOp.url);

        localNode = searchBySpecial(serverOp);
        if(!localNode) localNode = searchById(serverOp);
        
        if(localNode){
            serverOp.localNode = localNode;  //attach it
            updateMappings(serverOp,localNode);
        }

    }

    for(i=0;i<dlen;i++){
        serverOp = data[i];
        //if(serverOp.localNode) continue;  // this syntax always returns true!?
        if(serverOp.localNode == undefined){
            localNode = findLocalMatch(serverOp);  //use findlocalmatch, not search by parents, because we DO want to check ids again, because a previous search might have found a match, and that would have updated the mappings
            if(localNode){
                serverOp.localNode = localNode;  //attach it
                updateMappings(serverOp,localNode);
            }
        }
    }

    printNonMatched(data);
    
    return;
}

function printNonMatched(data){
   console.log("printing Not matched");
    counter = 0;
    var dlen = data.length;
    for(i=0;i<dlen;i++){
        serverOp = data[i];
        if(serverOp.localNode == undefined){

            counter += 1;
            console.log(serverOp);
        }
    }

    console.log(counter + " out of " + dlen + " not matched.");
}


function findLocalMatch(serverOp){

    localNode = searchBySpecial(serverOp);
    if(localNode) return localNode;
    localNode = searchById(serverOp);
    if(localNode) return localNode;
    localNode = searchByParentFolders(serverOp);
    if(localNode) return localNode;


    // console.log("no match found for primarykey:"+serverOp.primarykey+" id:"+serverOp.id+" "+serverOp.title);
    // rootNode = getRootNode();
    // console.log("rootnode:");
    // console.log(rootNode);
    // bGen = bookmarkGenerator(rootNode);  //i do believe i stored the tree in my cache, as well? hmm... how to guarantee children are up to date?
    // results = [];
    // for(node of bGen){
    //     console.log("comparing " +node.title+ " to " +serverOp.title);
    //     if(node.title == serverOp.title){
    //         results.push(node);
    //     }
    // }
    // console.log(results);
    // console.log(_server2localMap);



    return false;// no match found

}

function searchBySpecial(serverOp){
    if (isSpecialNode(serverOp)) { //special folder like 'bookmarks menu'
        // console.log("Special Folder " + serverOp.title + "Found");
        var specId = getSpecialId(serverOp);
        localNode = _localTreeAssoc[specId]; //its possible the special folder wasn't created chrome-side (some can be deleted)
        if(localNode) return localNode;
    }
    return false;
}

function searchById(serverOp) { //looks in our cache (_localTreeToAssoc) should be all that is needed.  shouldnt need bookmarks.get()
    
    id = getId(serverOp);
    localId = server2local(id); //turn server id to local (should only be needed for first time install - otherwise server would find local id)
    var node = _localTreeAssoc[localId]; // get node from id
    if (node) return node;
    
    //try again, check if a value for this specific client works
    id = getClientId(serverOp);
    localId = server2local(id); //turn server id to local (should only be needed for first time install - otherwise server would find local id)
    var node = _localTreeAssoc[localId]; // get node from id
    if (node) return node;


    //try the original id, we might have a mapping for that - can happen when parent is created in another client but not sent to server yet, so we return the other id - can happen when it is moved to that parent and we install (which doesn't fill in local data right away)
    origId = getOrigId(serverOp);
    localId = server2local(origId); //turn server id to local (should only be needed for first time install - otherwise server would find local id)
    node = _localTreeAssoc[localId]; // get node from id
    if (node) return node;
    
    //if nothing found
    //console.log("No id found in searchById");
    return false;
}

function getId(node) { //works for both ops and bookmark nodes
    if (node.id) return node.id;
    return getClientId(node);
}
function getClientId(node){
    var idCol = _clientID + "_id";
    if (node[idCol]) return node[idCol];
    return null; // no id found?
}
function getClientNewParentId(node){

    //if it came from this client, it should just be the plain 'parentId' col  // see attachClientParentIds in listener
    if(node.parentClient == _clientID){
        return node.parentId
    }

    //else use the value attached by the database
    var idCol = _clientID + "_newparentId";
    if (node[idCol]) return node[idCol];

    //else check Mappings
    if(node.parentId != server2local(node.parentId)){
        return server2local(node.parentId);
    }


    console.log("No new parent found in move operation!");
    console.log(node);
    return null; // no id found?
}

function getOrigId(node) {
    if (node.origId) return node.origId; //an operation processed by serverId2local
    if (node.originalOpId) return node.originalOpId; // a bookmark
    console.trace("error.  No original Id found for:");
    console.log(node);
    return null;
}


function searchByParentFolders(serverOp) { //search by title, url, and parentFolders for match
    //do a search by title/url

    var searchResults = bookmarkSearch(serverOp);
    for(localNode of searchResults){


        //this can't be right.  Say we have 2 ops accessing the same node.  But one came from a different client so it has a different id for the same node
        //we would find the exact match, update mappings, then fail to match the second one !?

        if (!isIdAlreadyMapped(localNode.id)) { // also make sure this id has not already been used!
            return localNode;  //return first complete match found
        }
    }
    return false;
}

function bookmarkSearch(serverOp){  //search using my cache instead of the slow, clumsy bookmark.search
    rootNode = getRootNode();
    bGen = bookmarkGenerator(rootNode);  //i do believe i stored the tree in my cache, as well? hmm... how to guarantee children are up to date?
    results = [];
    for(node of bGen){
        if(node.title == serverOp.title && getUrl(node) == getUrl(serverOp) && isSameParent(serverOp, node)){
            results.push(node);
        }
    }
    return results;
}


function isSameParent(serverOp, localNode) {
    //first check parentid - that is exact in case of duplicates
    //then compare parentFolder
    SId = getParentId(serverOp);
    SId2 = server2local(SId);
    LId = getParentId(localNode);
    if (SId2 == LId) { //smooth sailing, this node has been previously added to both sides
        return true;
    // } else if (serverOp.origParentId && server2local(serverOp.origParentId) == LId) { //do not despair!  The parent might have been added locally but server not updated yet
    //     return true;
    } else { //last resort - compare the parent folders string 
        localNode.parentFolders = getParentFolders(localNode);
        localNode = fixSpecialFolders(localNode);
        serverOp = fixSpecialFolders(serverOp);
        if (serverOp.parentFolders == localNode.parentFolders) { //match parentFolders,
            return true;
        }
    }
    return false;
}

function fixSpecialFolders(node) { //turns firefox folder names into chrome folder names
    //just string replace the following:
    //Bookmarks Toolbar . Bookmarks Bar
    //Bookmarks Menu . Other Bookmarks/Bookmarks Menu
    // if (node.title == "hange 21") {
    //     console.log("fix Special Folders. .  node.parentFolders:" + node.parentFolders + " node.title:" + node.title);
    // }
    //toolbar
    node.title = replaceOnce(node.title, "Bookmarks Toolbar", "Bookmarks bar");
    node.title = replaceOnce(node.title, "Bookmarks Bar", "Bookmarks bar");
    node.parentFolders = replaceOnce(node.parentFolders, "/Bookmarks Toolbar/", "/Bookmarks bar/");
    node.parentFolders = replaceOnce(node.parentFolders, "/Bookmarks Bar/", "/Bookmarks bar/");
    //bookmarks menu
    node.parentFolders = replaceOnce(node.parentFolders, "/Other Bookmarks/Bookmarks Menu/", "/Bookmarks Menu/");
    node.parentFolders = replaceOnce(node.parentFolders, "/Other bookmarks/Bookmarks Menu/", "/Bookmarks Menu/");
    if (isBookmarksMenu(node)) {
        //debugprint("BookmarksMenu found");
        node.parentFolders = "/"; //just say its root all the time
    }
    //mobile bookmarks
    node.parentFolders = replaceOnce(node.parentFolders, "/Other Bookmarks/Mobile Bookmarks/", "/Mobile Bookmarks/"); //firefox
    node.parentFolders = replaceOnce(node.parentFolders, "/Other bookmarks/Mobile Bookmarks/", "/Mobile Bookmarks/"); //chrome
    if (isMobileBookmarks(node)) {
        node.parentFolders = "/"; //just say its root all the time
    }
    //other bookmarks
    node.title = replaceOnce(node.title, "Other Bookmarks", "Other bookmarks");
    node.parentFolders = replaceOnce(node.parentFolders, "Other Bookmarks", "Other bookmarks");
    return node;
}

function isIdAlreadyMapped(localNodeId) { //if a match was found by parent folders, (meaning no id), we want to map the id to the new match UNLESS that new match already had a mapping.  Meaning identical bookmarks and parent folders
    //search through the server2localMap for that id
    var key, node;
    //for (key in _server2localMap){
    for ([key, id] of _server2localMap.entries()) { //its a map not an array
        if (localNodeId == id) {
            return true;
        }
    }
    return false;
}

function getSpecialId(node) {
    // console.log("isSPecialNode() check");
    if (isRoot(node)) {
        return _rootId;
    } else if (isToolbar(node)) { //firefox and chrome
        return _bookmarksBarId;
    } else if (isOtherBookmarks(node)) { //firefox and chrome
        return _otherBookmarksId;
    } else if (isBookmarksMenu(node)) { //firefox
        return _bookmarksMenuId;
    } else if (isMobileBookmarks(node)) { //firefox
        return _mobileBookmarksId;
    }
    return false;
}


function applyNextOp() { //assumes values exist in _dataFromServer and _dataCounter was set
    
    //this code must  be very similar to listener2.php
    //toggleIcon();
    if (allOpsComplete()) {
        return;
    }
    operation = _dataFromServer[_dataCounter];
    _dataCounter += 1;
    if (operation.contradictory) { //see removeContradictory - it contradicts with an operation we JUST did here on client
        //console.log("operation contradicted a just-applied op.  Skipping "+operation.title);
        _skipped += 1;
        applyNextOp();
        return; //lol important else it will find all ops complete - and then keep processing!
    }
    console.log("\nAPPLYING OP " + operation.operation + " " + operation.title); // very helpful but got too spammny
    console.log(operation);
    // //if this add operation came from this client, do nothing, since the only way it got to the database was by being applied on this client first
    //  //EDIT: sadly, no.  Say we changed something in client 1 and changed it back in client 2. If we update from client 2, we need it to get the most recent change, even if it was from itself


    if(operation.localNode == undefined){       //it was not able to find a match on any pre-existing node - must rely on server2localMap which is updated dynamically as we apply ops
        console.log("Looking up mapping for non-matched node.");
        localId = server2local(operation.id);
        operation.localNode = _localTreeAssoc[localId];
        if(operation.localNode == undefined){
            console.log("no match found.  It had better be an add operation");
        }else{
            console.log("matched to localId:"+localId);
        }

    }

    applyOp(operation,operation.localNode,applyNextOp);
    showOperationResults(); //update them all in real time in case theres a lot    
    
}

function applyOp(operation, localNode, callback) { //apply to client - means actually match changes
    op = operation["operation"];
    op = op.toUpperCase();

    //debugging
    if (!(localNode || op == "ADD")) { //it couldn't find a matching id, and its not a new node.
        console.log("Warning.  Id not found.  Possibly already deleted.");
        console.log(operation);
        // _failed += 1;
        // _failedOps.push(operation);
        _skipped += 1;
        if (callback) callback();
        return;
    }

    if (op == "ADD") {
        if (localNode) { //already exists here
            _existed += 1;

            //check if clientId was empty (or wrong??) for this operation, if so, send an addedId signal to server telling to update it
            clientId = getClientId(operation);
            if(!clientId){
                addedId(operation,localNode);
            }

            if (callback) callback();
        } else {
            console.log("No localnode found.  Creating.");
            createBookmark(operation, callback);
        }
    } else if (op == "DELETE") {
        deleteNode(localNode, operation, callback);
        //applyNextOp();
    } else if (op == "RENAME") {
        renameNode(localNode, operation, callback);
    } else if (op == "MOVE") {
        moveNode(localNode, operation, callback);
    } else if (op == "UPDATEPARENTFOLDER") { // a server-only operation
    } else {
        console.log("warning, no operation found in op");
        console.log(op);
        if (callback) callback(); //sometimes we put markers into ops?
    }
}

function allOpsComplete() { //this processes ops FROM the server
    if (_dataCounter >= _dataFromServer.length) { //if we are done
        console.log("All " + _dataCounter + " ops completed.  Turn on listeners");
        _dataCounter = 0;
        _dataFromServer = [];
        listenersOn();
        chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //change icon
        sendStatus("Receiving Complete. ");
        showOperationResults();
        blinkIcon(false); //stop blinking
        //resetVariables(); // this be a problem if we are trying to send stuff????.. yes, it will
        processOpsToServer();  //adding nodes may have created some addedId ops we need to send to server.  send it now
        return true; 
    }
    return false;
}

function showOperationResults() {
    // console.log("functions.js showOperationResults()");
    // console.log(_failedOps);
    results = { added: _added, existed: _existed, deleted: _deleted, moved: _moved, renamed: _renamed, skipped: _skipped, fixed: _fixed, failed: _failed, failedOps: _failedOps };
    results = JSON.stringify(results); //turn into big string
    // console.log(results);
    try {
        if (isPopupVisible()) {
            chrome.runtime.sendMessage({ command: "showOperationResults", message: results });
        }
    } catch (e) {
        //keep going
    }
    //+_added+" added, " +_deleted+ " deleted, " +_moved + " moved, " +_renamed + " renamed, " + _failed + " failed, " +_existed+ " already existed.");
}

function updateMappings(operation, localNode) {
    origId = getOrigId(operation);
    if (origId != localNode.id && _server2localMap.get(origId) != localNode.id) {
        console.log("setting server2local " + origId + " to " + localNode.id+ "  ("+operation.title+" to " +localNode.title+")");
        _server2localMap.set(origId, localNode.id);
        id = getId(operation);
        if (id != origId && id != localNode.id  && _server2localMap.get(id) != localNode.id) { //when operation is done on same bookmark from two different clients, one will provide correct id, the other will not and we have to look it up - so we have to map both the id and the origId
            console.log("setting server2local " + id + " to " + localNode.id+ "  ("+operation.title+" to " +localNode.title+")");
            _server2localMap.set(id, localNode.id);
        }
    }
    //keep localTreeAssoc up to date
    _localTreeAssoc[localNode.id] = localNode;
}



function deleteNode(node, operation = false, callback = false) {
    console.log("attempting to delete " + node.title);
    var deleteCount;

    function deletecallback(result) {
        // console.log("delete callback.");  //its usually nothing
        // console.log(result);
        if (chrome.runtime.lastError) {
            console.log("delete Failure : " + chrome.runtime.lastError.message + " " + node.id);
            if (isBookmarksMenu(operation) || isMobileBookmarks(operation)) { //in chrome you can delete some special nodes, in firefox you can't
                console.log(node.title +" is special folder.  Trying again on children.");
                //deleteChildren(node, operation,callback);  //  this  will trigger the callback a lot, and will try to delete things multiple times tirggering lots of failurs :(
                deleteChildren(node, operation);  //  this  will trigger the callback a lot, and will try to delete things multiple times tirggering lots of failurs :(
                
            }else{
                console.log(node);
                console.log(operation);
                _failed += 1;
                _failedOps.push(operation);
            }
        } else { //success
            _deleted += deleteCount;
            delete _localTreeAssoc[node.id]; //keep cache up to date so if we add it again, the cache won't think it already exists
            //should we also remove id from server2localMap??
        }
        if (callback) callback(); //this may be called from 2 different locations - process by exact ids, and process by folder matching, so we need a callback to specify return
        //applyNextOp();
    }
    //should do some double-checking here to make sure its the right ID :/
    if (isFolder(node)) {
        console.log("its a folder.  deleteTree");
        deleteCount = countTree(node); //get how many nodes were actually deleted
        chrome.bookmarks.removeTree(node.id, deletecallback);
    } else { //its a bookmark
        console.log("its a bookmark.  remvoe()");
        chrome.bookmarks.remove(node.id, deletecallback);
        deleteCount = 1;
    }
}

function deleteChildren(node, operatione) { //in the rare case they try to delete the bookmarks menu or mobile folder
    children = getChildren(node);
    if (!children) {
        return;
    }
    for (i = 0; i < children.length; i++) {
        deleteNode(children[i], operation); //opoeration was only needed for debugging
    }
}

function renameNode(node, operation, callback) {
    //bookmarks menu and mobile bookmarks are special cases :/
    if (isBookmarksMenu(node) || isMobileBookmarks(node)) { //in chrome you can delete some special nodes, in firefox you can't
        console.log("Cannot rename root folders.");
        console.log(operation);
        _skipped += 1;
        callback(); //this may be called from 2 different locations - process by exact ids, and process by folder matching, so we need a callback to specify return
        return;
    }
    changeObj = {
        title: operation.title
    }
    if (node.url) { //folders dont have url
        changeObj.url = operation.url;
    }
    console.log("calling rename.  id:" + node.id);
    console.log(changeObj);
    console.log("_localtreeAssoc before rename:");
    console.log(_localTreeAssoc[node.id]);
    chrome.bookmarks.update(node.id, changeObj,
        function(renameresult) {
            //console.log("rename callback.");
            //console.log(renameresult);
            if (chrome.runtime.lastError) {
                console.log("rename Failure: " + chrome.runtime.lastError.message);
                console.log(node);
                console.log(operation);
                console.log(_server2localMap);
                _failed += 1;
                _failedOps.push(operation);
                //applyNextOp();
                //callback();  //this may be called from 2 different locations - process by exact ids, and process by folder matching, so we need a callback to specify return
                return;
            } else {
                _renamed += 1;
                console.log("rename operation completed.  is cache up to date?  before, after");
                console.log(_localTreeAssoc[node.id]); //keep cache up to date 
                _localTreeAssoc[node.id] = renameresult; //keep cache up to date 
                console.log(_localTreeAssoc[node.id]);
            }
            //applyNextOp();
            if (callback) callback(); //this may be called from 2 different locations - process by exact ids, and process by folder matching, so we need a callback to specify return
        }); //why am i getting "Can't find parent bookmark for id" here?????
}

function moveNode(node, operation, callback) {
    //also need to use correct operation.parentId, duh!
    var parentId = getClientNewParentId(operation);  //use appropriate client value
    
    moveObj = {
        parentId: parentId
    }
    if (operation.folderindex >= 0) {
        moveObj.index = parseInt(operation.folderindex);
    } else {
        console.log("warning.  Folder Index is < 0"); //not sure why this happens
    }
    console.log("calling move()");
    console.log(moveObj);
    // console.log("_localtreeAssoc before:");
    // console.log(_localTreeAssoc[node.id]);
    chrome.bookmarks.move(node.id, moveObj, function(result) {
        // console.log("move callback.");
        // console.log(result);
        if (chrome.runtime.lastError) {
            console.log("movenode Failure: " + chrome.runtime.lastError.message);
            // some joker went and deleted these in chrome
            if (chrome.runtime.lastError.message == "Can't find parent bookmark for id." && (isBookmarksMenu(node) || isMobileBookmarks(node))) { //in chrome you can delete some special nodes, in firefox you can't
                console.log("Some joker deleted the root folders in Chrome.  You may have to reinstall.");
                sendStatus("Some joker deleted the root folders in Chrome.");
            }
            console.log(operation);
            console.log(node);
            _failed += 1;
            _failedOps.push(operation);
        } else {
            //_moved +=1;
            _moved += countTree(node);
            // do we need to update parentFolders?
            // console.log("_localtreeAssoc after move op:");  //it does NOT update automatically!
            // console.log(_localTreeAssoc[node.id]);
            // console.log(result);
            _localTreeAssoc[node.id] = result;

            //if op came from different client, and we added the folder, don't we also have to inform the server of the new parentId? 
             //no that should be taken care of applyOpToBookmarks in server, when op first found
             //no to the no - if the folder was added in this same operation there's no way we could have set it!  
             changedParent(operation,node);  //works same as addedId
        }
        //applyNextOp();
        if (callback) callback(); //this may be called from 2 different locations - process by exact ids, and process by folder matching, so we need a callback to specify return
    });
}
//singular create
function createBookmark(operation, callback = false, includeIndex = true) { //happens after duplicate check
    //create our success function  
    var creationCallback = function(result) {
        // console.log("Results from create " + node.title +":");
        // console.log(result);
        creationCallbackCont(operation, result, callback);
    }
    bookmark = node2bookmark(operation, includeIndex);
    pId = getParentId(operation);
    console.log(" Calling bookmarks.create : " + bookmark.title + "\n original parentId:" + pId + "  new parentId:" + bookmark.parentId);
    chrome.bookmarks.create(bookmark, creationCallback); //the money line
}

function creationCallbackCont(operation, result, callback) {
    // console.log("creationCallback node,result");
    // console.log(node);
    // console.log(result);
    if (!result) {
        // console.log(server2local(operation.parentId));
        if (chrome.runtime.lastError.message == "Index out of bounds.") { //not sure why this happens.  maybe index aren't 0 based?
            console.log("Warning.  Index out of bounds.  Trying again with no index.");
            createBookmark(operation, callback, false); //try it again without the index
            return;
        }
        if (chrome.runtime.lastError) {
            console.log("create Failure: " + chrome.runtime.lastError.message);
            console.log(node2bookmark(operation));
        } else {
            console.log("create Failure: no result returned");
        }
        console.log(operation);
        console.log(_server2localMap);
        _failed += 1;
        _failedOps.push(operation);
        // resetVariables();  //STOP EVERYTHING!
        // return;
        //applyNextOp();
        if (callback) callback();
        return;
    }
    _added += 1;
    //keep localTreeAssoc up to date
    result.parentFolders = getParentFolders(result);
    _localTreeAssoc[result.id] = result; //now does this link to the node in the tree... or just a copy?
    // console.log("setting id to id" + operation.id + "=" + result.id);
    updateMappings(operation, result);
    //inform the server of the new ids.
    addedId(operation, result);
    if (isDoneAdding()) { //only used for forceSync  -- we need this because applyNextOp triggers listeners to be on, and we don't want that 
        if (callback) callback();
    }
}

function addedId(serverNode, localNode) { //inform the server of the new ids.
    var origId = getOrigId(serverNode);
    var newId = localNode.id;

    if(origId == newId) return;

    newIds = { origClient: serverNode.parentClient, newClient: _clientID, origId: origId , newId: newId, newParentId: localNode.parentId, title: localNode.title, id: newId }; //refer to listener.php addedId()  //title for readability 
    //every node needs to have an id so we can say it was successfully processed by the server..*should* be okay if ids overlap as it removes and processes in the same order......  serious problems if one fails and the other doesn't though :(
    //sendToPhp("addedId", newIds);  //aah no, this spams the server!!!  grrrr
    console.log("addedId: '"+localNode.title+ "' " +origId+" to " + newId);
    
    // console.log(serverNode);
    // console.log(localNode);
    console.log(newIds);

    queueOpToServer("addedId", newIds);
}

function changedParent(serverNode,localNode){  //inform server of new parent id we moved into
    
    var origId = getOrigId(serverNode);
    var newId = localNode.id;
    newIds = { origClient: serverNode.parentClient, newClient: _clientID, origId: origId , newId: newId, newParentId: localNode.parentId, title: localNode.title, id: newId }; 

    console.log("changedParent: '"+localNode.title+ "' " +origId+" to " + newId);
    
    // console.log(serverNode);
    // console.log(localNode);
    console.log(newIds);

    queueOpToServer("changedParent", newIds);


}

function node2bookmark(node, includeIndex = true) {
    //create bookmark object suitable for create()
    var bookmark = {};
    // if(pND) console.log("creating bookmark "+node.title+", parentId: " + node.parentId + " -> " + old2new[node.parentId]);
    localParentId = server2local(getParentId(node)); //find client's name for that bookmark
    //sometimes special folders don't exist, so we know its a special folder but we don't have an ID for it, so just add it to the 'other bookmarks' folder.  It should still be caught by isSpecial() checking
    if (localParentId == _rootId) { //check if we are trying to add it to the root //it will error if we try to add to the root
        console.log("unaccounted for special folder.  Moving to other bookmarks and pretending its special");
        localParentId = _otherBookmarksId;
    }
    bookmark["parentId"] = localParentId; //replace it with the existing folder id
    if (includeIndex) bookmark["index"] = parseInt(node.folderindex); //index doesn't always line up if we moved folders around I don't update index
    bookmark["title"] = node.title;
    if (node.url != "") { //folders dont use urls
        bookmark["url"] = node.url;
    }
    return bookmark;
}
/////////////////////////////////////////////////////////////////////////////////  END PROCESS OPS FROM SERVER  //////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////  START GENERIC BOOKMARKS FUNCTIONS//////////////////////////////////////////////////////////////////////////////
function storeTreeIds(tree) { //used  for  adding things to those uneditable folders
    // //console.log("rootId:" + rootId + "  toolbarId:" + bookmarksBarId + "  Other bookmark id:"  + otherBookmarksId);
    if (!_rootId) { //should only have to do this once since these special folders never change
        tree = tree[0];
        _localTree = tree; //store the entire tree
        _rootId = tree.id;
        var i;
        for (i = 0; i < tree.children.length; i++) { //get all children in root
            var node = tree.children[i];
            node.parentFolders = "/"; // isToolbar, etc, checks if parent folders match too
            if (!node || !node.id) continue; //set to null in removeduplicates?
            if (isToolbar(node)) { //firefox and chrome
                _bookmarksBarId = node.id;
            } else if (isOtherBookmarks(node)) { //firefox and chrome
                _otherBookmarksId = node.id;
                otherBookmarksNode = node; //store for use below
            } else if (isBookmarksMenu(node)) { //firefox
                _bookmarksMenuId = node.id;
            } else if (isMobileBookmarks(node)) { //firefox
                _mobileBookmarksId = node.id;
            }
        }
        //mobilebookmarks and bookmarks menu exist only on chrome, will never be found in root on chrome
        if (!_mobileBookmarksId || !_bookmarksMenuId) { //chrome doesn't have these - I'm putting them in the other bookmarks folder.  Search there to get their ids
            for (i = 0; i < otherBookmarksNode.children.length; i++) { //get all children in root
                var node = otherBookmarksNode.children[i];
                node.parentFolders = "/"; // isToolbar, etc, checks if parent folders match too
                if (!node || !node.id) continue; //set to null in removeduplicates?
                if (isBookmarksMenu(node) && !_bookmarksMenuId) { //chrome - the !_ is important cuz theyu might have identical folders in root AND other bookmarks
                    _bookmarksMenuId = node.id;
                } else if (isMobileBookmarks(node) && !_mobileBookmarksId) {
                    _mobileBookmarksId = node.id;
                }
            }
        }
    }
    //    addAllSpecialFolders();  // all special folders are in root, so when adding, just check if parent id is root and change it to otherBookmarks!  doesn't need whole separate function
}

function isSpecialNode(node) { //certain nodes are not editable
    var specialId = null;
    // console.log("isSPecialNode() check");
    if (isRoot(node)) {
        return true;
    } else if (isToolbar(node)) { //firefox and chrome
        return true;
    } else if (isOtherBookmarks(node)) { //firefox and chrome
        return true;
    } else if (isBookmarksMenu(node)) { //firefox
        return true;
    } else if (isMobileBookmarks(node)) { //firefox
        return true;
    } else if (isSeparator(node)) { //firefox
        console.log("skipping.");
        return true;
    } else if (isEmpty(node)) { //firefox
        return true;
    }
    return false;
}

function isRoot(node) {
    id = getId(node);
    if (id == "0" || id == "root________") { //parentId not valid to check cuz some operations don't include parent id (rename)
        // console.log("root found");
        return true; //chrome and firefox
    }
    return false;
}

function isOtherBookmarks(node) {
    id = getId(node);
    if (id == "unfiled_____" || ((node.title == "Other Bookmarks" || node.title == "Other bookmarks") && node.parentFolders == "/")) { //firefox uppercase and chrome lowercase
        return true;
    }
    return false;
}

function isToolbar(node) {
    id = getId(node);
    if (id == "toolbar_____" || ((node.title == "Bookmarks Toolbar" || node.title == "Bookmarks bar") && node.parentFolders == "/")) { //firefox and chrome
        return true;
    }
    return false;
}

function isBookmarksMenu(node) {
    id = getId(node);
    if (id == "menu________" || (node.title == "Bookmarks Menu" && (node.parentFolders == "/" || node.parentFolders == "/Other Bookmarks/" || node.parentFolders == "/Other bookmarks/"))) { //firefox  //if its called bookmarks Menu and parentFolders is root
        return true;
    }
    return false;
}

function isMobileBookmarks(node) {
    id = getId(node);
    if (id == "mobile______" || (node.title == "Mobile Bookmarks" && (node.parentFolders == "/" || node.parentFolders == "/Other Bookmarks/" || node.parentFolders == "/Other bookmarks/"))) { //firefox
        return true;
    }
    return false;
}

function isSeparator(node) {
    if (node.title == "" && node.url == "data:") { //firefox
        return true;
    }
    return false;
}

function isEmpty(node) {
    if (node.title == "" && node.url == "") {
        return true;
    }
    return false;
}

function updateTime(timestamp) { //value is stored in global _lastUpdate and storage -used to keep track of last time we updated from server.  Very important!  IMPORANT: use SERVER time!
    //    sendToPhp("lastUpdate");  //this is wrong.  I should not send a separate request for the time.  The time should be stored in the operations I process, in the unlikely case someone changes a bookmark WHILE these operations are being processed.  I should probably use the included timestamps
    if (timestamp < _lastUpdate) {
        console.log("Warning - lastUpdate time is going backwards." + _lastUpdate + " to " + timestamp);
    }
    chrome.storage.local.set({ lastUpdate: timestamp }); //store the last time we updated
    _lastUpdate = timestamp;
    console.log("setting lastUpdate to " + timestamp);
}

function urldecode(url) {
    if (!url) return null;
    return decodeURIComponent(url.replace(/\+/g, ' '));
}

function server2local(id) { //return the local id that corresponds with the server id
    if (!id) return null;
    var newId = _server2localMap.get(id); //problems if it doesn't exist!  Must be careful to only create one bookmark at a time and get the Id before adding next
    if (!newId || newId == null || newId == undefined) {
        //        console.log("Match not found.  using "+id);
        return id; //return as-is
    }
    return newId;
}

function rebuildBookmarks() { //they clicked the rebuild button.  Deletes all bookmarks and rebuilds from OPs on server.
    //toggleIcon();
    listenersOff();
    updateTime(0); //since the beginning of time
    //delete all bookmarks
    deleteAllBookmarks();
    //fetch all operations from server
    updateStart();
    storeTree(); //can't do this until all bookmarks are deleted.. sigh
    //toggleIcon();
}

function deleteAllBookmarks(callback = storeTree) {
    console.log("Deleting all bookmarks.");
    _deleted = 0;
    //delete/remove ALL bookmarks
    console.log(_localTree);
    children = getChildren(getRootNode());
    console.log(children);
    var treesStarted = 0;
    for (i = 0; i < count(children); i++) { //root
        child = children[i];
        // console.log(child);
        children2 = getChildren(child); //children of other bookmarks and bookmarks bar
        for (j = 0; j < count(children2); j++) {
            child2 = children2[j];
            if (!child2) continue; //sometimes it stores null values in the children array, I don't know why
            treesStarted += 1;
            chrome.bookmarks.removeTree(child2.id, function(result) {
                treesStarted -= 1;
                if (chrome.runtime.lastError) {
                    console.log(chrome.runtime.lastError.message);
                    console.log(result);
                    console.log(child2);
                }
                if (treesStarted <= 0) { //when every tree is complete, we can exit
                    callback();
                }
            }); //delete everything
        }
    }
    //localTree becomes invalid.. should delete it after all callbacks complete.  ah well. callbacks.  pfft. I'd have to count every async call and keep checking they are all complete.  Too much work
    showOperationResults();
    storeTree();
}

function getRootNode() {
    //sometimes _localTree is an array length 1, sometimes it is an object of children.  grrr....
    if (_localTree.length == 1) { //its an array
        return _localTree[0];
    }
    return _localTree;
}

function isPopupVisible() { //required for firefox before sending any message ore we get the stupid message 'receiveing end does not exist'
    var views = chrome.extension.getViews({ type: "popup" }); //https://stackoverflow.com/questions/8920953/how-determine-if-the-popup-page-is-open-or-not
    if (views.length > 0) {
        //   console.log("Popup is visible");
        return true;
    }
    return false;
}

function deleteHistory() {
    _opsToServer = "";
    sendToPhp("deleteHistory"); //install happens in the callback
}

function removeDuplicates() { //just from local
    console.log("removing duplicates.");
    processOpsToServer(); //immediately send to server
    //get a fresh tree
    storeTree(removeDuplicatesCont);
}

function removeDuplicatesCont(tree) {
    listenersOn(); //if listeenrs are on, the correct ops should automatically be sent to the server.. I hope.
    var bgen = bookmarkGenerator(tree);
    for (node of bgen) {
        if (isFolder(node)) { //for every folder
            removeDuplicatesInFolder(node);
        }
    }
    storeTree(); //update _localtree since we probably did a bunch of changes to it
}

function removeDuplicatesInFolder(folderNode) {
    var children = folderNode.children;
    var i, j, node1, node2;
    var flen = children.length;
    //compare every node against every other one in the folder
    for (i = 0; i < flen; i++) {
        for (j = i; j < flen; j++) {
            if (i == j) continue;
            node1 = children[i];
            node2 = children[j];
            if (node1.title == node2.title && node1.url == node2.url) {
                if (isFolder(node1)) {
                    mergeFolders(node1, node2);
                } else {
                    console.log("deleting " + node2.title);
                    chrome.bookmarks.remove(node2.id,function(){
                        if (chrome.runtime.lastError) { //trap errors
                            console.log(chrome.runtime.lastError.message);
                            console.log(node2);
                        }
                    }); //always remove the j node, keep the i --this may result in multiple delete requests on the same node if there's 3 matches
                }
            }
        }
    }
}

function mergeFolders(from, to) { //everything in from folder, set its parentid to the to folder
    console.log("mergeFolders " + to.title);
    //loop through children in from
    if (isSpecialNode(from)) { //some joker created a duplicate of a special folder, grumble grumble
        [from, to] = [to, from]; //https://stackoverflow.com/questions/16201656/how-to-swap-two-variables-in-javascript
    }
    var clen = from.children.length;
    var i, node, moveObj;
    for (i = 0; i < clen; i++) {
        node = from.children[i];
        moveObj = { parentId: to.id }
        chrome.bookmarks.move(node.id, moveObj,function(result){
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
            console.log(result);
        }
        });
    }
    try { //removeDuplicatesCont() might have already reached this folder, since processing happens at the same time
        console.log("removing tree " + from.id + " " + from.title);
        chrome.bookmarks.removeTree(from.id,function(){
        if (chrome.runtime.lastError) { //trap errors
            console.log(chrome.runtime.lastError.message);
            console.log(tree);
        }
        }); //might have to wait until the moves complete?  This might break generator?
        //removeDuplicatesInFolder(to); //there's almost certain to be duplicates  //removeDuplicatesCont should catch this
    } catch (e) {
        console.log("Error.  Failed to remove duplicate");
        console.log(e);
        console.log(from);
        console.log(to);
    }
}

function isFolder(node) {
    if (!node.url || node.url == '' || node.children) {
        return true;
    }
    return false;
}

function getParentFolders(node) {
    //if (!node.parentId) return "";
    var parentId = getParentId(node);
    var path = "";
    while (parentId) { //goes till we hit root folder
        parentNode = _localTreeAssoc[parentId]; //fast lookup
        if (!parentNode) {
            console.log("Error in getParentFolder.  node for " + parentId + " not found.");
            break;
        }
        path = parentNode.title + '/' + path; //prepend it
        parentId = getParentId(parentNode);
    }
    // console.log("path of :"+node.title+" :"+path);
    return path;
}

function getParentId(node) {
    if(!node) return false;
    if (node.parentId) return node.parentId; //local node
    if (node.parentClient) {
        idCol = _clientID + "_parentId"; //changeserver2client *should* have set this
        if (node[idCol]) { //server node
            parentId = node[idCol];
            return parentId;
        }
        idCol = node.parentClient + "_parentId"; //this should not be seen.. not sure why i'm checking it...
        if (node[idCol]) { //server node
            parentId = node[idCol];
            return parentId;
        }
    }
    cacheNode = _localTreeAssoc[getId(node)]; //we did something that didn't include the parentId (a rename)
    if (!cacheNode) {
        console.log("getParentId().  cache not found for: " + getId(node));
        console.log(node);
        return false;
    }
    if (cacheNode.parentId) return cacheNode.parentId;
    return false;
}

function getChildren(node) {
    if(!node) return false;
    if (node.children) return node.children;
    if (node[0]) return node; //its an array, for some reason we got passed an array
    //if(node[0] && node[0].children) return node[0].children;  //children  is actually an array, sometimes they might pass in the array, not the node itself 
    return false;
}

function resetVariables() {
    console.log("Resetting Variables.");
    //after error any sort of callback or counter will not work right.  Reset them all
    _importing = false;
    clearInterval(_queueTimer);
    _queueTimer = null;
    //_opsToServer = [];  //no - we need this to persist even if they log off/quit
    _dataFromServer = [];
    _dataCounter = 0;
    _catchInfiniteCounter = 0;
    listenersOn();
    _added = 0;
    _deleted = 0;
    _moved = 0;
    _renamed = 0;
    _existed = 0;
    _failed = 0;
    _skipped = 0;
    _fixed = 0;
    _serverBsNotMatched = [];
    _failedOps = [];
    blinkIcon(false); //stop blinking
}
//######################################################################################################################################################################
//############################################################## END BOOKMARKS FUNCTIONS ########################################################################################################
//############################################################## START SYNC BOOKMARKS #######################################################
function forceSyncStart(tree = false) {
    if (!tree) {
        //update the _localTreeAssoc to make sure it is perfect
        storeTree(forceSyncStart); //will call itself again when things are up to date
        return;
    }
    sendStatus("Forcing sync.  Please wait.");
    blinkIcon();
    sendToPhp("forceSync"); //leads to forceSync
}

function forceSync(serverBs) { //called from background.js 
    sendStatus("Syncing.  " + count(serverBs) + " server bookmarks, " + count(_localTreeAssoc) + " local bookmarks.");
    resetVariables();
    blinkIcon();
    _dataFromServer = serverBs; //store it in a global because we are about to do async searching
    _dataCounter = 0;
    _server2localMap.clear();
    console.log("\nSYNCING OP " + _dataCounter + " " + serverBs[0].title);
    console.log(serverBs[0]);
    findLocalMatch(serverBs[0], forceSyncCont); //start the looping - note the callback
}

function forceSyncCont(serverB, localB) { //continuting the forced sync.. see callback above
    //toggleIcon();
    //isn't updating in real time :(
    // if(_dataCounter % 100 == 0){  
    //     sendStatus(".");  //keep user informed we are still processing
    // }
    // console.log("server, local");
    // console.log(serverB);
    // console.log(localB);
    var fixFound, lpf, spf; //having problems, its saying folders do not match, value doesn't seem to be updated fast enough in object
    if (localB) { //if match found
        console.log("Sync match found with id " + localB.id);
        console.log(localB);
        fixFound = false; //for stats reporting
        sId = getId(serverB);
        if (!sId) {
            console.log("id is null?");
            sId = getId(serverB);
            addedId(serverB, localB); //change parentId in DB to match localB
        }
        // no need to delete! thats what server2local map is for!  localMatch won't accept it if it was already matched!
        //this happens if they interrupted an operation, made a change while importing, etc
        if (!isSpecialNode(localB) && getParentId(localB) != getParentId(serverB)) {
            console.log("local parentId " + localB.parentId + " does not match " + getParentId(serverB) + ".  Sending addedId for " + localB.title);
            addedId(serverB, localB); //change parentId in DB to match localB
            fixFound = true;
        }
        //sometimes parent folders don't match - force update to server
        // if(serverB.primarykey == "21"){
        //     console.log("debug");
        // }
        if (!localB.parentFolders) {
            localB.parentFolders = getParentFolders(localB); //local will never have parentFolders set, gotta figure them out from the cache
        } else {
            console.log("warning, somehow parentfolders are set?");
        }
        localB = fixSpecialFolders(localB);
        lpf = localB.parentFolders;
        spf = serverB.parentFolders;
        if (lpf != spf && !isSpecialNode(localB)) {
            console.log("parentFolders do not match. local:" + localB.parentFolders + " server:" + serverB.parentFolders + " Sending updateparentfolder for " + localB.title);
            // console.log(localB.parentFolders);  //  shows "/"
            // console.log(serverB.parentFolders); //  shows "/Other bookmarks/"
            // console.log(localB);                // shows "/Other bookmarks/" !
            // console.log(serverB);               // shows "/Other bookmarks/" 
            // console.log(getParentFolders(localB)); // shows "/Other bookmarks/" 
            // localB.parentFolders = getParentFolders(localB); 
            // console.log(localB.parentFolders);    // shows "/Other bookmarks/" 
            // console.log(_localTreeAssoc);
            fixFound = true;
            queueOpToServer("updateparentfolder", localB); //prepareForDB will set each parentFolders
        }
        _server2localMap.set(sId, localB.id);
        if (fixFound) {
            _fixed += 1;
        } else {
            _skipped += 1;
        }
    } else { //if no match found
        console.log("No match found");
        _serverBsNotMatched.push(serverB);
    }
    _dataCounter += 1;
    if (forceSyncComplete()) {
        console.log("process complete");
        return;
    }
    //
    //next, please
    nextB = _dataFromServer[_dataCounter];
    console.log("\nSYNCING OP " + _dataCounter + " " + serverB.title); // very helpful but  spammny
    console.log(serverB);
    findLocalMatch(nextB, forceSyncCont); //will loop after async call completes
}

function forceSyncComplete() {
    if (_dataCounter < count(_dataFromServer)) { // are we done?
        return false;
    }
    sendStatus("Syncing.  Do not make any changes.");
    lCount = count(_localTreeAssoc);
    s2lCount = count(_server2localMap);
    sCount = count(_serverBsNotMatched);
    console.log("s2lCount:" + s2lCount, " lcount:" + lCount + " scount:" + sCount);
    console.log(_serverBsNotMatched);
    lCount = lCount - s2lCount; //s2l contains the ids of all matched
    if (lCount > 0) {
        sendStatus(lCount + " local Bookmarks not matched. Sending to server.");
        // console.log(_localTreeAssoc);
    }
    if (lCount != sCount - s2lCount) {
        console.log("error.  discrepancy in comparision.  Not all server nodes matched but _serverBsNotMatched doesn't have the right count");
        console.log(_server2localMap);
        console.log(_serverBsNotMatched);
        console.log(_localTreeAssoc);
    }
    if (sCount > 0) {
        sendStatus(sCount + " server Bookmarks not matched.  Creating.");
        console.log(_serverBsNotMatched);
    }
    if (lCount == 0 && sCount == 0) {
        sendStatus("Already synced.")
        return true;
    }
    //problem here - processOpsToServer turns on listeners when it completes.  wil have to call procesOpsToServer after bookmarks are all added
    // sendStatus("Sending "+lCount+" differences to server.");
    // processOpsToServer(); //duuur i forgot to call this
    listenersOff(); //problem here - processOpsToServer turns on listeners when it completes.  wil have to call procesOpsToServer after bookmarks are all added
    sendStatus("Creating " + sCount + " bookmarks.");
    _adding = sCount; //check this after every creation
    for (node of _serverBsNotMatched) {
        createBookmark(node); //isdoneadding checked after every add
    }
    isDoneAdding(); //incase there were zero to add
    showOperationResults();
    // blinkIcon(false);  //stop blinking
    //listenersOn();  //we can't do this.  CreateBookmarks happen asyncronously.  In reality we will call createBookmark(), turn on listeners, and THEN the bookmarks will be created - creating duplicates on the server :(  the only soluction is count incoming and successful adds and only when they are the same can we turn on listeners again
    //storeTree(); //rebuild localTreeAssoc - although it won't be accurate until handlers complete.... grr...
    return true;
}

function isDoneAdding() { //checks if adding = 0, then turns on addon again  //used in forceSync
    if (_adding == null) return true; //it was not set
    showOperationResults();
    _adding -= 1;
    if (_adding <= 0) { //are we done?
        blinkIcon(false); //stop blinking
        listenersOn(); //we can't do this.  CreateBookmarks happen asyncronously.  In reality we will call createBookmark(), turn on listeners, and THEN the bookmarks will be created - creating duplicates on the server :(  the only soluction is count incoming and successful adds and only when they are the same can we turn on listeners again
        storeTree(); //rebuild localTreeAssoc - although it won't be accurate until handlers complete.... grr...
        sendStatus("Sending " + count(_localTreeAssoc) + " differences to server.");
        console.log("Local Sync Complete.");
        // var key;
        for (key in _localTreeAssoc) { //whatevers left over
            // console.log("queue");
            queueOpToServer("add", _localTreeAssoc[key]); //rather than risk deleting bookmarks, i'd rather we have duplicates, so re-add them to server
        } //do this AFTER local bookmarks are created because it turns on listeners when completed
        processOpsToServer(); //duuur i forgot to call this
        sendStatus("Sync Complete.  You may now make changes.");
        _adding = null;
        return true;
    }
    return false;
}

function count(arr) {
    // console.log("Count");  //for some reason length is getting set to the value of the last key?!?
    // console.log(arr);
    if (arr.length) { //its undefined for assoc arrays
        return arr.length;
    }
    //if its a map
    if (arr instanceof Map) {
        return arr.size;
    }
    //its associative array
    var keys = Object.keys(arr);
    // console.log(keys);
    return keys.length;
}
//######################################################################################################################################################################
//############################################################## END sYNC BOOKMARKS #######################################################
function deleteTablesStart() {
    //storeTree(deleteAllBookmarks);
    sendToPhp("deleteTables");
}

function deleteTables() { //after server sends back results
    listenersOff();
    resetVariables();
    _opsToServer = [];
    deleteAllBookmarks(deleteTablesCont);
    resetVariables();
    _opsToServer = [];
}

function deleteTablesCont() { //the callback to deleteAllBookmarks
    listenersOn(); //deleted tables was a success, now we can re-install
    installStart();
}

function blinkIcon(blink = true) {
    // console.log("BlinkIcon called " + blink);
    if (!blink) { //turn it off
        chrome.browserAction.setIcon({ path: 'icons/icon_96_on.png' }); //reset to default
        //console.log("Killing blink!")
        clearInterval(_blinkTimer); //https://stackoverflow.com/questions/452003/how-to-cancel-kill-window-settimeout-before-it-happens-on-the-client
        _blinkTimer = null;
        return;
    }
    if (_blinkTimer) { //if its already blinking
        return;
    }
    _blinkTimer = setInterval(toggleIcon, 300); //this makes it keep blinking indefinitely until explicitly killed 
}

function clearall() {
    console.log("clearing everything");
    chrome.storage.local.clear();
    resetVariables();
    _opsToServer = [];
}

function replaceOnce(str, from, to) {
    pos = str.indexOf(from);
    if (pos > -1 && pos <= 2) { //only find matches at the very beginning of the string
        //       console.log("changing " + from + " to " + to + " in " + str);
        str = str.replace(from, to); //by default only replaces one, good\
    }
    return str;
}